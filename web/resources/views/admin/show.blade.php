@extends('layouts.app')
@section('title', $sections[$section])
@section('content')
<header class="page-header"><div><p class="eyebrow">YOUR WORKSPACE</p><h1>{{ $sections[$section] }}</h1><p class="muted">KnowledgeShelf {{ session('shelf.settings.version', '2.37.0') }}</p></div></header><nav class="admin-navigation" aria-label="Administration">
@foreach(['Library & people' => ['libraries', 'users', 'tags', 'sessions'], 'Connections' => ['feeds', 'email', 'notifications', 'metadata'], 'Server & security' => ['settings', 'authentication', 'api-keys', 'backups', 'logs']] as $group => $keys)
<div class="admin-nav-group"><p class="nav-label">{{ $group }}</p><div class="section-nav">
@foreach($keys as $key)<a href="{{ route('manage', $key) }}" wire:navigate aria-current="{{ $key === $section ? 'page' : 'false' }}" @class(['active' => $key === $section])>{{ $sections[$key] }}</a>@endforeach
</div></div>@endforeach</nav>
@if($fields)<section class="panel"><form method="post" action="{{ route('manage.action', [$section, 'save']) }}" class="stack">
@csrf
@if($section === 'authentication')<fieldset><legend>Sign-in methods</legend>
@foreach(['local' => 'Username and password', 'openid' => 'OpenID Connect'] as $method => $label)<label class="check"><input type="checkbox" name="authActiveAuthMethods[]" value="{{ $method }}" @checked(in_array($method, $data['settings']['authActiveAuthMethods'] ?? []))>{{ $label }}</label>
@endforeach</fieldset>
@endif @include('admin.settings-fields', ['values' => $data['settings']])<button class="button primary">Save settings</button></form>
@if($section === 'email')<form method="post" action="{{ route('manage.action', ['email', 'test']) }}" class="section">
@csrf<button class="button secondary">Send test email</button></form>
@endif</section>
@endif
@if(view()->exists('admin.'.$section))@include('admin.'.$section)
@endif
@endsection
