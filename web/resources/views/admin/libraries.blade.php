<div class="entity-grid">
@foreach($data['libraries'] as $library)<article class="entity-card"><h2><a href="{{ route('library', $library['id']) }}" wire:navigate>{{ $library['name'] }}</a></h2><p>{{ $library['mediaType'] === 'book' ? 'Audiobooks & ebooks' : 'Podcasts & video' }}</p>
@foreach($library['folders'] as $folder)<small>{{ $folder['fullPath'] }}</small>
@endforeach<div class="button-row"><a class="button secondary small" href="{{ route('manage', ['section' => 'libraries', 'edit' => $library['id']]) }}" wire:navigate>Edit</a><form method="post" action="{{ route('manage.action', ['libraries', 'scan', $library['id']]) }}">
@csrf<button class="button secondary small">Scan now</button></form></div></article>
@endforeach</div><section class="panel"><h2>{{ $edit ? 'Edit library' : 'Create a library' }}</h2><form method="post" action="{{ route('manage.action', ['libraries', 'save', $edit['id'] ?? null]) }}" class="stack">
@csrf @include('admin.library-fields')<button class="button primary">{{ $edit ? 'Save library' : 'Create library' }}</button></form>
@if($edit)<form method="post" class="danger-zone" action="{{ route('manage.action', ['libraries', 'delete', $edit['id']]) }}" data-confirm="Delete this library and its listening history? Original media files remain on disk.">
@csrf<button class="button danger">Delete library</button></form>
@endif</section>
