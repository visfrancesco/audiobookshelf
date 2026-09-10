<?php

namespace Tests\Feature\Http\Controllers;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PodcastControllerTest extends TestCase
{
    public function test_removing_a_video_episode_includes_it_in_the_backend_lookup(): void
    {
        $this->backend(['/api/podcasts/'.self::ITEM.'/episode/'.self::EPISODE.'?includeVideoEpisodes=1' => Http::response('', 204)], mediaType: 'podcast');

        $this->from('/item/'.self::ITEM)->post('/podcasts/'.self::ITEM.'/remove', ['episodeId' => self::EPISODE])
            ->assertRedirect('/item/'.self::ITEM)->assertSessionHas('status');

        Http::assertSent(fn ($request) => $request->method() === 'DELETE' && str_ends_with($request->url(), '/episode/'.self::EPISODE.'?includeVideoEpisodes=1'));
    }

    public function test_rss_preview_displays_metadata_and_saves_it_for_subscription(): void
    {
        $this->backend(['/api/podcasts/feed' => ['podcast' => ['metadata' => ['title' => 'A podcast', 'description' => '<script>alert(1)</script>'], 'episodes' => []]]], mediaType: 'podcast');
        $this->post('/podcasts/preview', ['rssFeed' => 'https://example.test/podcast.xml'])->assertOk()->assertSee('A podcast')->assertDontSee('<script>alert(1)</script>', false)->assertSessionHas('podcast_preview.url', 'https://example.test/podcast.xml');
        Http::assertSent(fn ($request) => ($request['rssFeed'] ?? null) === 'https://example.test/podcast.xml');
    }

    public function test_subscribe_uses_the_reviewed_feed_and_selected_library_folder(): void
    {
        $this->backend(['/api/podcasts' => ['id' => self::ITEM]], mediaType: 'podcast');
        $this->withSession(['podcast_preview' => ['url' => 'https://example.test/feed.xml', 'metadata' => ['title' => 'A podcast'], 'expires' => now()->addMinutes(10)->timestamp]]);
        $this->post('/podcasts/add', ['title' => 'A podcast', 'libraryId' => self::LIBRARY, 'libraryFolderId' => self::FOLDER, 'schedule' => '0 * * * *', 'maxEpisodesToKeep' => '0', 'autoDownloadEpisodes' => '1'])->assertRedirectToRoute('podcasts.episodes', self::ITEM);
        Http::assertSent(fn ($request) => ($request['folderId'] ?? null) === self::FOLDER && str_starts_with($request['path'], '/audiobooks/') && $request['media']['metadata']['feedUrl'] === 'https://example.test/feed.xml' && $request['media']['autoDownloadEpisodes'] === true);
    }

    public function test_episode_downloads_use_the_server_reviewed_episode_data(): void
    {
        $episode = ['title' => 'First episode', 'enclosure' => ['url' => 'https://example.test/episode.mp3']];
        $this->backend(['/api/podcasts/'.self::ITEM.'/download-episodes' => []]);
        $this->withSession(['podcast_episodes' => [self::ITEM => [$episode]]]);
        $this->post('/podcasts/'.self::ITEM.'/download', ['episodes' => ['0']])->assertSessionHas('status');
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/download-episodes') && $request->data() === [$episode]);
    }
}
