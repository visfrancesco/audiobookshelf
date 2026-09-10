<?php

namespace Tests\Feature\Http\Controllers;

use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AccountControllerTest extends TestCase
{
    public static function tabs(): array
    {
        return [['listening'], ['security'], ['devices']];
    }

    #[DataProvider('tabs')]
    public function test_account_pages_render_the_current_users_data(string $tab): void
    {
        $this->backend(['/api/me/listening-stats' => [], '/api/me/listening-sessions*' => ['sessions' => [], 'total' => 0], '/api/me/sessions*' => ['sessions' => [], 'total' => 0], '/api/me' => $this->user()]);
        $this->get('/account?tab='.$tab)->assertOk()->assertSee('Reader')->assertDontSee('private-refresh-token');
        Http::assertSent(fn ($request) => str_contains($request->url(), '/api/me'));
    }

    public function test_password_change_keeps_the_replacement_tokens_without_losing_the_profile(): void
    {
        $this->backend(['/api/me/password' => ['user' => ['accessToken' => 'replacement-access', 'refreshToken' => 'replacement-refresh']]]);
        $this->post('/account/password', ['password' => 'old-password', 'newPassword' => 'a-long-new-password', 'newPassword_confirmation' => 'a-long-new-password'])->assertSessionHas('shelf.access_token', 'replacement-access')->assertSessionHas('shelf.user.username', 'Reader');
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/password') && $request->hasHeader('X-Refresh-Token', 'private-refresh-token'));
    }
}
