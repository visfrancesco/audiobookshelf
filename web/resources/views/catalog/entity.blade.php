@extends('layouts.app')
@section('title', $entity['name'] ?? 'Your list')
@section('content')
@if($entity['libraryId'] ?? session('shelf.default_library'))<a class="back-link" href="{{ route('library', ['id' => $entity['libraryId'] ?? session('shelf.default_library'), 'view' => $kind]) }}" wire:navigate>← Back to {{ $kind }}</a>@endif
<header class="page-header"><div><p class="eyebrow">{{ strtoupper(rtrim($kind, 's')) }}</p><h1>{{ $entity['name'] ?? 'Your list' }}</h1><p class="muted">{{ $entity['total'] ?? count($entity['books'] ?? $entity['libraryItems'] ?? $entity['items'] ?? []) }} items</p><x-description :text="$entity['description'] ?? ''" /></div></header>
<div class="shelf-grid">
@foreach($entity['books'] ?? $entity['libraryItems'] ?? $entity['items'] ?? [] as $entry)
@php($item = $entry['libraryItem'] ?? $entry)<div><x-item-card :item="$item" />
@if(in_array($kind, ['collections', 'playlists']))<form action="{{ route('entity.action', [$kind, $entity['id'], 'remove']) }}" method="post">
@csrf<input type="hidden" name="libraryItemId" value="{{ $item['id'] }}">
@if(!empty($entry['episodeId']))<input type="hidden" name="episodeId" value="{{ $entry['episodeId'] }}">
@endif<button class="text-button danger">Remove from list</button></form>
@endif</div>
@endforeach</div>
<details class="panel"><summary>Edit {{ rtrim($kind, 's') }}</summary><form method="post" action="{{ route('entity.save', [$kind, $entity['id']]) }}" class="stack">
@csrf<x-field name="name" label="Name" :value="$entity['name'] ?? ''" required /><x-field name="description" label="Description" type="textarea" rows="4" :value="strip_tags($entity['description'] ?? '')" /><button class="button primary">Save</button></form>
@if(in_array($kind, ['collections', 'playlists']))<form class="danger-zone" method="post" action="{{ route('entity.action', [$kind, $entity['id'], 'delete']) }}" data-confirm="Delete this list? Its media will remain in your library.">
@csrf<button class="button danger">Delete list</button></form>
@endif</details>
@if(isset($entity['total']))@include('knowledge.page-links', ['total' => $entity['total']])
@endif
@if(in_array($kind, ['collections', 'playlists']))<section class="panel"><h2>Add books</h2><form method="post" action="{{ route('entity.action', [$kind, $entity['id'], 'add']) }}" class="stack">
@csrf<x-item-picker :library-id="$entity['libraryId']" /><button class="button secondary">Add selected book</button></form><p class="muted">Add podcast episodes from the podcast’s page.</p></section><details class="panel"><summary>Change order</summary><form action="{{ route('entity.action', [$kind, $entity['id'], 'reorder']) }}" method="post" class="stack">
@csrf<div data-reorder-list>
@foreach($entity['books'] ?? $entity['items'] ?? [] as $index => $entry)
@php($media = $entry['libraryItem'] ?? $entry)<div class="bookmark" data-reorder-row><input type="hidden" name="items[{{ $index }}][libraryItemId]" value="{{ $media['id'] }}">
@if(!empty($entry['episodeId']))<input type="hidden" name="items[{{ $index }}][episodeId]" value="{{ $entry['episodeId'] }}">
@endif<strong>{{ $entry['episode']['title'] ?? $media['media']['metadata']['title'] }}</strong><div class="button-row"><button class="text-button" type="button" data-move="up" aria-label="Move up">↑</button><button class="text-button" type="button" data-move="down" aria-label="Move down">↓</button></div></div>
@endforeach</div><button class="button secondary">Save order</button></form></details>
@endif
@endsection
