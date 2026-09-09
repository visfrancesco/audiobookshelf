@extends('layouts.app')
@section('title', $library['name'])
@section('content')
<header class="page-header"><div><p class="eyebrow">YOUR SPACE TO LISTEN & LEARN</p><h1>{{ $library['name'] }}</h1><p class="muted">{{ number_format($paginator->total()) }} {{ $view === 'items' ? 'items on your shelf' : str_replace('-', ' ', $view) }}</p></div><div class="header-actions">
@if($isAdmin && $library['mediaType'] === 'podcast')<a class="button secondary" href="{{ route('podcasts.add') }}" wire:navigate>Add podcast</a>
@endif<a class="button primary" href="{{ $library['mediaType'] === 'podcast' && $isAdmin ? route('sources') : route('documents') }}" wire:navigate>{{ $library['mediaType'] === 'podcast' && $isAdmin ? '+ YouTube source' : '+ Create an audiobook' }}</a></div></header>
<nav class="tabs" aria-label="Browse library">
@foreach(['items' => 'All items', 'series' => 'Series', 'authors' => 'Authors', 'narrators' => 'Narrators', 'collections' => 'Collections', 'playlists' => 'Playlists', 'stats' => 'Statistics'] as $key => $label)
@if($library['mediaType'] === 'book' || !in_array($key, ['series', 'authors', 'narrators', 'collections']))<a href="{{ route('library', ['id' => $library['id'], 'view' => $key]) }}" wire:navigate @class(['active' => $view === $key])>{{ $label }}</a>
@endif
@endforeach</nav>
<form class="browse-toolbar" method="get" action="{{ route('library', $library['id']) }}"><label class="search"><span class="sr-only">Search this library</span><input name="q" value="{{ request('q') }}" placeholder="Find your next good listen…" type="search"></label><label class="sort"><span class="sr-only">Sort items</span><select name="sort"><option value="media.metadata.title">Title, A to Z</option><option value="addedAt" @selected(request('sort') === 'addedAt')>Date added</option><option value="media.duration" @selected(request('sort') === 'media.duration')>Duration</option></select></label><button class="button secondary" type="submit">Search</button></form>
@if($view === 'stats')<div class="stat-grid">
@foreach($data as $key => $value)
@if(is_numeric($value))<article class="stat-card"><span>{{ \Illuminate\Support\Str::headline($key) }}</span><strong>{{ number_format($value) }}</strong></article>
@endif
@endforeach</div>
@elseif($view === 'items')<div class="shelf-grid">
@forelse($items as $item)<x-item-card :item="$item" :cover="$covers['/items/'.$item['id'].'/cover'] ?? null" />
@empty<div class="empty-inline"><h2>{{ request('q') ? 'No matches yet.' : 'Ready for your first listen.' }}</h2><p>{{ request('q') ? 'Try another title or author.' : 'Upload media, add a source or create audio from a document.' }}</p></div>
@endforelse</div>
@else<div class="entity-grid">
@forelse($items as $entity)<a class="entity-card" href="{{ $view === 'narrators' ? route('library', ['id' => $library['id'], 'filter' => 'narrators.'.base64_encode($entity['name'])]) : route('entity', [$view, $entity['id']]) }}" wire:navigate><span class="entity-symbol">{{ $view === 'authors' ? '◯' : '▤' }}</span><h2>{{ $entity['name'] ?? $entity['title'] ?? 'Untitled' }}</h2><p>{{ $entity['numBooks'] ?? count($entity['books'] ?? $entity['items'] ?? []) }} items</p></a>
@empty<div class="empty-inline"><h2>No {{ $view }} yet.</h2></div>
@endforelse</div>
@if(in_array($view, ['collections', 'playlists']))<details class="panel"><summary>Create {{ $view === 'collections' ? 'a collection' : 'a playlist' }}</summary><form class="stack" method="post" action="{{ route('entity.save', $view) }}">
@csrf<input type="hidden" name="libraryId" value="{{ $library['id'] }}"><x-field name="name" label="Name" required /><x-field name="description" label="Description" type="textarea" rows="3" />
@if($view === 'collections')<x-item-picker :library-id="$library['id']" name="books[]" multiple />
@endif<button class="button primary">Create</button></form></details>
@endif
@endif
<x-pagination :paginator="$paginator" />
@endsection
