<?php

namespace App\Http\Controllers;

use App\Services\ShelfApi;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\View;

class CatalogController extends Controller
{
    public function home(ShelfApi $api): \Illuminate\View\View|RedirectResponse
    {
        $libraries = View::shared('libraries', []);
        if (! $libraries) {
            return view('catalog.empty');
        }
        $id = collect($libraries)->contains('id', session('shelf.default_library')) ? session('shelf.default_library') : $libraries[0]['id'];

        return redirect()->route('library', $id);
    }

    public function library(Request $request, ShelfApi $api, string $id): \Illuminate\View\View
    {
        $library = collect(View::shared('libraries', []))->firstWhere('id', $id);
        abort_unless($library, 404);
        session(['shelf.default_library' => $id]);
        $view = $request->query('view', 'items');
        abort_unless(in_array($view, ['items', 'series', 'authors', 'narrators', 'collections', 'playlists', 'recent-episodes', 'stats']), 404);
        $page = max(1, min(10000, $request->integer('page', 1)));
        $query = ['limit' => 30, 'page' => $page - 1, 'minified' => 1, 'includeVideoEpisodes' => 1, 'include' => 'progress', 'sort' => $request->query('sort', 'media.metadata.title'), 'desc' => $request->boolean('desc') ? 1 : 0];
        if ($request->filled('filter')) {
            $query['filter'] = $request->string('filter')->toString();
        }
        if ($request->filled('q')) {
            $data = $api->get("/api/libraries/$id/search", ['q' => $request->string('q')->limit(300)->toString(), 'limit' => 60, 'includeVideoEpisodes' => 1]);
            $items = array_map(fn ($match) => $match['libraryItem'] ?? $match, array_merge($data['book'] ?? [], $data['podcast'] ?? []));
            $view = 'items';
            $total = count($items);
        } else {
            $data = $api->get("/api/libraries/$id/$view", $query);
            $items = $data['results'] ?? $data[$view] ?? (array_is_list($data) ? $data : []);
            $total = $data['total'] ?? count($items);
        }
        $covers = $view === 'items' ? $api->tickets(array_map(fn ($item) => '/items/'.$item['id'].'/cover', $items)) : [];
        $paginator = new LengthAwarePaginator($items, $total, 30, $page, ['path' => $request->url(), 'query' => $request->except('page')]);

        return view('catalog.library', compact('library', 'view', 'data', 'items', 'covers', 'paginator'));
    }

    public function item(Request $request, ShelfApi $api, string $id): \Illuminate\View\View
    {
        $item = $api->get("/api/items/$id", ['expanded' => 1, 'includeVideoEpisodes' => 1, 'include' => 'progress,rssfeed']);
        $bookmarks = $api->get("/api/me/bookmarks/$id");
        $cover = $api->tickets(["/items/$id/cover"])["/items/$id/cover"];
        $lists = [
            'collections' => $item['mediaType'] === 'book' ? $api->get('/api/libraries/'.$item['libraryId'].'/collections', ['limit' => 100, 'page' => 0])['results'] : [],
            'playlists' => $api->get('/api/libraries/'.$item['libraryId'].'/playlists', ['limit' => 100, 'page' => 0, 'includeVideoEpisodes' => 1])['results'],
        ];

        return view('catalog.item', compact('item', 'bookmarks', 'cover', 'lists'));
    }

    public function edit(ShelfApi $api, string $id): \Illuminate\View\View
    {
        $item = $api->get("/api/items/$id", ['expanded' => 1, 'includeVideoEpisodes' => 1]);

        return view('catalog.edit', compact('item'));
    }

    public function update(Request $request, ShelfApi $api, string $id): RedirectResponse
    {
        $data = $request->validate(['title' => 'required|string|max:1000', 'subtitle' => 'nullable|string|max:1000', 'author' => 'nullable|string|max:1000', 'authors' => 'nullable|string|max:4000', 'narrators' => 'nullable|string|max:4000', 'description' => 'nullable|string|max:100000', 'genres' => 'nullable|string|max:4000', 'tags' => 'nullable|string|max:4000', 'publishedYear' => 'nullable|string|max:20', 'language' => 'nullable|string|max:100', 'isbn' => 'nullable|string|max:100', 'asin' => 'nullable|string|max:100', 'publisher' => 'nullable|string|max:1000', 'feedUrl' => 'nullable|url|max:2000']);
        $item = $api->get("/api/items/$id", ['expanded' => 1]);
        $metadata = array_filter($data, fn ($value) => $value !== null);
        unset($metadata['tags']);
        foreach (['genres', 'narrators'] as $key) {
            if (isset($metadata[$key])) {
                $metadata[$key] = $this->lines($metadata[$key]);
            }
        }
        if ($item['mediaType'] === 'book') {
            $metadata['authors'] = array_map(fn ($name) => ['name' => $name], $this->lines($data['authors'] ?? ''));
            unset($metadata['author']);
        } else {
            unset($metadata['authors'], $metadata['narrators']);
        }
        $metadata['explicit'] = $request->boolean('explicit');
        $metadata['abridged'] = $request->boolean('abridged');
        $api->patch("/api/items/$id/media", ['metadata' => $metadata, 'tags' => $this->lines($data['tags'] ?? '')]);

        return redirect()->route('item', $id)->with('status', 'Item updated.');
    }

