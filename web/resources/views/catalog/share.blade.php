@extends('layouts.app')
@section('title', 'A shared listen')
@section('content')
<section class="share-page" data-public-share="{{ $slug }}"><a class="brand" href="{{ route('home') }}">KnowledgeShelf</a><p class="eyebrow">SOMETHING WORTH SHARING</p><h1 data-share-title>A shared listen</h1><p data-share-author></p><div class="hero-cover"><img data-share-cover hidden alt="Book cover" width="280" height="380"></div><p data-share-status role="status">Opening this listen…</p><audio data-share-media controls preload="metadata" hidden></audio><label class="field"><span>Track</span><select data-share-track aria-label="Audio track"></select></label><a class="button secondary" data-share-download hidden>Download</a><p class="description" data-share-description></p></section>
@endsection
