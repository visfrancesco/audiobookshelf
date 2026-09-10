@extends('layouts.app')
@section('title', ($status['isInit'] ?? true) ? 'Sign in' : 'Welcome')
@section('content')
<section class="sign-in"><a class="wordmark" href="{{ route('login') }}">KnowledgeShelf</a><p class="eyebrow">MAKE ROOM FOR CURIOSITY</p><h1>{{ ($status['isInit'] ?? true) ? 'Your next good listen.' : 'A home for everything you want to learn.' }}</h1><p class="lede">Books, conversations and the words you saved. All on your shelf.</p>

@if(!($status['isInit'] ?? true))<h2>Create your administrator account</h2>
@endif
    @if(!($status['isInit'] ?? true) || in_array('local', $status['authMethods'] ?? ['local']))
    <form action="{{ ($status['isInit'] ?? true) ? route('login.store') : route('setup') }}" method="post" class="stack">
@csrf
        <x-field name="username" label="Username" autocomplete="username" required />
        <x-field name="password" label="Password" type="password" autocomplete="{{ ($status['isInit'] ?? true) ? 'current-password' : 'new-password' }}" :required="!($status['isInit'] ?? true)" />

@if(!($status['isInit'] ?? true))<x-field name="password_confirmation" label="Confirm password" type="password" autocomplete="new-password" required /><small>Use at least 12 characters.</small>
@endif
        <button class="button primary" type="submit">{{ ($status['isInit'] ?? true) ? 'Open my shelf' : 'Create my shelf' }} <span aria-hidden="true">→</span></button>
    </form>
    @endif

@if(in_array('openid', $status['authMethods'] ?? []))<a class="button secondary full-width" href="{{ route('login.oidc') }}">Sign in with OpenID</a>
@endif
    <p class="fine-print">Your library. Your server. Built on Audiobookshelf.</p>
</section>
@endsection
