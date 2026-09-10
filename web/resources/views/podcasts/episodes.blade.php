@extends('layouts.app')
@section('title', 'Download episodes')
@section('content')
<a class="back-link" href="{{ route('item', $item['id']) }}" wire:navigate>← {{ $item['media']['metadata']['title'] }}</a><header class="page-header"><div><p class="eyebrow">PODCAST EPISODES</p><h1>Choose your next listen</h1><p class="muted">{{ $total }} episodes in this feed</p></div><form method="post" action="{{ route('podcasts.action', [$item['id'], 'check']) }}">
@csrf<button class="button secondary">Download newest episodes</button></form></header>
@if($downloads)<section class="panel"><h2>Download queue</h2>
@foreach($downloads as $download)<div class="bookmark"><strong>{{ $download['episode']['title'] ?? $download['title'] ?? 'Episode' }}</strong><span>{{ $download['status'] ?? 'Queued' }}</span></div>
@endforeach<form method="post" action="{{ route('podcasts.action', [$item['id'], 'clear']) }}">
@csrf<button class="text-button danger">Clear queued downloads</button></form></section>
@endif
<form action="{{ route('podcasts.action', [$item['id'], 'download']) }}" method="post">
@csrf<div class="episode-list">
@forelse($episodes as $index => $episode)<label class="episode"><input type="checkbox" name="episodes[]" value="{{ $index }}"><div class="episode-copy"><h3>{{ $episode['title'] }}</h3><p>{{ \Illuminate\Support\Str::limit(strip_tags($episode['description'] ?? ''), 300) }}</p></div></label>
@empty<div class="empty-inline"><h2>No RSS episodes available.</h2><p>YouTube episodes are managed from YouTube sources.</p></div>
@endforelse</div>
@if($episodes)<button class="button primary">Download selected episodes</button>
@endif</form>
@include('knowledge.page-links')
<details class="panel"><summary>Automatic downloads</summary><form method="post" action="{{ route('podcasts.action', [$item['id'], 'schedule']) }}" class="stack">
@csrf<label class="check"><input type="checkbox" name="autoDownloadEpisodes" value="1" @checked($item['media']['autoDownloadEpisodes'] ?? false)>Download new episodes automatically</label><x-field name="schedule" label="Check schedule" :value="$item['media']['autoDownloadSchedule'] ?? '0 * * * *'" required /><x-field name="maxEpisodesToKeep" label="Maximum episodes to keep (0 keeps all)" type="number" :value="$item['media']['maxEpisodesToKeep'] ?? 0" min="0" max="10000" required /><button class="button secondary">Save schedule</button></form></details>
@endsection
