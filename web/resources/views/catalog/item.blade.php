@extends('layouts.app')
@php($metadata = $item['media']['metadata'] ?? [])
@section('title', $metadata['title'] ?? 'Item')
@section('content')
<a class="back-link" href="{{ route('library', $item['libraryId']) }}" wire:navigate>← Back to library</a>
<section class="item-hero"><div class="hero-cover"><img src="{{ $cover }}" alt="Cover of {{ $metadata['title'] }}" width="280" height="380" data-cover-fallback></div><div><p class="eyebrow">{{ $item['mediaType'] === 'podcast' ? 'PODCAST' : 'AUDIOBOOK' }}</p><h1>{{ $metadata['title'] }}</h1>
@if(!empty($metadata['subtitle']))<p class="lede">{{ $metadata['subtitle'] }}</p>
@endif<p class="item-byline">{{ $metadata['authorName'] ?? $metadata['author'] ?? collect($metadata['authors'] ?? [])->pluck('name')->join(', ') }}</p>
@if(!empty($metadata['narrators']))<p class="muted">Read by {{ implode(', ', $metadata['narrators']) }}</p>
@endif
<div class="tags">
@foreach(array_merge($metadata['genres'] ?? [], $item['media']['tags'] ?? []) as $tag)<span class="tag">{{ $tag }}</span>
@endforeach</div>
<div class="button-row">
@if($item['mediaType'] === 'book' && !empty($item['media']['audioFiles']))<button class="button primary" type="button" data-play data-item="{{ $item['id'] }}" data-mode="audio">▶ {{ !empty($item['userMediaProgress']['currentTime']) ? 'Continue listening' : 'Start listening' }}</button>
@endif
@if(!empty($item['media']['ebookFile']))<a class="button secondary" href="{{ route('reader', $item['id']) }}" wire:navigate>Read document</a>
@endif
@if($shelfUser['permissions']['download'] ?? false)<a class="button secondary" href="{{ route('delivery', ['download', $item['id']]) }}">Download</a>
@endif
@if($shelfUser['permissions']['update'] ?? false)<a class="button secondary" href="{{ route('item.edit', $item['id']) }}" wire:navigate>Edit details</a>
@endif</div>
@if($item['mediaType'] === 'book')<form class="inline-form" method="post" action="{{ route('item.action', [$item['id'], 'finished']) }}">
@csrf<input type="hidden" name="finished" value="{{ empty($item['userMediaProgress']['isFinished']) ? 1 : 0 }}"><button class="text-button">{{ empty($item['userMediaProgress']['isFinished']) ? 'Mark as finished' : 'Mark as unfinished' }}</button></form>
@endif
<x-description :text="$metadata['description'] ?? ''" collapsible /></div></section>
@if($item['mediaType'] === 'podcast')
<section class="section"><div class="section-heading"><h2>Episodes</h2>
@if($isAdmin)<a href="{{ route('podcasts.episodes', $item['id']) }}" wire:navigate>Find & download episodes →</a>
@endif</div>
<div class="episode-list">
@forelse(collect($item['media']['episodes'] ?? [])->sortByDesc('publishedAt') as $episode)<article class="episode"><div class="episode-copy"><small>{{ !empty($episode['publishedAt']) ? date('M j, Y', (int) ($episode['publishedAt'] / 1000)) : '' }}
@if(!empty($episode['videoSource'])) · <span class="tag">Video</span>
@endif</small><h3>{{ $episode['title'] }}</h3><p>{{ \Illuminate\Support\Str::limit(strip_tags($episode['description'] ?? ''), 260) }}</p>
@if(!empty($episode['chapters']))<details><summary>Chapters</summary><ol class="chapter-list">
@foreach($episode['chapters'] as $chapter)<li><button type="button" data-play data-item="{{ $item['id'] }}" data-episode="{{ $episode['id'] }}" data-mode="audio" data-time="{{ $chapter['start'] }}" data-can-watch="{{ !empty($episode['videoSource']['watchAvailable']) ? 1 : 0 }}"><time>{{ \App\Services\MediaTime::clock($chapter['start']) }}</time>{{ $chapter['title'] }}</button></li>
@endforeach</ol></details>
@endif</div>
<div class="episode-actions">
@if($lists['playlists'])<details><summary>Add to playlist</summary>
@foreach($lists['playlists'] as $list)<form method="post" action="{{ route('entity.action', ['playlists', $list['id'], 'add']) }}">
@csrf<input type="hidden" name="libraryItemId" value="{{ $item['id'] }}"><input type="hidden" name="episodeId" value="{{ $episode['id'] }}"><button class="text-button">{{ $list['name'] }}</button></form>
@endforeach</details>
@endif
@if(($episode['videoSource']['available'] ?? true) === false)<span class="status-badge">Original unavailable</span>
@else<button class="button primary small" type="button" data-play data-item="{{ $item['id'] }}" data-episode="{{ $episode['id'] }}" data-mode="audio" data-can-watch="{{ !empty($episode['videoSource']['watchAvailable']) ? 1 : 0 }}">▶ Listen</button>
@if(!empty($episode['videoSource']['watchAvailable']))<button class="button secondary small" type="button" data-play data-item="{{ $item['id'] }}" data-episode="{{ $episode['id'] }}" data-mode="video" data-can-watch="1">Watch</button>
@elseif(!empty($episode['videoSource']['watchReason']))<div class="playback-help"><p>Video is not ready for this browser. You can still listen.</p>@if($isAdmin)<a href="{{ route('sources') }}" wire:navigate>Manage video sources</a><details><summary>Technical details</summary><small>{{ $episode['videoSource']['watchReason'] }}</small></details>@endif</div>
@endif
@endif
@if($isAdmin)<form method="post" action="{{ route('podcasts.action', [$item['id'], 'remove']) }}" data-confirm="Remove this episode from the library?">
@csrf<input type="hidden" name="episodeId" value="{{ $episode['id'] }}"><button class="text-button danger">Remove</button></form>
@endif</div></article>
@empty<div class="empty-inline"><h3>No episodes yet.</h3><p>Add a source or check this podcast for new episodes.</p></div>
@endforelse</div></section>
@else
<div class="detail-columns"><section class="panel"><h2>Chapters</h2><ol class="chapter-list">
@forelse($item['media']['chapters'] ?? [] as $chapter)<li><button type="button" data-play data-item="{{ $item['id'] }}" data-mode="audio" data-time="{{ $chapter['start'] }}"><time>{{ \App\Services\MediaTime::clock($chapter['start']) }}</time>{{ $chapter['title'] }}</button></li>
@empty<li class="muted">This audiobook has no chapter markers.</li>
@endforelse</ol></section><section class="panel"><h2>Your bookmarks</h2>
@forelse($bookmarks['bookmarks'] ?? [] as $bookmark)<div class="bookmark"><button type="button" class="text-button" data-play data-item="{{ $item['id'] }}" data-mode="audio" data-time="{{ $bookmark['time'] }}">{{ \App\Services\MediaTime::clock($bookmark['time']) }} · {{ $bookmark['title'] }}</button><form method="post" action="{{ route('item.action', [$item['id'], 'remove-bookmark']) }}">
@csrf<input type="hidden" name="time" value="{{ $bookmark['time'] }}"><button class="text-button" aria-label="Remove bookmark">×</button></form></div>
@empty<p class="muted">Save a moment using Bookmark in the player.</p>
@endforelse</section></div>
@endif
@include('catalog.list-actions')
@if($isAdmin)<details class="panel"><summary>Manage this item</summary><div class="button-row">
@foreach(['scan' => 'Rescan files', 'feed' => 'Open RSS feed', 'embed' => 'Embed metadata', 'encode' => 'Create M4B'] as $action => $label)<form method="post" action="{{ route('item.action', [$item['id'], $action]) }}">
@csrf<button class="button secondary small">{{ $label }}</button></form>
@endforeach</div><form method="post" action="{{ route('item.action', [$item['id'], 'delete']) }}" class="danger-zone" data-confirm="Remove this item? Listening progress will also be removed.">
@csrf<label class="check"><input type="checkbox" name="deleteFiles" value="1">Also delete files from disk</label><button class="button danger">Remove item</button></form></details>
@endif
@endsection
