
@php($currentPage = max(1, request()->integer('page', 1)))
@if($total > 30)<nav class="pagination" aria-label="Pages"><span>{{ number_format($total) }} total</span><div class="button-row">
@if($currentPage > 1)<a class="button secondary small" href="{{ request()->fullUrlWithQuery(['page' => $currentPage - 1]) }}" wire:navigate>Previous</a>
@endif<span>Page {{ $currentPage }}</span>
@if($currentPage * 30 < $total)<a class="button secondary small" href="{{ request()->fullUrlWithQuery(['page' => $currentPage + 1]) }}" wire:navigate>Next</a>
@endif</div></nav>
@endif
