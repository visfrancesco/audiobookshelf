@props(['paginator'])
@if($paginator->hasPages())<nav class="pagination" aria-label="Pagination">
@if($paginator->previousPageUrl())<a class="button secondary" href="{{ $paginator->previousPageUrl() }}" wire:navigate>← Previous</a>
@else<span></span>
@endif<span>Page {{ $paginator->currentPage() }} of {{ $paginator->lastPage() }}</span>
@if($paginator->nextPageUrl())<a class="button secondary" href="{{ $paginator->nextPageUrl() }}" wire:navigate>Next →</a>
@else<span></span>
@endif</nav>
@endif
