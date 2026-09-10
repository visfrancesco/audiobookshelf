@extends('layouts.app')
@section('title', $item['media']['metadata']['title'])
@section('content')
<header class="reader-toolbar"><a href="{{ route('item', $item['id']) }}" wire:navigate>← {{ $item['media']['metadata']['title'] }}</a><div class="button-row"><button class="button secondary small" type="button" data-reader="previous">Previous</button><button class="button secondary small" type="button" data-reader="smaller" aria-label="Smaller text">A−</button><button class="button secondary small" type="button" data-reader="larger" aria-label="Larger text">A+</button><button class="button secondary small" type="button" data-reader="next">Next</button></div></header>
@if(strtolower($item['media']['ebookFile']['ebookFormat'] ?? $item['media']['ebookFile']['metadata']['ext'] ?? '') === 'epub' || str_ends_with(strtolower($item['media']['ebookFile']['metadata']['filename'] ?? ''), '.epub'))<div id="ebook-reader" data-url="{{ $url }}" data-item="{{ $item['id'] }}" data-location="{{ $item['userMediaProgress']['ebookLocation'] ?? '' }}"></div>
@else<iframe class="document-frame" src="{{ $url }}" title="{{ $item['media']['metadata']['title'] }}" referrerpolicy="no-referrer"></iframe>
@endif
@endsection
