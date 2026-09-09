<?php

namespace Tests\Feature\Http\Controllers;

use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CatalogControllerTest extends TestCase
{
    public function test_catalog_is_paginated_and_cover_links_do_not_expose_access_tokens(): void
    {
        $this->backend(['/api/libraries/'.self::LIBRARY.'/items*' => ['results' => [$this->item()], 'total' => 1000]]);
        $this->get('/library/'.self::LIBRARY.'?page=2')->assertOk()->assertSee('A thoughtful read')->assertSee('Page 2')->assertDontSee('private-access-token')->assertSee('uiTicket=scoped-ticket', false);
        Http::assertSent(fn ($request) => str_contains($request->url(), '/items?') && $request['limit'] === 30 && $request['page'] === 1 && $request['includeVideoEpisodes'] === 1);
        Http::assertSentCount(3);
    }

    public function test_podcast_search_results_are_displayed_even_if_book_results_are_empty(): void
    {
        $this->backend(['/api/libraries/'.self::LIBRARY.'/search*' => ['book' => [], 'podcast' => [['libraryItem' => $this->item('podcast')]]]], mediaType: 'podcast');
        $this->get('/library/'.self::LIBRARY.'?q=thoughtful')->assertOk()->assertSee('A thoughtful read');
        Http::assertSentCount(3);
    }

    public function test_inaccessible_library_returns_404_without_requesting_its_items(): void
    {
        $this->backend(role: 'user');
        $this->get('/library/'.self::DOCUMENT)->assertNotFound();
        Http::assertSentCount(1);
    }

    public function test_cover_delivery_redirects_to_a_scoped_url_without_buffering_the_image(): void
    {
        $this->backend();
        $this->get('/delivery/cover/'.self::ITEM)->assertRedirect('/api/items/'.self::ITEM.'/cover?uiTicket=scoped-ticket')->assertHeader('Referrer-Policy', 'no-referrer');
        Http::assertSentCount(1);
    }

    public function test_delete_files_requires_the_explicit_checkbox_and_uses_the_backend_query(): void
    {
        $this->backend(['/api/items/'.self::ITEM.'?hard=0' => Http::response('', 204)]);
        $this->post('/item/'.self::ITEM.'/actions/delete')->assertRedirectToRoute('home');
        Http::assertSent(fn ($request) => $request->method() === 'DELETE' && str_ends_with($request->url(), '?hard=0'));
    }

    public function test_podcast_bookmark_removal_preserves_the_episode_scope(): void
    {
        $this->backend(['/api/me/item/'.self::ITEM.'/bookmark/12?episodeId='.self::EPISODE => Http::response('', 200)]);
        $this->postJson('/item/'.self::ITEM.'/actions/remove-bookmark', ['time' => 12, 'episodeId' => self::EPISODE])->assertOk()->assertJson(['saved' => true]);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '?episodeId='.self::EPISODE) && $request->method() === 'DELETE');
    }

    public function test_collection_creation_includes_the_selected_book(): void
    {
        $this->backend(['/api/collections' => ['id' => self::DOCUMENT]]);
        $this->post('/lists/collections', ['name' => 'Learning', 'libraryId' => self::LIBRARY, 'books' => [self::ITEM]])->assertRedirectToRoute('entity', ['collections', self::DOCUMENT]);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/collections') && $request['books'] === [self::ITEM]);
    }

    public function test_collection_creation_rejects_an_empty_selection(): void
    {
        $this->backend();
        $this->post('/lists/collections', ['name' => 'Learning', 'libraryId' => self::LIBRARY])->assertSessionHasErrors('books');
        Http::assertSentCount(1);
    }

    public function test_adding_a_video_episode_to_a_playlist_uses_the_video_api_contract(): void
    {
        $this->backend(['/api/playlists/'.self::DOCUMENT.'/item?includeVideoEpisodes=1' => Http::response('', 200)]);
        $this->post('/lists/playlists/'.self::DOCUMENT.'/actions/add', ['libraryItemId' => self::ITEM, 'episodeId' => self::EPISODE])->assertRedirect();
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/item?includeVideoEpisodes=1') && $request['episodeId'] === self::EPISODE);
    }

    public static function itemPages(): array
    {
        return [[''], ['/edit'], ['/read']];
    }

    #[DataProvider('itemPages')]
    public function test_item_pages_render_the_existing_book_data(string $suffix): void
    {
        $item = $this->item();
        $item['media']['ebookFile'] = ['ebookFormat' => 'epub', 'metadata' => ['filename' => 'book.epub']];
        $this->backend(['/api/items/'.self::ITEM.'*' => $item, '/api/me/bookmarks/'.self::ITEM => ['bookmarks' => []], '/api/libraries/'.self::LIBRARY.'/collections*' => ['results' => [], 'total' => 0], '/api/libraries/'.self::LIBRARY.'/playlists*' => ['results' => [], 'total' => 0]]);
        $this->get('/item/'.self::ITEM.$suffix)->assertOk()->assertSee('A thoughtful read')->assertDontSee('private-access-token');
        Http::assertSent(fn ($request) => str_contains($request->url(), '/api/items/'.self::ITEM));
    }

    public function test_video_podcast_exposes_listen_and_watch_actions(): void
    {
        $item = $this->item('podcast');
        $item['media']['episodes'] = [['id' => self::EPISODE, 'title' => 'A video lecture', 'description' => 'A complete lecture.', 'publishedAt' => 1788960000000, 'videoSource' => ['available' => true, 'watchAvailable' => true]]];
        $this->backend(['/api/items/'.self::ITEM.'*' => $item, '/api/me/bookmarks/'.self::ITEM => ['bookmarks' => []], '/api/libraries/'.self::LIBRARY.'/playlists*' => ['results' => [], 'total' => 0]], mediaType: 'podcast');
        $this->get('/item/'.self::ITEM)->assertOk()->assertSee('A video lecture')->assertSee('data-mode="video"', false)->assertSee('data-mode="audio"', false);
        Http::assertSent(fn ($request) => ($request['includeVideoEpisodes'] ?? null) === 1);
    }
}
