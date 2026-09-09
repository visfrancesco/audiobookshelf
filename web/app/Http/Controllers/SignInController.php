<?php

namespace App\Http\Controllers;

use App\Services\ShelfApi;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\View\View;

class SignInController extends Controller
{
    public function show(ShelfApi $api): View
    {
        return view('auth.sign-in', ['status' => $api->call('GET', '/status', authenticated: false)]);
    }

    public function store(Request $request, ShelfApi $api): RedirectResponse
    {
        $data = $request->validate(['username' => 'required|string|max:100', 'password' => 'nullable|string|max:1000']);
        $payload = $api->call('POST', '/login', $data, false);
        $request->session()->regenerate();
        $api->remember($payload);

        return redirect()->intended(route('home'));
    }

    public function initialize(Request $request, ShelfApi $api): RedirectResponse
    {
        $data = $request->validate(['username' => 'required|string|max:100', 'password' => 'required|string|min:12|max:1000|confirmed']);
        $api->call('POST', '/init', ['newRoot' => ['username' => $data['username'], 'password' => $data['password']]], false);

        return $this->store($request, $api);
    }

    public function oidc(Request $request, ShelfApi $api): RedirectResponse
    {
        $state = Str::random(48);
        session(['oidc_state' => $state]);

        return redirect($api->publicUrl('/auth/openid').'?'.http_build_query(['callback' => route('login.callback'), 'state' => $state]));
    }

    public function callback(Request $request, ShelfApi $api): RedirectResponse
    {
        $expectedState = session()->pull('oidc_state');
        abort_unless(is_string($expectedState) && strlen($expectedState) >= 32 && is_string($request->query('state')) && hash_equals($expectedState, $request->query('state')), 403, 'The sign-in request expired. Please try again.');
        // The backend already completed OIDC. Exchange its HttpOnly refresh cookie
        // server-side and immediately remove token-bearing callback parameters.
        $refresh = $request->cookie('refresh_token');
        abort_unless(is_string($refresh) && $refresh !== '', 401, 'Sign-in cookie is missing. Please try again.');
        $request->session()->regenerate();
        $api->refresh($refresh);

        return redirect()->route('home')->withHeaders(['Referrer-Policy' => 'no-referrer', 'Cache-Control' => 'no-store']);
    }

    public function destroy(Request $request, ShelfApi $api): RedirectResponse
    {
        if (session('shelf.access_token')) {
            try {
                $api->post('/logout', ['refreshToken' => session('shelf.refresh_token')]);
            } catch (\Throwable $e) { /* Local logout must still succeed. */
            }
        }
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }
}
