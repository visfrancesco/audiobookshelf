<?php

namespace Tests\Feature\Livewire;

use App\Livewire\Jobs;
use Illuminate\Support\Facades\Http;
use Livewire\Livewire;
use Tests\TestCase;

class JobsTest extends TestCase
{
    public function test_uncertain_narration_retry_requires_explicit_acknowledgement(): void
    {
        $this->backend(['/api/knowledge/jobs*' => function ($request) {
            if (str_ends_with($request->url(), '/retry')) {
                return $request['acknowledgeUncertain'] ? Http::response(['id' => self::JOB]) : Http::response(['error' => 'Confirm the possible duplicate charge.'], 409);
            }

            return Http::response(['jobs' => [], 'total' => 0]);
        }]);
        Livewire::test(Jobs::class)->call('retry', self::JOB)->assertHasErrors('request')->set('acknowledged.'.self::JOB, true)->call('retry', self::JOB)->assertDispatched('notice');
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/retry') && $request['acknowledgeUncertain'] === true);
    }

    public function test_filtering_jobs_resets_pagination_and_preserves_the_document_scope(): void
    {
        $this->backend(['/api/knowledge/jobs*' => ['jobs' => [], 'total' => 0]]);
        Livewire::test(Jobs::class, ['documentId' => self::DOCUMENT])->set('page', 3)->set('state', 'failed')->assertSet('page', 1);
        Http::assertSent(fn ($request) => $request['documentId'] === self::DOCUMENT && ($request['state'] ?? null) === 'failed' && $request['offset'] === 0);
    }

    public function test_document_preview_refreshes_after_extraction_finishes(): void
    {
        $this->backend(['/api/knowledge/jobs*' => ['jobs' => [], 'total' => 0], '/api/knowledge/documents/'.self::DOCUMENT => Http::sequence()->push(['state' => 'extracting'])->push(['state' => 'ready'])]);
        Livewire::test(Jobs::class, ['documentId' => self::DOCUMENT, 'documentState' => 'extracting'])
            ->assertNotDispatched('document-ready')
            ->call('$refresh')
            ->assertDispatched('document-ready', documentId: self::DOCUMENT);
    }
}
