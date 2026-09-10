<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Http\Client\Request as BackendRequest;
use Illuminate\Support\Facades\Http;

abstract class TestCase extends BaseTestCase
{
    protected const USER = 'a08b2340-c461-4cc4-a74a-805efef49a36';

    protected const LIBRARY = '757db7bd-d0cc-48b7-9bcf-fd6284d39476';

    protected const FOLDER = 'f4c88852-2c56-435c-9237-9db333b703c4';

    protected const ITEM = '820020e2-84c0-4e67-9d27-0d2d69d309dc';

    protected const DOCUMENT = '3c2d3e31-a207-4379-b8c2-70c8241fbd3a';

    protected const JOB = '0e8a21e4-7134-4b46-a4fa-9f69f16dce9f';

    protected const EPISODE = 'b67c9e3b-f81a-43c6-901d-5da107a5b9b4';

    protected const SESSION = 'd73f1c2b-89a0-41bb-af17-40bacef2df2f';

    protected function setUp(): void
    {
        parent::setUp();
        config(['knowledge.backend' => 'http://shelf.test', 'knowledge.public_prefix' => '']);
        $this->withoutVite();
    }

    protected function user(string $role = 'root', array $permissions = []): array
    {
        return ['id' => self::USER, 'username' => 'Reader', 'type' => $role, 'isActive' => true, 'permissions' => [...array_fill_keys(['upload', 'download', 'update', 'delete', 'accessAllLibraries'], true), ...$permissions]];
    }

    protected function library(string $mediaType = 'book'): array
    {
        return ['id' => self::LIBRARY, 'name' => 'Learning shelf', 'mediaType' => $mediaType, 'folders' => [['id' => self::FOLDER, 'fullPath' => '/audiobooks']], 'settings' => []];
    }

    protected function item(string $type = 'book'): array
    {
        return ['id' => self::ITEM, 'libraryId' => self::LIBRARY, 'mediaType' => $type, 'media' => ['id' => self::DOCUMENT, 'metadata' => ['title' => 'A thoughtful read', 'authors' => [['id' => self::USER, 'name' => 'A. Writer']], 'author' => 'A. Writer', 'description' => 'Read every word.', 'genres' => [], 'narrators' => []], 'audioFiles' => [['index' => 1]], 'episodes' => [], 'chapters' => [], 'tags' => []]];
    }

    protected function document(array $values = []): array
    {
        return [...['id' => self::DOCUMENT, 'title' => 'The full article', 'author' => 'An author', 'state' => 'ready', 'text' => 'Read every word.', 'characters' => 16, 'contentHash' => str_repeat('a', 64), 'error' => null, 'libraryItemId' => null, 'generation' => null], ...$values];
    }

    protected function backend(array $responses = [], string $role = 'root', array $permissions = [], string $mediaType = 'book'): void
    {
        $user = $this->user($role, $permissions);
        $this->withSession(['shelf' => ['access_token' => 'private-access-token', 'refresh_token' => 'private-refresh-token', 'user' => $user, 'default_library' => self::LIBRARY]]);
        Http::preventStrayRequests();
        $fakes = [
            'http://shelf.test/api/ui/session' => Http::response(['user' => $user, 'libraries' => [$this->library($mediaType)], 'settings' => ['version' => '2.37.0']]),
            'http://shelf.test/api/ui/media-tickets' => fn (BackendRequest $request) => Http::response(['tickets' => collect($request['paths'])->mapWithKeys(fn ($path) => [$path => '/api'.$path.'?uiTicket=scoped-ticket'])->all()]),
        ];
        foreach ($responses as $path => $response) {
            $fakes['http://shelf.test'.$path] = is_callable($response) || ! is_array($response) ? $response : Http::response($response);
        }
        Http::fake($fakes);
    }
}