    public function action(Request $request, ShelfApi $api, string $id, string $action): RedirectResponse|JsonResponse
    {
        switch ($action) {
            case 'scan': $api->post("/api/items/$id/scan");
                break;
            case 'delete':
                $api->delete("/api/items/$id?hard=".($request->boolean('deleteFiles') ? '1' : '0'));

                return redirect()->route('home')->with('status', 'Item removed.');
            case 'finished': $api->patch("/api/me/progress/$id".($request->filled('episodeId') ? '/'.$request->validate(['episodeId' => 'required|uuid'])['episodeId'] : ''), ['isFinished' => $request->boolean('finished')]);
                break;
            case 'bookmark':
                $data = $request->validate(['time' => 'required|numeric|min:0', 'title' => 'required|string|max:1000', 'episodeId' => 'nullable|uuid']);
                $api->post("/api/me/item/$id/bookmark", [...$data, 'time' => (float) $data['time']]);
                break;
            case 'remove-bookmark':
                $data = $request->validate(['time' => 'required|numeric|min:0', 'episodeId' => 'nullable|uuid']);
                $api->delete("/api/me/item/$id/bookmark/".$data['time'].'?'.http_build_query(array_filter(['episodeId' => $data['episodeId'] ?? null])));
                break;
            case 'cover':
                $request->validate(['file' => 'required|file|mimes:jpg,jpeg,png,webp|max:10240']);
                $api->call('POST', "/api/items/$id/cover", [], files: ['cover' => $request->file('file')]);
                break;
            case 'chapters':
                $data = $request->validate(['chapters' => 'required|array|max:2000', 'chapters.*.title' => 'required|string|max:1000', 'chapters.*.start' => 'required|numeric|min:0', 'chapters.*.end' => 'required|numeric|min:0']);
                $api->post("/api/items/$id/chapters", ['chapters' => array_map(fn ($chapter, $index) => [...$chapter, 'id' => $index, 'start' => (float) $chapter['start'], 'end' => (float) $chapter['end']], $data['chapters'], array_keys($data['chapters']))]);
                break;
            case 'feed': $api->post("/api/feeds/item/$id/open");
                break;
            case 'share':
                $data = $request->validate(['slug' => 'required|alpha_dash|max:100', 'days' => 'required|integer|min:1|max:3650', 'episodeId' => 'nullable|uuid']);
                $item = $api->get("/api/items/$id", ['expanded' => 1, 'includeVideoEpisodes' => 1]);
                if ($item['mediaType'] === 'podcast') {
                    abort_unless(collect($item['media']['episodes'])->contains('id', $data['episodeId'] ?? ''), 422);
                }
                $api->post('/api/share/mediaitem', ['slug' => $data['slug'], 'mediaItemId' => $item['mediaType'] === 'book' ? $item['media']['id'] : $data['episodeId'], 'mediaItemType' => $item['mediaType'] === 'book' ? 'book' : 'podcastEpisode', 'expiresAt' => now()->addDays((int) $data['days'])->getTimestampMs(), 'isDownloadable' => $request->boolean('isDownloadable')]);

                return back()->with('status', 'Share created: '.route('share', $data['slug']));
            case 'send-ebook':
                $data = $request->validate(['deviceName' => 'required|string|max:100']);
                $api->post('/api/emails/send-ebook-to-device', ['libraryItemId' => $id, ...$data]);
                break;
            case 'embed': $api->post("/api/tools/item/$id/embed-metadata");
                break;
            case 'encode': $api->post("/api/tools/item/$id/encode-m4b");
                break;
            default: abort(404);
        }

        return $request->expectsJson() ? response()->json(['saved' => true]) : back()->with('status', 'Changes saved.');
    }

    public function entity(Request $request, ShelfApi $api, string $kind, string $id): \Illuminate\View\View
    {
        abort_unless(in_array($kind, ['authors', 'series', 'collections', 'playlists']), 404);
        $entity = $api->get("/api/$kind/$id", ['include' => 'rssfeed', 'includeVideoEpisodes' => 1]);
        if (in_array($kind, ['series', 'authors'])) {
            $libraryId = $entity['libraryId'] ?? session('shelf.default_library');
            abort_unless($libraryId, 404);
            $result = $api->get("/api/libraries/$libraryId/items", ['filter' => $kind.'.'.base64_encode($id), 'limit' => 30, 'page' => max(0, $request->integer('page', 1) - 1), 'sort' => $kind === 'series' ? 'sequence' : 'media.metadata.title', 'minified' => 1]);
            $entity['libraryItems'] = $result['results'];
            $entity['total'] = $result['total'];
        }

        return view('catalog.entity', compact('kind', 'entity'));
    }

