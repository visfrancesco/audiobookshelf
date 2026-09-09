@extends('layouts.app')
@section('title', 'Welcome')
@section('content')
<div class="empty-state"><span class="empty-symbol">▤</span><p class="eyebrow">A LITTLE SPACE FOR WHAT MATTERS</p><h1>Your shelf starts here.</h1><p>Add a library to bring your audiobooks, podcasts and documents together.</p>
@if($isAdmin)<a class="button primary" href="{{ route('manage', 'libraries') }}" wire:navigate>Add your first library →</a>
@else<p>Your administrator can give you access to a library.</p>
@endif</div>
@endsection
