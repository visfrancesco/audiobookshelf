@extends('layouts.app')
@section('title', 'Import Pinchflat source')
@section('content')
<header class="page-header"><div><p class="eyebrow">READY TO BRING ACROSS</p><h1>{{ $data['name'] }}</h1><p class="lede">{{ $result['episodes'] }} existing episodes can be adopted.</p></div></header><section class="panel"><p>The source starts paused. Existing episode IDs, listening progress, bookmarks, and original files are preserved. KnowledgeShelf will not delete originals owned by Pinchflat.</p><a href="{{ route('item', $result['libraryItemId']) }}" wire:navigate>Review the existing episodes →</a><form action="{{ route('pinchflat.adopt') }}" method="post" class="stack">
@csrf
@foreach($data as $key => $value)<input type="hidden" name="{{ $key }}" value="{{ $value }}">
@endforeach<input type="hidden" name="confirmed" value="1"><button class="button primary">Adopt {{ $result['episodes'] }} episodes</button></form></section>
@endsection
