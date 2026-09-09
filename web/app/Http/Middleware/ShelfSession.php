<?php

namespace App\Http\Middleware;

use App\Services\ShelfApi;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\View;
use Symfony\Component\HttpFoundation\Response;

class ShelfSession
{
    public function handle(Request $request, Closure $next, string $role = 'reader'): Response
    {
        if (! session('shelf.access_token')) {
            abort_if($request->expectsJson(), 401, 'Your session has expired. Please sign in again.');

            return redirect()->guest(route('login'));
        }
        $api = app(ShelfApi::class);
        $context = $api->get('/api/ui/session');
        $user = $api->safeUser($context['user']);
        session(['shelf.user' => $user, 'shelf.settings' => $context['settings']]);
        if ($role === 'admin' && ! in_array($user['type'], ['root', 'admin'])) {
            abort(403);
        }
        $libraries = $context['libraries'];
        View::share(['shelfUser' => $user, 'libraries' => $libraries, 'isAdmin' => in_array($user['type'], ['root', 'admin'])]);
        $response = $next($request);
        $response->headers->set('X-Backend-Requests', (string) $api->requests);
        $response->headers->set('Cache-Control', 'private, no-store');
        $response->headers->set('Referrer-Policy', 'same-origin');
        $response->headers->set('X-Content-Type-Options', 'nosniff');

        return $response;
    }
}
