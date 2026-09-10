<?php

namespace Tests\Feature\Http\Controllers;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class UploadControllerTest extends TestCase
{
    public function test_upload_permission_is_required_before_sending_files(): void
    {
        $this->backend(role: 'user', permissions: ['upload' => false]);
        $this->post('/upload-media', ['title' => 'Unauthorized'])->assertForbidden();
        Http::assertSentCount(1);
    }

    public function test_each_audio_track_is_forwarded_as_a_separate_multipart_file(): void
    {
        $this->backend(['/api/upload' => Http::response('OK')]);
        $this->post('/upload-media', ['title' => 'A book', 'libraryId' => self::LIBRARY, 'libraryFolderId' => self::FOLDER, 'files' => [UploadedFile::fake()->createWithContent('first.mp3', 'track one'), UploadedFile::fake()->createWithContent('second.mp3', 'track two')]])->assertRedirectToRoute('library', self::LIBRARY);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/upload') && str_contains($request->body(), 'first.mp3') && str_contains($request->body(), 'second.mp3') && str_contains($request->body(), self::FOLDER));
    }
}
