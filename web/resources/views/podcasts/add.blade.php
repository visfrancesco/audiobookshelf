@extends('layouts.app')
@section('title', 'Add podcast')
@section('content')
<header class="page-header"><div><p class="eyebrow">FOLLOW THE CONVERSATION</p><h1>Add a podcast</h1><p class="lede">Subscribe using a podcast’s RSS feed.</p></div></header><section class="panel"><form method="post" action="{{ route('podcasts.preview') }}" class="stack">
@csrf<x-field name="rssFeed" label="RSS feed URL" type="url" required /><button class="button secondary">Preview podcast</button></form></section>
@if($preview)<section class="panel"><h2>{{ $preview['metadata']['title'] }}</h2><p class="description">{{ strip_tags($preview['metadata']['description'] ?? '') }}</p><p class="muted">{{ count($preview['episodes'] ?? []) }} episodes in this feed.</p><form action="{{ route('podcasts.store') }}" method="post" class="stack">
@csrf<x-field name="title" label="Title" :value="$preview['metadata']['title']" required /><x-destination media-type="podcast" /><label class="check"><input type="checkbox" name="autoDownloadEpisodes" value="1" checked>Download new episodes automatically</label><x-field name="schedule" label="Check schedule" value="0 * * * *" hint="Cron expression. The default checks once an hour." /><x-field name="maxEpisodesToKeep" label="Maximum episodes to keep" value="0" type="number" min="0" max="10000" hint="0 keeps all downloaded episodes." required /><button class="button primary">Add podcast</button></form></section>
@endif
@endsection
