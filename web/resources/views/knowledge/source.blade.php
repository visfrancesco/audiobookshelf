@extends('layouts.app')
@section('title', $source['name'])
@section('content')
<a class="back-link" href="{{ route('sources') }}" wire:navigate>← YouTube sources</a><header class="page-header"><div><p class="eyebrow">{{ $source['enabled'] ? 'FOLLOWING' : 'PAUSED' }}</p><h1>{{ $source['name'] }}</h1><p class="muted">{{ $source['url'] }}</p></div><div class="button-row">
@if($source['libraryItemId'])<a class="button primary" href="{{ route('item', $source['libraryItemId']) }}" wire:navigate>Open episodes</a>
@endif<form action="{{ route('source.action', [$source['id'], 'check']) }}" method="post">
@csrf<button class="button secondary">Check now</button></form></div></header>
@if($source['lastError'])<div class="error-box">{{ $source['lastError'] }}</div>
@endif
<div class="detail-columns"><section class="panel"><h2>Source settings</h2><form action="{{ route('source.save', $source['id']) }}" method="post" class="stack">
@csrf @include('knowledge.source-fields')<button class="button primary">Save settings</button></form></section><section class="panel"><h2>Downloaded originals <span class="muted">{{ $assets['total'] }}</span></h2><p class="muted">Last checked {{ $source['lastCheckedAt'] ? \Carbon\Carbon::parse($source['lastCheckedAt'])->diffForHumans() : 'never' }}. Showing up to 100 recent originals.</p>
@forelse($assets['assets'] as $asset)<div class="bookmark"><div><strong>{{ $asset['externalId'] }}</strong><small>{{ $asset['available'] ? 'Available' : 'Unavailable' }} · {{ $asset['owned'] ? 'Managed by KnowledgeShelf' : 'External original' }}{{ $asset['excluded'] ? ' · Excluded' : '' }}</small></div><form action="{{ route('source.action', [$asset['id'], 'refresh']) }}" method="post">
@csrf<button class="text-button">Refresh</button></form></div>
@empty<p>No downloads yet. Check Activity for progress.</p>
@endforelse<a href="{{ route('jobs') }}" wire:navigate>View activity →</a></section></div>
<form class="danger-zone" method="post" action="{{ route('source.action', [$source['id'], 'delete']) }}" data-confirm="Remove this subscription? Imported media will remain in your library.">
@csrf<button class="button danger">Remove source</button></form>
@endsection
