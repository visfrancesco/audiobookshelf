@props(['item', 'cover' => null])
@php($metadata = $item['media']['metadata'] ?? [])
<article class="item-card"><a href="{{ route('item', $item['id']) }}" wire:navigate class="cover-link" aria-label="{{ $metadata['title'] ?? 'Open item' }}"><div class="cover-placeholder"><span>{{ mb_substr($metadata['title'] ?? 'K', 0, 1) }}</span></div><img src="{{ $cover ?? route('delivery', ['cover', $item['id']]) }}" alt="" loading="lazy" decoding="async" width="240" height="320" data-cover-fallback><span class="cover-action" aria-hidden="true">Open →</span></a><div class="item-copy"><a href="{{ route('item', $item['id']) }}" wire:navigate><h3 title="{{ $metadata['title'] ?? 'Untitled' }}">{{ $metadata['title'] ?? 'Untitled' }}</h3></a><p>{{ $metadata['authorName'] ?? $metadata['author'] ?? collect($metadata['authors'] ?? [])->pluck('name')->join(', ') }}</p><small>{{ ($item['mediaType'] ?? 'book') === 'podcast' ? 'Podcast' : 'Audiobook' }}
@if(!empty($item['media']['duration'])) · {{ \App\Services\MediaTime::duration($item['media']['duration']) }}
@endif</small>
@if(!empty($item['userMediaProgress']['progress']))<progress value="{{ $item['userMediaProgress']['progress'] }}" max="1" aria-label="Listening progress"></progress>
@endif</div></article>
