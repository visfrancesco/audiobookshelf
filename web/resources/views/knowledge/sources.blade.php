@extends('layouts.app')
@section('title', 'YouTube sources')
@section('content')
<header class="page-header"><div><p class="eyebrow">MAKE ROOM FOR CURIOSITY</p><h1>YouTube sources</h1><p class="lede">Follow a channel or playlist. New episodes arrive in your library automatically.</p></div><a class="button primary" href="#new-source">Add source</a></header>
<div class="entity-grid">
@forelse($sources['sources'] as $source)<a class="entity-card" href="{{ route('source', $source['id']) }}" wire:navigate><span class="status-badge">{{ $source['enabled'] ? 'Following' : 'Paused' }}</span><h2>{{ $source['name'] }}</h2><p>{{ $source['mode'] === 'video' ? 'Listen & watch' : 'Audio only' }} · Checks every {{ $source['intervalMinutes'] }} minutes</p>
@if($source['lastError'])<p class="danger">{{ $source['lastError'] }}</p>
@endif</a>
@empty<div class="empty-inline"><h2>Your next discovery starts here.</h2><p>Add a YouTube channel or playlist below.</p></div>
@endforelse</div>
@include('knowledge.page-links', ['total' => $sources['total']])
<section id="new-source" class="panel"><h2>Add a source</h2><form method="post" action="{{ route('sources.create') }}" class="stack">
@csrf @include('knowledge.source-fields', ['source' => []])<button class="button primary">Follow source</button></form></section>
<details class="panel"><summary>Bring an existing Pinchflat source</summary><p>Preview the episodes linked by your existing source mapping. Their files and listening positions are preserved.</p><form method="post" action="{{ route('pinchflat.adopt') }}" class="stack">
@csrf<x-field name="sourceId" label="Existing source mapping ID" required /><x-field name="name" label="Source name" required /><x-field name="url" type="url" label="YouTube channel or playlist URL" required /><button class="button secondary">Preview import</button></form></details>
@endsection
