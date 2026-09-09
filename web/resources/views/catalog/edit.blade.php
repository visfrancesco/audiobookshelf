@extends('layouts.app')
@php($metadata = $item['media']['metadata'])
@section('title', 'Edit '.$metadata['title'])
@section('content')
<header class="page-header"><div><a class="back-link" href="{{ route('item', $item['id']) }}" wire:navigate>← Back to item</a><h1>Edit details</h1></div></header>
<form class="panel stack" method="post" action="{{ route('item.update', $item['id']) }}">
@csrf<x-field name="title" label="Title" :value="$metadata['title']" required /><x-field name="subtitle" label="Subtitle" :value="$metadata['subtitle'] ?? ''" />
@if($item['mediaType'] === 'book')<div class="form-grid"><x-field name="authors" label="Authors" :value="collect($metadata['authors'] ?? [])->pluck('name')->join(', ')" hint="Separate names with commas." /><x-field name="narrators" label="Narrators" :value="implode(', ', $metadata['narrators'] ?? [])" /></div>
@else<x-field name="author" label="Author" :value="$metadata['author'] ?? ''" />
@endif
<x-field name="description" label="Description" type="textarea" rows="8" :value="strip_tags($metadata['description'] ?? '')" />
<div class="form-grid">
@foreach(['genres' => 'Genres', 'tags' => 'Tags', 'publishedYear' => 'Publication year', 'language' => 'Language', 'publisher' => 'Publisher', 'isbn' => 'ISBN', 'asin' => 'ASIN'] as $key => $label)<x-field :name="$key" :label="$label" :value="$key === 'genres' ? implode(', ', $metadata['genres'] ?? []) : ($key === 'tags' ? implode(', ', $item['media']['tags'] ?? []) : ($metadata[$key] ?? ''))" />
@endforeach</div>
<div class="button-row"><label class="check"><input type="checkbox" name="explicit" value="1" @checked($metadata['explicit'] ?? false)>Explicit content</label><label class="check"><input type="checkbox" name="abridged" value="1" @checked($metadata['abridged'] ?? false)>Abridged</label></div><button class="button primary">Save details</button></form>
<details class="panel"><summary>Change cover</summary><form method="post" enctype="multipart/form-data" action="{{ route('item.action', [$item['id'], 'cover']) }}" class="stack">
@csrf<x-field name="file" label="Cover image" type="file" accept="image/jpeg,image/png,image/webp" required /><button class="button secondary">Upload cover</button></form></details>
@if($item['mediaType'] === 'book')<details class="panel"><summary>Edit chapters</summary><form method="post" action="{{ route('item.action', [$item['id'], 'chapters']) }}" class="stack">
@csrf<p>Times are in seconds from the beginning of the audiobook.</p><div id="chapter-fields" data-chapters>
@foreach($item['media']['chapters'] ?? [] as $index => $chapter)<div class="chapter-edit chapter-fields"><x-field name="chapters[{{ $index }}][title]" label="Title" :value="$chapter['title']" required /><x-field name="chapters[{{ $index }}][start]" label="Start" type="number" min="0" step="0.01" :value="$chapter['start']" required /><x-field name="chapters[{{ $index }}][end]" label="End" type="number" min="0" step="0.01" :value="$chapter['end']" required /></div>
@endforeach</div><button type="button" class="button secondary" data-add-chapter>Add chapter</button><button class="button primary">Save chapters</button></form></details>
@endif
@endsection
