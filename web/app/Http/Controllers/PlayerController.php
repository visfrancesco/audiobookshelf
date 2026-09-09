<?php

namespace App\Http\Controllers;

use App\Services\ShelfApi;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PlayerController extends Controller
{
    public function start(Request $request, ShelfApi $api): JsonResponse
    {
        $data = $request->validate(['itemId' => 'required|uuid', 'episodeId' => 'nullable|uuid', 'mode' => 'required|in:audio,video', 'startTime' => 'nullable|numeric|min:0']);
        if (! session('shelf.device_id')) {
            session(['shelf.device_id' => (string) Str::uuid()]);
        }
        $options = ['mode' => $data['mode'], 'mediaPlayer' => 'KnowledgeShelf web', 'supportedMimeTypes' => ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/ogg', 'audio/wav'],
            'deviceInfo' => ['deviceId' => session('shelf.device_id'), 'clientName' => 'KnowledgeShelf', 'clientVersion' => '2.37.0', 'deviceName' => 'Web browser']];
        if (isset($data['startTime'])) {
            $options['startTime'] = (float) $data['startTime'];
        }
        $session = $api->post('/api/items/'.$data['itemId'].'/play'.(! empty($data['episodeId']) ? '/'.$data['episodeId'] : '').'?includeVideoEpisodes=1', $options);
        if (! empty($session['media']['contentUrl'])) {
            $session['media']['contentUrl'] = $api->publicUrl($session['media']['contentUrl']);
        }
        foreach ($session['audioTracks'] as &$track) {
            $track['contentUrl'] = $api->publicUrl($session['playMethod'] === 0 ? '/public/session/'.$session['id'].'/track/'.($track['index'] ?? 1) : $track['contentUrl']);
            unset($track['metadata']);
        }
        unset($track, $session['libraryItem'], $session['coverPath']);
        session(['shelf.playback_id' => $session['id']]);

        return response()->json($session);
    }

    public function sync(Request $request, ShelfApi $api): JsonResponse
    {
        $data = $request->validate(['sessionId' => 'required|uuid', 'currentTime' => 'required|numeric|min:0', 'duration' => 'required|numeric|min:0', 'timeListened' => 'required|numeric|min:0|max:300', 'close' => 'sometimes|boolean']);
        foreach (['currentTime', 'duration', 'timeListened'] as $key) {
            $data[$key] = (float) $data[$key];
        }
        $id = $data['sessionId'];
        unset($data['sessionId']);
        $api->post("/api/session/$id/".($request->boolean('close') ? 'close' : 'sync'), $data);

        return response()->json(['saved' => true]);
    }

    public function readerProgress(Request $request, ShelfApi $api, string $id): JsonResponse
    {
        $data = $request->validate(['ebookLocation' => 'required|string|max:5000', 'ebookProgress' => 'required|numeric|min:0|max:1']);
        $data['ebookProgress'] = (float) $data['ebookProgress'];
        $api->patch("/api/me/progress/$id", $data);

        return response()->json(['saved' => true]);
    }
}
