@extends('layouts.app')
@section('title', 'Your account')
@section('content')
<header class="page-header"><div><p class="eyebrow">YOUR KNOWLEDGESHELF</p><h1>{{ $shelfUser['username'] }}</h1><p class="lede">Your listening, devices, and account.</p></div></header><nav class="tabs">
@foreach(['listening' => 'Listening history', 'security' => 'Password & sessions', 'devices' => 'E-reader devices'] as $key => $label)<a href="{{ route('account', ['tab' => $key]) }}" wire:navigate @class(['active' => $tab === $key])>{{ $label }}</a>
@endforeach</nav>
@if($tab === 'listening')<div class="stat-grid">
@foreach(['today' => 'Today', 'thisWeek' => 'This week', 'thisMonth' => 'This month', 'totalTime' => 'All time'] as $key => $label)<article class="stat-card"><span>{{ $label }}</span><strong>{{ round(($data['stats'][$key] ?? 0) / 3600, 1) }} <small>hours</small></strong></article>
@endforeach</div><section class="panel"><h2>Recent listens</h2>
@forelse($data['history']['sessions'] ?? [] as $listen)<div class="bookmark"><div><a href="{{ route('item', $listen['libraryItemId']) }}" wire:navigate>{{ $listen['displayTitle'] }}</a><small>{{ $listen['displayAuthor'] }} · {{ date('M j, Y', (int) ($listen['updatedAt'] / 1000)) }}</small></div><span>{{ round(($listen['timeListening'] ?? 0) / 60) }} min</span></div>
@empty<p class="muted">Your listening history will appear here.</p>
@endforelse @include('knowledge.page-links', ['total' => $data['history']['total'] ?? 0])</section>
@elseif($tab === 'security')<div class="detail-columns"><section class="panel"><h2>Change password</h2><form action="{{ route('account.save', 'password') }}" method="post" class="stack">
@csrf<x-field name="password" label="Current password" type="password" autocomplete="current-password" /><x-field name="newPassword" label="New password" type="password" minlength="12" autocomplete="new-password" required /><x-field name="newPassword_confirmation" label="Repeat new password" type="password" autocomplete="new-password" required /><button class="button primary">Change password</button></form></section><section class="panel"><h2>Signed-in devices</h2>
@forelse($data['sessions']['sessions'] as $device)<div class="bookmark"><div><strong>{{ $device['deviceInfo']['browser']['name'] ?? $device['deviceInfo']['clientName'] ?? 'Browser or app' }}{{ $device['current'] ? ' · This session' : '' }}</strong><small>{{ $device['ipAddress'] }} · {{ date('M j, Y', (int) ($device['updatedAt'] / 1000)) }}</small></div><form method="post" action="{{ route('account.save', 'revoke-session') }}" data-confirm="Sign out this device?">
@csrf<input type="hidden" name="sessionId" value="{{ $device['id'] }}"><button class="text-button danger">Revoke</button></form></div>
@empty<p>No active sessions.</p>
@endforelse @include('knowledge.page-links', ['total' => $data['sessions']['total']])</section></div>
@else<section class="panel"><h2>Your e-reader addresses</h2>
@foreach($data['user']['ereaderDevices'] ?? [] as $device)<div class="bookmark"><div><strong>{{ $device['name'] }}</strong><small>{{ $device['email'] }}</small></div><form method="post" action="{{ route('account.save', 'remove-device') }}">
@csrf<input type="hidden" name="name" value="{{ $device['name'] }}"><button class="text-button danger">Remove</button></form></div>
@endforeach<form action="{{ route('account.save', 'device') }}" method="post" class="stack">
@csrf<x-field name="name" label="Device name" required /><x-field name="email" label="E-reader email address" type="email" required /><button class="button primary">Add device</button></form></section>
@endif
@endsection
