<?php

namespace App\Http\Controllers;

use App\Services\ShelfApi;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;
use Symfony\Component\HttpKernel\Exception\HttpException;

class KnowledgeController extends Controller
{
    public function sources(Request $request, ShelfApi $api): View
    {
        $sources = $api->get('/api/knowledge/sources', ['limit' => 30, 'offset' => max(0, $request->integer('page', 1) - 1) * 30]);

        return view('knowledge.sources', compact('sources'));
    }

    public function saveSource(Request $request, ShelfApi $api, ?string $id = null): RedirectResponse
    {
        $data = $request->validate(['name' => 'required|string|max:300', 'url' => 'required|url|max:2000', 'libraryId' => 'required|uuid', 'libraryFolderId' => 'required|uuid', 'mode' => 'required|in:audio,video', 'intervalMinutes' => 'required|integer|min:15|max:10080', 'retentionDays' => 'required|integer|min:0|max:3650', 'maxItems' => 'required|integer|min:1|max:100', 'startDate' => 'nullable|date_format:Y-m-d']);
        foreach (['intervalMinutes', 'retentionDays', 'maxItems'] as $key) {
            $data[$key] = (int) $data[$key];
        }
        $data['enabled'] = $request->boolean('enabled');
        if ($id) {
            $api->patch("/api/knowledge/sources/$id", $data);
        } else {
            $api->post('/api/knowledge/sources', $data);
        }

        return redirect()->route('sources')->with('status', $id ? 'Source updated.' : 'Source added.');
    }

    public function source(ShelfApi $api, string $id): View
    {
        $source = $api->get("/api/knowledge/sources/$id");
        $assets = $api->get("/api/knowledge/sources/$id/assets", ['limit' => 100]);

        return view('knowledge.source', compact('source', 'assets'));
    }

    public function sourceAction(Request $request, ShelfApi $api, string $id, string $action): RedirectResponse
    {
        if ($action === 'check') {
            $api->post("/api/knowledge/sources/$id/check");
        } elseif ($action === 'delete') {
            $api->delete("/api/knowledge/sources/$id");

            return redirect()->route('sources')->with('status', 'Source removed. Imported media stays in your library.');
        } elseif ($action === 'pause') {
            $api->patch("/api/knowledge/sources/$id", ['enabled' => false]);
        } elseif ($action === 'resume') {
            $api->patch("/api/knowledge/sources/$id", ['enabled' => true]);
        } elseif ($action === 'refresh') {
            $api->post("/api/knowledge/assets/$id/refresh");
        } else {
            abort(404);
        }

        return back()->with('status', 'Source updated.');
    }

    public function adopt(Request $request, ShelfApi $api): View|RedirectResponse
    {
        $data = $request->validate(['sourceId' => 'required|string|max:100', 'name' => 'required|string|max:300', 'url' => 'required|url|max:2000']);
        $result = $api->post('/api/knowledge/pinchflat/'.($request->boolean('confirmed') ? 'adopt' : 'preview'), $data);
        if ($request->boolean('confirmed')) {
            return redirect()->route('sources')->with('status', $result['adopted'].' episodes adopted. Existing originals and progress are preserved.');
        }

        return view('knowledge.adopt', compact('data', 'result'));
    }

    public function documents(Request $request, ShelfApi $api): View
    {
        $documents = $api->get('/api/knowledge/documents', ['limit' => 30, 'offset' => max(0, $request->integer('page', 1) - 1) * 30]);
        $status = $api->get('/api/knowledge/status');

        return view('knowledge.documents', compact('documents', 'status'));
    }

    public function createDocument(Request $request, ShelfApi $api): RedirectResponse
    {
        $data = $request->validate(['title' => 'required|string|max:300', 'author' => 'nullable|string|max:300', 'libraryId' => 'required|uuid', 'libraryFolderId' => 'required|uuid', 'text' => 'nullable|string|max:1000000', 'url' => 'nullable|url|max:4000', 'file' => 'nullable|file|max:20480|mimes:txt,md,html,htm,pdf,epub,docx']);
        unset($data['file']);
        $data = array_filter($data, fn ($value) => $value !== null && $value !== '');
        $doc = $api->call('POST', '/api/knowledge/documents', $data, files: $request->hasFile('file') ? ['file' => $request->file('file')] : []);

        return redirect()->route('document', $doc['id'])->with('status', 'Document added. Review its text before creating audio.');
    }

    public function document(ShelfApi $api, string $id): View
    {
        $document = $api->get("/api/knowledge/documents/$id");
        $status = $api->get('/api/knowledge/status');
        $voices = [];
        if ($status['elevenLabs'] && (session('shelf.user.permissions.upload') || in_array(session('shelf.user.type'), ['root', 'admin']))) {
            try {
                $voices = $api->get('/api/knowledge/voices')['voices'];
            } catch (HttpException $e) {
                if ($e->getStatusCode() < 500) {
                    throw $e;
                }
            }
        }

        return view('knowledge.document', compact('document', 'status', 'voices'));
    }

    public function saveDocument(Request $request, ShelfApi $api, string $id): RedirectResponse
    {
        $data = $request->validate(['title' => 'required|string|max:300', 'author' => 'nullable|string|max:300', 'text' => 'required|string|max:1000000']);
        $api->patch("/api/knowledge/documents/$id", $data);

        return back()->with('status', 'Preview saved.');
    }

    public function generate(Request $request, ShelfApi $api, string $id): RedirectResponse
    {
        $data = $request->validate(['approved' => 'accepted', 'contentHash' => 'required|string|max:100', 'voiceId' => 'required|string|max:100', 'modelId' => 'required|in:eleven_multilingual_v2,eleven_turbo_v2_5,eleven_flash_v2_5', 'maxCharacters' => 'required|integer|min:1|max:1000000']);
        unset($data['approved']);
        $data['maxCharacters'] = (int) $data['maxCharacters'];
        $api->post("/api/knowledge/documents/$id/generate", $data);

        return back()->with('status', 'Narration queued. You can follow its progress below.');
    }

    public function removeDocument(ShelfApi $api, string $id): RedirectResponse
    {
        $api->delete("/api/knowledge/documents/$id");

        return redirect()->route('documents')->with('status', 'Document and caches removed. Its library audiobook remains.');
    }

    public function jobs(): View
    {
        return view('knowledge.jobs');
    }
}
