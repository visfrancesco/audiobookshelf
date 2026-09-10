<?php

namespace Tests\Feature;

use Tests\TestCase;

class CatalogPresentationTest extends TestCase
{
    public function test_statistics_have_units_and_do_not_offer_item_search(): void
    {
        $this->backend(['/api/libraries/'.self::LIBRARY.'/stats*' => ['totalItems' => 6, 'totalSize' => 2128322068, 'totalDuration' => 221506]]);

        $this->get('/library/'.self::LIBRARY.'?view=stats')
            ->assertOk()->assertSee('Your library at a glance')->assertSee('1.98 GiB')->assertSee('61h 31m')
            ->assertDontSee('0 stats')->assertDontSee('name="q"', false);
    }

    public function test_small_library_totals_do_not_round_down_to_zero(): void
    {
        $this->backend(['/api/libraries/'.self::LIBRARY.'/stats*' => ['totalItems' => 1, 'totalSize' => 2048, 'totalDuration' => 10]]);

        $this->get('/library/'.self::LIBRARY.'?view=stats')->assertOk()->assertSee('2.00 KiB')->assertSee('10s');
    }

    public function test_description_keeps_text_boundaries_without_rendering_imported_html(): void
    {
        $item = $this->item();
        $item['media']['metadata']['description'] = '<p>First paragraph.</p><p>Second &amp; third.</p><script>alert(1)</script>&lt;img src=x onerror=alert(2)&gt;';
        $this->itemBackend($item);

        $this->get('/item/'.self::ITEM)->assertOk()
            ->assertSee("First paragraph.\n\nSecond &amp; third.", false)
            ->assertSee('&lt;img src=x onerror=alert(2)&gt;', false)
            ->assertDontSee('<script>alert(1)</script>', false)->assertDontSee('<img src=x', false);
    }

    public function test_long_synopsis_is_available_in_a_disclosure(): void
    {
        $item = $this->item();
        $item['media']['metadata']['description'] = str_repeat('A complete sentence. ', 60);
        $this->itemBackend($item);

        $this->get('/item/'.self::ITEM)->assertOk()->assertSee('About this item')
            ->assertSee(trim($item['media']['metadata']['description']));
    }

    public function test_video_episodes_are_newest_first_and_explain_unavailable_watch(): void
    {
        $item = $this->item('podcast');
        $item['media']['episodes'] = [
            ['id' => self::EPISODE, 'title' => 'Older episode', 'publishedAt' => 1000000, 'description' => '', 'videoSource' => ['available' => true, 'watchAvailable' => true]],
            ['id' => self::DOCUMENT, 'title' => 'Newest episode', 'publishedAt' => 2000000, 'description' => '', 'videoSource' => ['available' => true, 'watchAvailable' => false, 'watchReason' => 'Unsupported video encoding']],
        ];
        $this->itemBackend($item, 'podcast');

        $this->get('/item/'.self::ITEM)->assertOk()->assertSeeInOrder(['Newest episode', 'Older episode'])
            ->assertSee('You can still listen.')->assertSee('Manage video sources')->assertSee('Technical details');
    }

    public function test_library_creation_exposes_the_required_folder_field(): void
    {
        $this->backend();

        $this->get('/manage/libraries')->assertOk()->assertSee('name="paths"', false)
            ->assertSee('Library folders (one absolute path per line)')->assertSee('Metadata & scan settings', false);
    }

    private function itemBackend(array $item, string $mediaType = 'book'): void
    {
        $this->backend([
            '/api/items/'.self::ITEM.'*' => $item,
            '/api/me/bookmarks/'.self::ITEM => ['bookmarks' => []],
            '/api/libraries/'.self::LIBRARY.'/collections*' => ['results' => [], 'total' => 0],
            '/api/libraries/'.self::LIBRARY.'/playlists*' => ['results' => [], 'total' => 0],
        ], mediaType: $mediaType);
    }
}
