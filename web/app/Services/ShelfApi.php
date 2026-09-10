<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ShelfApi
{
    public int $requests = 0;

    public function call(string $method, string $path, array $data = [], bool $authenticated = true, array $files = []): mixed
    {
        if (! str_starts_with($path, '/') || str_starts_with($path, '//') || str_contains($path, '..')) {
            throw new \InvalidArgumentException('Invalid backend path');
        }
        $send = function () use ($method, $path, $data, $authenticated, $files) {
            $this->requests++;
            $request = Http::baseUrl(config('knowledge.backend'))->acceptJson()->connectTimeout(3)->timeout($files ? 300 : 40)
                ->withOptions(['allow_redirects' => false])->withHeaders(['X-Return-Tokens' => 'true']);
            if ($authenticated) {
                $request = $request->withToken(session('shelf.access_token', ''));
                if (in_array(strtok($path, '?'), ['/logout', '/api/me/password', '/api/me/sessions'])) {
                    $request = $request->withHeaders(['X-Refresh-Token' => session('shelf.refresh_token', '')]);
                }
            }
            foreach ($files as $name => $file) {
                $request = $request->attach($name, fopen($file->getRealPath(), 'r'), $file->getClientOriginalName());
            }

            return $request->send($method, $path, [strtoupper($method) === 'GET' ? 'query' : ($files ? 'multipart' : 'json') => $files ? $this->multipart($data) : $data]);
        };
        try {
            $response = $send();
            if ($response->status() === 401 && $authenticated && session('shelf.refresh_token')) {
                $this->refresh();
                $response = $send();
            }
        } catch (ConnectionException $e) {
            throw new HttpException(503, 'KnowledgeShelf is starting or temporarily unavailable. Please try again.');
        }

        return $this->result($response);
    }

    private function multipart(array $data): array
    {
        return collect($data)->map(fn ($value, $name) => ['name' => $name, 'contents' => is_array($value) ? json_encode($value) : (string) $value])->values()->all();
    }

    public function result(Response $response): mixed
    {
        if ($response->status() === 401) {
            session()->forget('shelf');
            throw new HttpException(401, 'Your session has expired. Please sign in again.');
        }
        if (! $response->successful()) {
            $message = $response->json('error') ?? $response->json('message');
            if (! is_string($message)) {
                $message = match ($response->status()) {
                    403 => 'You do not have permission to do this.', 404 => 'This item could not be found.',
                    429 => 'Please wait before trying again.', default => 'KnowledgeShelf could not complete this request.'
                };
            }
            if (in_array($response->status(), [400, 409, 413, 415, 422])) {
                throw ValidationException::withMessages(['request' => $message]);
            }
            throw new HttpException($response->status(), $message);
        }

        return $response->json() ?? $response->body();
    }

    public function refresh(?string $token = null): array
    {
        $this->requests++;
        $response = Http::baseUrl(config('knowledge.backend'))->acceptJson()->connectTimeout(3)->timeout(10)
            ->withOptions(['allow_redirects' => false])->withHeaders(['X-Refresh-Token' => $token ?? session('shelf.refresh_token', '')])->post('/auth/refresh');
        $payload = $this->result($response);
        $this->remember($payload);

        return $payload;
    }

    public function remember(array $payload): void
    {
        $user = $payload['user'];
        session(['shelf.access_token' => $user['accessToken'], 'shelf.refresh_token' => $user['refreshToken'] ?? session('shelf.refresh_token'),
            'shelf.user' => $this->safeUser($user), 'shelf.settings' => $payload['serverSettings'] ?? [], 'shelf.default_library' => $payload['userDefaultLibraryId'] ?? null]);
    }

    public function safeUser(array $user): array
    {
        return array_intersect_key($user, array_flip(['id', 'username', 'type', 'isActive', 'permissions', 'settings']));
    }

    public function get(string $path, array $query = []): mixed
    {
        return $this->call('GET', $path, $query);
    }

    public function post(string $path, array $data = []): mixed
    {
        return $this->call('POST', $path, $data);
    }

    public function patch(string $path, array $data = []): mixed
    {
        return $this->call('PATCH', $path, $data);
    }

    public function delete(string $path, array $data = []): mixed
    {
        return $this->call('DELETE', $path, $data);
    }

    public function publicUrl(string $path): string
    {
        return config('knowledge.public_prefix').$path;
    }

    public function tickets(array $paths): array
    {
        if (! $paths) {
            return [];
        }

        return array_map(fn ($path) => $this->publicUrl($path), $this->post('/api/ui/media-tickets', ['paths' => array_values(array_unique($paths))])['tickets']);
    }
}
