<?php

namespace Tests\Feature\Http\Controllers;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PlayerControllerTest extends TestCase
{
    public function test_expired_browser_session_returns_401_to_the_player(): void
    {
        Http::fake();
        $this->postJson('/player/start', ['itemId' => self::ITEM, 'mode' => 'audio'])->assertUnauthorized();
        Http::assertNothingSent();
    }

    public function test_switching_to_video_preserves_the_requested_position(): void
    {
        $this->backend(['/api/items/'.self::ITEM.'/play/'.self::EPISODE.'?includeVideoEpisodes=1' => ['id' => self::SESSION, 'audioTracks' => [], 'playMethod' => 0, 'media' => ['mode' => 'video', 'contentUrl' => '/public/session/'.self::SESSION.'/video'], 'libraryItem' => ['path' => '/private/media'], 'coverPath' => '/private/cover']]);
        $this->postJson('/player/start', ['itemId' => self::ITEM, 'episodeId' => self::EPISODE, 'mode' => 'video', 'startTime' => 123.5])->assertOk()->assertJsonPath('media.contentUrl', '/public/session/'.self::SESSION.'/video')->assertJsonMissingPath('libraryItem')->assertJsonMissingPath('coverPath');
        Http::assertSent(fn ($request) => str_contains($request->url(), '/play/') && $request['startTime'] === 123.5 && $request['mode'] === 'video' && $request['deviceInfo']['clientName'] === 'KnowledgeShelf');
    }

    public function test_direct_audio_tracks_use_scoped_session_urls(): void
    {
        $this->backend(['/api/items/'.self::ITEM.'/play?includeVideoEpisodes=1' => ['id' => self::SESSION, 'audioTracks' => [['index' => 2, 'contentUrl' => '/api/items/private/file/123', 'metadata' => ['path' => '/private/file']]], 'playMethod' => 0]]);
        $this->postJson('/player/start', ['itemId' => self::ITEM, 'mode' => 'audio'])->assertOk()->assertJsonPath('audioTracks.0.contentUrl', '/public/session/'.self::SESSION.'/track/2')->assertJsonMissingPath('audioTracks.0.metadata');
        Http::assertSentCount(2);
    }

    public function test_progress_sync_keeps_fractional_time_and_bounds_listening_credit(): void
    {
        $this->backend(['/api/session/'.self::SESSION.'/sync' => ['success' => true]]);
        $this->postJson('/player/sync', ['sessionId' => self::SESSION, 'currentTime' => '20.25', 'duration' => '3600', 'timeListened' => '15'])->assertOk()->assertJson(['saved' => true]);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/sync') && $request['currentTime'] === 20.25 && $request['timeListened'] === 15.0);
    }

    public function test_invalid_listening_credit_returns_422_without_syncing(): void
    {
        $this->backend();
        $this->postJson('/player/sync', ['sessionId' => self::SESSION, 'currentTime' => 20, 'duration' => 3600, 'timeListened' => 301])->assertUnprocessable()->assertJsonValidationErrors('timeListened');
        Http::assertSentCount(1);
    }

    public function test_a_revoked_library_permission_is_rechecked_by_the_backend_before_playing(): void
    {
        $this->backend(['/api/items/'.self::ITEM.'/play?includeVideoEpisodes=1' => Http::response('', 403)], 'user');
        $this->postJson('/player/start', ['itemId' => self::ITEM, 'mode' => 'audio'])->assertForbidden();
        Http::assertSentCount(2);
    }
}
