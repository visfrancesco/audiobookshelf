<?php

namespace Tests\Feature\Http\Controllers;

use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AdminControllerTest extends TestCase
{
    public static function sections(): array
    {
        return array_map(fn ($section) => [$section], ['libraries', 'users', 'settings', 'authentication', 'backups', 'sessions', 'feeds', 'api-keys', 'email', 'notifications', 'metadata', 'tags', 'logs']);
    }

    #[DataProvider('sections')]
    public function test_administration_pages_render_without_exposing_backend_credentials(string $section): void
    {
        $this->backend([
            '/api/users' => ['users' => [[...$this->user(), 'email' => 'reader@example.test']]], '/api/auth-settings' => [], '/api/backups' => ['backups' => [], 'backupLocation' => '/metadata/backups', 'backupPathEnvSet' => false], '/api/sessions*' => ['sessions' => [], 'total' => 0], '/api/feeds' => ['feeds' => []], '/api/api-keys' => ['apiKeys' => []], '/api/emails/settings' => ['settings' => ['pass' => 'secret-smtp-password']], '/api/notifications' => ['settings' => ['notifications' => []], 'data' => ['events' => []]], '/api/custom-metadata-providers' => ['providers' => []], '/api/tags' => ['tags' => ['Learning']], '/api/genres' => ['genres' => ['Education']], '/api/logger-data' => ['currentDailyLogs' => []], '/api/tasks*' => ['tasks' => []],
        ]);
        $this->get('/manage/'.$section)->assertOk()->assertSee('KnowledgeShelf')->assertDontSee('private-access-token')->assertDontSee('secret-smtp-password');
        Http::assertSent(fn ($request) => $request->url() === 'http://shelf.test/api/ui/session');
    }

    public function test_user_cannot_submit_administrator_actions(): void
    {
        $this->backend(role: 'user');
        $this->post('/manage/users/delete/'.self::USER)->assertForbidden();
        Http::assertSentCount(1);
    }

    public function test_restore_requires_explicit_confirmation(): void
    {
        $this->backend();
        $this->post('/manage/backups/restore/backup-1')->assertSessionHasErrors('confirmed');
        Http::assertSentCount(1);
    }

    public function test_library_edit_keeps_existing_folder_ids(): void
    {
        $this->backend(['/api/libraries/'.self::LIBRARY => $this->library()]);
        $this->post('/manage/libraries/save/'.self::LIBRARY, ['name' => 'Updated shelf', 'mediaType' => 'book', 'paths' => '/audiobooks', 'provider' => 'google', 'icon' => 'database', 'scanSchedule' => '0 * * * *'])->assertRedirectToRoute('manage', 'libraries');
        Http::assertSent(fn ($request) => $request->method() === 'PATCH' && $request['folders'] === [['id' => self::FOLDER, 'fullPath' => '/audiobooks']]);
    }

    public function test_api_key_creation_displays_the_key_once_with_a_bounded_expiry(): void
    {
        $this->backend(['/api/api-keys' => ['apiKey' => ['apiKey' => 'new-integration-key']]]);
        $this->post('/manage/api-keys/create', ['name' => 'AudioAtlas', 'userId' => self::USER, 'days' => 30])->assertRedirectToRoute('manage', 'api-keys')->assertSessionHas('createdApiKey', 'new-integration-key');
        Http::assertSent(fn ($request) => ($request['expiresIn'] ?? null) === 2592000 && $request['isActive'] === true);
    }
}
