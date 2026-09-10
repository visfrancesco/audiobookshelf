<details class="panel"><summary>Organize & share</summary>
@if($item['mediaType'] === 'book')<div class="detail-columns">
@foreach(['collections' => 'Collection', 'playlists' => 'Playlist'] as $kind => $label)<section><h3>Add to a {{ strtolower($label) }}</h3>
@forelse($lists[$kind] as $list)<form method="post" action="{{ route('entity.action', [$kind, $list['id'], 'add']) }}">
@csrf<input type="hidden" name="libraryItemId" value="{{ $item['id'] }}"><button class="text-button">+ {{ $list['name'] }}</button></form>
@empty<p class="muted">No {{ strtolower($label) }} yet.</p>
@endforelse<form method="post" action="{{ route('entity.save', $kind) }}" class="stack">
@csrf<input type="hidden" name="libraryId" value="{{ $item['libraryId'] }}">
@if($kind === 'collections')<input type="hidden" name="books[]" value="{{ $item['id'] }}">
@else<input type="hidden" name="items[0][libraryItemId]" value="{{ $item['id'] }}">
@endif<x-field name="name" :label="'New '.strtolower($label).' name'" required /><button class="button secondary small">Create & add this book</button></form></section>
@endforeach</div>
@endif
@if($isAdmin && $item['mediaType'] === 'book')<section class="section"><h3>Share a public listen</h3><form method="post" action="{{ route('item.action', [$item['id'], 'share']) }}" class="stack">
@csrf<x-field name="slug" label="Link name" required pattern="[a-zA-Z0-9_-]+" hint="Letters, numbers, hyphens, and underscores." /><x-field name="days" label="Link expires after (days)" type="number" value="7" min="1" max="3650" required /><label class="check"><input type="checkbox" name="isDownloadable" value="1">Allow downloads from this link</label><button class="button secondary">Create share link</button></form></section>
@endif
@if(!empty($item['media']['ebookFile']))<section class="section"><h3>Send to an e-reader</h3><form method="post" action="{{ route('item.action', [$item['id'], 'send-ebook']) }}" class="stack">
@csrf<x-field name="deviceName" label="Configured device name" required hint="Use an e-reader configured by your administrator." /><button class="button secondary">Send ebook</button></form></section>
@endif
@if(!empty($item['rssFeed']))<p>RSS feed: {{ $item['rssFeed']['feedUrl'] ?? url('/feed/'.$item['rssFeed']['id']) }}</p>
@endif
</details>
