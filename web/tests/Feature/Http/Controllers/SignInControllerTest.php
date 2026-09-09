<?php

namespace Tests\Feature\Http\Controllers;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SignInControllerTest extends TestCase
{
    public function test_sign_in_keeps_access_tokens_in_the_server_session(): void
    {
        Http::preventStrayRequests();
        Http::fake(['shelf.test/login' => Http::response(['user' => [...$this->user(), 'accessToken' => 'secret-access', 'refreshToken' => 'secret-refresh'], 'userDefaultLibraryId' => self::LIBRARY])]);
        $this->post('/sign-in', ['username' => 'Reader', 'password' => 'a private password'])->assertRedirectToRoute('home')->assertSessionHas('shelf.access_token', 'secret-access')->assertSessionHas('shelf.user.username', 'Reader')->assertDontSee('secret-access');
        Http::assertSent(fn ($request) => $request->hasHeader('X-Return-Tokens', 'true') && $request['username'] === 'Reader');
    }

    public function test_expired_access_token_is_refreshed_once_and_the_page_is_retried(): void
    {
        $this->backend([
            '/api/ui/session' => Http::sequence()->push([], 401)->push(['user' => $this->user(), 'libraries' => [], 'settings' => []]),
            '/auth/refresh' => ['user' => [...$this->user(), 'accessToken' => 'new-access', 'refreshToken' => 'new-refresh']],
        ]);
        $this->get('/')->assertOk()->assertSee('Add your first library')->assertSessionHas('shelf.access_token', 'new-access');
        Http::assertSent(fn ($request) => $request->url() === 'http://shelf.test/auth/refresh' && $request->hasHeader('X-Refresh-Token', 'private-refresh-token'));
        Http::assertSentCount(3);
    }

    public function test_failed_refresh_clears_the_session_and_returns_to_sign_in(): void
    {
        $this->backend(['/api/ui/session' => Http::response([], 401), '/auth/refresh' => Http::response([], 401)]);
        $this->get('/documents')->assertRedirectToRoute('login')->assertSessionMissing('shelf.access_token');
        Http::assertSentCount(2);
    }

    public function test_sign_out_revokes_the_current_backend_session(): void
    {
        $this->backend(['/logout' => ['redirect_url' => null]]);
        $this->post('/sign-out')->assertRedirectToRoute('login')->assertSessionMissing('shelf');
        Http::assertSent(fn ($request) => $request->url() === 'http://shelf.test/logout' && $request->hasHeader('X-Refresh-Token', 'private-refresh-token'));
    }

    public function test_invalid_openid_state_is_rejected_before_exchanging_credentials(): void
    {
        Http::fake();
        $this->withSession(['oidc_state' => str_repeat('a', 48)])->get('/sign-in/callback?state=wrong-state')->assertForbidden();
        Http::assertNothingSent();
    }

    public function test_openid_callback_without_a_saved_nonce_is_rejected(): void
    {
        Http::fake();
        $this->get('/sign-in/callback?state=')->assertForbidden();
        Http::assertNothingSent();
    }

    public function test_new_installation_shows_the_account_setup_form(): void
    {
        Http::preventStrayRequests();
        Http::fake(['shelf.test/status' => Http::response(['isInit' => false, 'authMethods' => ['local']])]);
        $this->get('/sign-in')->assertOk()->assertSee('Create your administrator account')->assertSee('password_confirmation');
        Http::assertSentCount(1);
    }
}
