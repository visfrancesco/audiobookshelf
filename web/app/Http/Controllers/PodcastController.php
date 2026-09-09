<?php

namespace App\Http\Controllers;

use App\Services\ShelfApi;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\View as Views;
use Illuminate\Support\Str;
use Illuminate\View\View;

class PodcastController extends Controller
{
    public function show(): View
    {
        return view('podcasts.add', ['preview' => null]);
    }

    public function preview(Request $request, ShelfApi $api): View
    {
        $data = $request->validate(['rssFeed' => 'required|url|max:4000']);
        $preview = $api->post('/api/podcasts/feed', $data)['podcast'];
        session(['podcast_preview' => ['url' => $data['rssFeed'], 'metadata' => $preview['metadata'], 'expires' => now()->addMinutes(30)->timestamp]]);

        return view('podcasts.add', compact('preview'));
    }

    public function store(Request $request, ShelfApi $api): RedirectResponse
    {
        $data = $request->validate(['libraryId' => 'required|uuid', 'libraryFolderId' => 'required|uuid', 'title' => 'required|string|max:300', 'schedule' => 'nullable|string|max:100', 'maxEpisodesToKeep' => 'required|integer|min:0|max:10000']);
        $preview = session('podcast_preview');
        abort_unless($preview && $preview['expires'] >= now()->timestamp, 422, 'Preview the RSS feed again before adding it.');
        $library = collect(Views::shared('libraries'))->firstWhere('id', $data['libraryId']);
        $folder = collect($library['folders'] ?? [])->firstWhere('id', $data['libraryFolderId']);
        abort_unless($folder && $library['mediaType'] === 'podcast', 422, 'Select a podcast library and folder.');
        $metadata = [...$preview['metadata'], 'title' => $data['title'], 'feedUrl' => $preview['url']];
        $item = $api->post('/api/podcasts', ['libraryId' => $data['libraryId'], 'folderId' => $data['libraryFolderId'], 'path' => rtrim($folder['fullPath'], '/').'/'.(Str::slug($data['title']) ?: 'podcast').'-'.Str::random(8), 'media' => ['metadata' => $metadata, 'autoDownloadEpisodes' => $request->boolean('autoDownloadEpisodes'), 'autoDownloadSchedule' => ($data['schedule'] ?? '') ?: '0 * * * *', 'maxEpisodesToKeep' => (int) $data['maxEpisodesToKeep']]]);
        session()->forget('podcast_preview');

        return redirect()->route('podcasts.episodes', $item['id'])->with('status', 'Podcast added. Choose episodes to download.');
    }

    public function episodes(Request $request, ShelfApi $api, string $id): View
    {
        $item = $api->get("/api/items/$id", ['expanded' => 1, 'includeVideoEpisodes' => 1]);
        $url = $item['media']['metadata']['feedUrl'] ?? null;
        $feed = $url ? $api->post('/api/podcasts/feed', ['rssFeed' => $url])['podcast'] : ['episodes' => []];
        $episodes = $feed['episodes'] ?? [];
        $total = count($episodes);
        $page = max(1, min(10000, $request->integer('page', 1)));
        $episodes = array_slice($episodes, ($page - 1) * 30, 30);
        session(["podcast_episodes.$id" => $episodes]);
        $downloads = $api->get("/api/podcasts/$id/downloads")['downloads'];

        return view('podcasts.episodes', compact('item', 'episodes', 'total', 'downloads'));
    }

    public function action(Request $request, ShelfApi $api, string $id, string $action): RedirectResponse
    {
        if ($action === 'download') {
            $selected = $request->validate(['episodes' => 'required|array|min:1|max:30', 'episodes.*' => 'required|integer|min:0|max:29'])['episodes'];
            $available = session("podcast_episodes.$id", []);
            $episodes = [];
            foreach (array_unique($selected) as $index) {
                abort_unless(isset($available[$index]), 422, 'Reload the episode list before downloading.');
                $episodes[] = $available[$index];
            }
            $api->post("/api/podcasts/$id/download-episodes", $episodes);
        } elseif ($action === 'check') {
            $api->get("/api/podcasts/$id/checknew", ['limit' => 10]);
        } elseif ($action === 'clear') {
            $api->get("/api/podcasts/$id/clear-queue");
        } elseif ($action === 'remove') {
            $episodeId = $request->validate(['episodeId' => 'required|uuid'])['episodeId'];
            $api->delete("/api/podcasts/$id/episode/$episodeId");
        } elseif ($action === 'schedule') {
            $data = $request->validate(['schedule' => 'required|string|max:100', 'maxEpisodesToKeep' => 'required|integer|min:0|max:10000']);
            $api->patch("/api/items/$id/media", ['autoDownloadEpisodes' => $request->boolean('autoDownloadEpisodes'), 'autoDownloadSchedule' => $data['schedule'], 'maxEpisodesToKeep' => (int) $data['maxEpisodesToKeep']]);
        } else {
            abort(404);
        }

        return back()->with('status', 'Podcast updated.');
    }
}