    public function entitySave(Request $request, ShelfApi $api, string $kind, ?string $id = null): RedirectResponse
    {
        abort_unless(in_array($kind, ['authors', 'series', 'collections', 'playlists']), 404);
        $data = $request->validate(['name' => 'required|string|max:1000', 'description' => 'nullable|string|max:100000', 'libraryId' => 'nullable|uuid', 'books' => (! $id && $kind === 'collections' ? 'required' : 'sometimes').'|array|min:1|max:1000', 'books.*' => 'required|uuid', 'items' => 'sometimes|array|max:1000', 'items.*.libraryItemId' => 'required|uuid', 'items.*.episodeId' => 'nullable|uuid']);
        if ($id) {
            $api->patch("/api/$kind/$id", $data);
        } else {
            abort_unless(in_array($kind, ['collections', 'playlists']), 404);
            $id = $api->post("/api/$kind".($kind === 'playlists' ? '?includeVideoEpisodes=1' : ''), $data)['id'];
        }

        return redirect()->route('entity', [$kind, $id])->with('status', 'Saved.');
    }

    public function entityAction(Request $request, ShelfApi $api, string $kind, string $id, string $action): RedirectResponse
    {
        abort_unless(in_array($kind, ['collections', 'playlists']), 404);
        if ($action === 'delete') {
            $api->delete("/api/$kind/$id");

            return redirect()->route('home')->with('status', 'Removed.');
        }
        if ($action === 'reorder') {
            $data = $request->validate(['items' => 'required|array|min:1|max:1000', 'items.*.libraryItemId' => 'required|uuid', 'items.*.episodeId' => 'nullable|uuid']);
            $api->patch("/api/$kind/$id", $kind === 'collections' ? ['books' => array_column($data['items'], 'libraryItemId')] : $data);

            return back()->with('status', 'Order saved.');
        }
        $data = $request->validate(['libraryItemId' => 'required|uuid', 'episodeId' => 'nullable|uuid']);
        if ($kind === 'collections') {
            if ($action === 'add') {
                $api->post("/api/collections/$id/book", ['id' => $data['libraryItemId']]);
            } elseif ($action === 'remove') {
                $api->delete("/api/collections/$id/book/".$data['libraryItemId']);
            } else {
                abort(404);
            }
        } else {
            if ($action === 'add') {
                $api->post("/api/playlists/$id/item?includeVideoEpisodes=1", $data);
            } elseif ($action === 'remove') {
                $api->delete("/api/playlists/$id/item/".$data['libraryItemId'].(isset($data['episodeId']) ? '/'.$data['episodeId'] : ''));
            } else {
                abort(404);
            }
        }

        return back()->with('status', 'List updated.');
    }

    public function delivery(Request $request, ShelfApi $api, string $kind, string $id, ?string $file = null): RedirectResponse
    {
        abort_unless(session('shelf.access_token'), 401);
        $path = match ($kind) {
            'cover' => "/items/$id/cover", 'download' => "/items/$id/download", 'ebook' => "/items/$id/ebook".($file ? "/$file" : ''), 'file' => "/items/$id/file/$file/download", 'author' => "/authors/$id/image", 'backup' => "/backups/$id/download", default => abort(404)
        };

        return redirect()->away($api->tickets([$path])[$path])->withHeaders(['Cache-Control' => 'private, no-store', 'Referrer-Policy' => 'no-referrer']);
    }

    public function reader(ShelfApi $api, string $id): \Illuminate\View\View
    {
        $item = $api->get("/api/items/$id", ['expanded' => 1, 'include' => 'progress']);
        $path = "/items/$id/ebook";
        $url = $api->tickets([$path])[$path];

        return view('catalog.reader', compact('item', 'url'));
    }

    private function lines(string $text): array
    {
        return array_values(array_filter(array_map('trim', preg_split('/\r?\n|,/', $text))));
    }

    public function pickItems(Request $request, ShelfApi $api): JsonResponse
    {
        $data = $request->validate(['libraryId' => 'required|uuid', 'q' => 'required|string|min:2|max:300']);
        $result = $api->get('/api/libraries/'.$data['libraryId'].'/search', ['q' => $data['q'], 'limit' => 20]);

        return response()->json(['items' => array_map(fn ($match) => ['id' => $match['libraryItem']['id'], 'title' => $match['libraryItem']['media']['metadata']['title']], $result['book'] ?? [])]);
    }

    public function share(string $slug): \Illuminate\View\View
    {
        abort_unless(preg_match('/^[a-zA-Z0-9_-]{1,100}$/', $slug), 404);

        return view('catalog.share', compact('slug'));
    }
}
