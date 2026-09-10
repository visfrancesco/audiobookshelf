<?php

namespace Tests\Feature\Http\Controllers;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class KnowledgeControllerTest extends TestCase
{
    public function test_document_preview_escapes_source_text_and_uses_the_saved_content_hash(): void
    {
        $this->backend(['/api/knowledge/documents/'.self::DOCUMENT => $this->document(['text' => '<script>alert(1)</script>']), '/api/knowledge/status' => ['elevenLabs' => true], '/api/knowledge/voices' => ['voices' => [['id' => 'voice-a', 'name' => 'Calm voice']]], '/api/knowledge/jobs*' => ['jobs' => [], 'total' => 0]]);
        $this->get('/documents/'.self::DOCUMENT)->assertOk()->assertSee('Calm voice')->assertSee('value="voice-a"', false)->assertSee(str_repeat('a', 64))->assertSee('&lt;script&gt;alert(1)&lt;/script&gt;', false)->assertDontSee('<script>alert(1)</script>', false)->assertDontSee('private-access-token');
        Http::assertSent(fn ($request) => str_contains($request->url(), 'documentId='.self::DOCUMENT));
    }

    public function test_narration_requires_explicit_approval_before_calling_the_backend(): void
    {
        $this->backend();
        $this->post('/documents/'.self::DOCUMENT.'/generate', ['contentHash' => str_repeat('a', 64), 'voiceId' => 'voice-a', 'modelId' => 'eleven_multilingual_v2', 'maxCharacters' => 100])->assertSessionHasErrors('approved');
        Http::assertSentCount(1);
    }

    public function test_approved_narration_sends_a_numeric_character_limit_and_review_hash(): void
    {
        $this->backend(['/api/knowledge/documents/'.self::DOCUMENT.'/generate' => ['id' => self::JOB]]);
        $this->from('/documents/'.self::DOCUMENT)->post('/documents/'.self::DOCUMENT.'/generate', ['approved' => '1', 'contentHash' => str_repeat('a', 64), 'voiceId' => 'voice-a', 'modelId' => 'eleven_multilingual_v2', 'maxCharacters' => '100'])->assertRedirect('/documents/'.self::DOCUMENT)->assertSessionHas('status');
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/generate') && $request['maxCharacters'] === 100 && $request['contentHash'] === str_repeat('a', 64) && ! isset($request['approved']));
    }

    public function test_upload_passes_the_original_document_as_multipart(): void
    {
        $this->backend(['/api/knowledge/documents' => ['id' => self::DOCUMENT]]);
        $file = UploadedFile::fake()->createWithContent('article.html', '<article><p>Read every word.</p></article>');
        $this->post('/documents', ['title' => 'An article', 'libraryId' => self::LIBRARY, 'libraryFolderId' => self::FOLDER, 'file' => $file])->assertRedirectToRoute('document', self::DOCUMENT);
        Http::assertSent(fn ($request) => $request->url() === 'http://shelf.test/api/knowledge/documents' && str_contains($request->body(), 'article.html') && str_contains($request->body(), 'Read every word.'));
    }

    public function test_cross_user_document_denial_does_not_render_its_contents(): void
    {
        $this->backend(['/api/knowledge/documents/'.self::DOCUMENT => Http::response(['error' => 'Document not found'], 404)], 'user');
        $this->get('/documents/'.self::DOCUMENT)->assertNotFound()->assertDontSee('The full article');
        Http::assertSentCount(2);
    }

    public static function nonAdministrators(): array
    {
        return [['user'], ['guest']];
    }

    #[DataProvider('nonAdministrators')]
    public function test_source_creation_returns_403_for_non_administrators(string $role): void
    {
        $this->backend(role: $role);
        $this->post('/sources', ['name' => 'Unauthorized'])->assertForbidden();
        Http::assertSentCount(1);
    }

    public function test_source_settings_are_sent_with_boolean_and_integer_types(): void
    {
        $this->backend(['/api/knowledge/sources' => ['id' => 'source-1']], mediaType: 'podcast');
        $this->post('/sources', ['name' => 'Lectures', 'url' => 'https://www.youtube.com/@lectures', 'libraryId' => self::LIBRARY, 'libraryFolderId' => self::FOLDER, 'mode' => 'video', 'videoQuality' => '720', 'intervalMinutes' => '360', 'retentionDays' => '0', 'maxItems' => '20', 'enabled' => '1'])->assertRedirectToRoute('sources');
        Http::assertSent(fn ($request) => $request->url() === 'http://shelf.test/api/knowledge/sources' && $request['enabled'] === true && $request['retentionDays'] === 0 && $request['mode'] === 'video' && $request['videoQuality'] === 720);
    }

    public function test_voice_service_failure_keeps_the_document_preview_accessible(): void
    {
        $this->backend(['/api/knowledge/documents/'.self::DOCUMENT => $this->document(), '/api/knowledge/status' => ['elevenLabs' => true], '/api/knowledge/voices' => Http::response(['error' => 'Voices unavailable'], 502), '/api/knowledge/jobs*' => ['jobs' => [], 'total' => 0]]);
        $this->get('/documents/'.self::DOCUMENT)->assertOk()->assertSee('Read every word.')->assertSee('Voices are temporarily unavailable');
        Http::assertSentCount(5);
    }
}
