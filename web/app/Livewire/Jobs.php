<?php

namespace App\Livewire;

use App\Services\ShelfApi;
use Illuminate\View\View;
use Livewire\Attributes\Locked;
use Livewire\Component;

class Jobs extends Component
{
    #[Locked]
    public ?string $documentId = null;

    #[Locked]
    public ?string $documentState = null;

    public string $state = '';

    public int $page = 1;

    public array $acknowledged = [];

    public function cancel(string $id): void
    {
        validator(['id' => $id], ['id' => 'required|uuid'])->validate();
        app(ShelfApi::class)->post("/api/knowledge/jobs/$id/cancel");
        $this->dispatch('notice', message: 'Job cancelled.');
    }

    public function retry(string $id): void
    {
        validator(['id' => $id], ['id' => 'required|uuid'])->validate();
        app(ShelfApi::class)->post("/api/knowledge/jobs/$id/retry", ['acknowledgeUncertain' => ($this->acknowledged[$id] ?? false) === true]);
        $this->dispatch('notice', message: 'Job queued for retry.');
    }

    public function updatedState(): void
    {
        $this->page = 1;
    }

    public function next(): void
    {
        $this->page++;
    }

    public function previous(): void
    {
        $this->page = max(1, $this->page - 1);
    }

    public function render(): View
    {
        $query = ['limit' => 30, 'offset' => ($this->page - 1) * 30];
        if ($this->state) {
            $query['state'] = $this->state;
        }
        if ($this->documentId) {
            $query['documentId'] = $this->documentId;
        }
        $result = app(ShelfApi::class)->get('/api/knowledge/jobs', $query);
        if ($this->documentId && in_array($this->documentState, ['extracting', 'generating'], true)) {
            $document = app(ShelfApi::class)->get("/api/knowledge/documents/$this->documentId");
            if ($document['state'] !== $this->documentState) {
                $this->dispatch('document-ready', documentId: $this->documentId);
            }
        }

        return view('livewire.jobs', ['result' => $result]);
    }
}
