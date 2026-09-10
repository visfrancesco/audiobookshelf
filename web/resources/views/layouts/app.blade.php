<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}"><meta name="theme-color" content="#173d36">
    <title>@yield('title', 'Your library') · KnowledgeShelf</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles
</head>
<body data-user-id="{{ $shelfUser['id'] ?? '' }}" data-public-prefix="{{ config('knowledge.public_prefix') }}">
<a href="#main" class="skip-link">Skip to content</a>
@if(isset($shelfUser))
<aside class="sidebar" id="navigation" aria-label="Main navigation">
    <a class="brand" href="{{ route('home') }}" wire:navigate><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 7h6v17H5zm9 0h5v17h-5zm8 0h5v17h-5zM3 27h26" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>Knowledge<span class="brand-light">Shelf</span></span></a>
    <p class="nav-label">YOUR LIBRARIES</p>
    <nav>

@foreach($libraries as $library)
            <a href="{{ route('library', $library['id']) }}" wire:navigate @class(['nav-link', 'active' => (isset($item) ? ($item['libraryId'] ?? null) : (isset($entity) ? ($entity['libraryId'] ?? session('shelf.default_library')) : request()->route('id'))) === $library['id']])><span class="nav-symbol">{{ $library['mediaType'] === 'podcast' ? '◉' : '▤' }}</span>{{ $library['name'] }}</a>

@endforeach
        <p class="nav-label">BRING SOMETHING NEW</p>
        <a class="nav-link {{ request()->is('documents*') ? 'active' : '' }}" href="{{ route('documents') }}" wire:navigate><span class="nav-symbol">▧</span>Documents</a>

@if($isAdmin)<a class="nav-link {{ request()->is('sources*') ? 'active' : '' }}" href="{{ route('sources') }}" wire:navigate><span class="nav-symbol">↙</span>YouTube sources</a>
@endif
        <a class="nav-link {{ request()->is('jobs') ? 'active' : '' }}" href="{{ route('jobs') }}" wire:navigate><span class="nav-symbol">◷</span>Activity</a>

@if($isAdmin || ($shelfUser['permissions']['upload'] ?? false))<a class="nav-link" href="{{ route('upload') }}" wire:navigate><span class="nav-symbol">↑</span>Upload media</a>
@endif

@if($isAdmin)<p class="nav-label">WORKSPACE</p><a class="nav-link {{ request()->is('manage*') ? 'active' : '' }}" href="{{ route('manage') }}" wire:navigate><span class="nav-symbol">⚙</span>Manage shelf</a>
@endif
    </nav>
    <div class="sidebar-bottom"><a href="{{ route('account') }}" wire:navigate class="account-link"><span class="avatar">{{ mb_strtoupper(mb_substr($shelfUser['username'], 0, 1)) }}</span><span>{{ $shelfUser['username'] }}<small>Account & listening</small></span></a><form action="{{ route('logout') }}" method="post">
@csrf<button class="text-button" type="submit">Sign out</button></form></div>
</aside>
<button class="nav-backdrop" type="button" aria-label="Close navigation" data-close-nav hidden></button>
<button class="mobile-menu" type="button" aria-controls="navigation" aria-expanded="false" data-toggle-nav>☰ <span>KnowledgeShelf</span></button>
@endif
<main id="main" @class(['main', 'guest-main' => !isset($shelfUser)])>

@if(session('status'))<div class="notice" role="status">{{ session('status') }}</div>
@endif

@if($errors->any())<div class="error-box" role="alert"><strong>Please check the following:</strong><ul>
@foreach($errors->all() as $error)<li>{{ $error }}</li>
@endforeach</ul></div>
@endif
    @yield('content')
</main>
@if(isset($shelfUser))
@persist('knowledge-player')
<section id="player" class="player" aria-label="Media player" hidden>
    <div id="video-stage" hidden><video id="shelf-media" playsinline preload="metadata"></video><button type="button" data-player="fullscreen" class="video-fullscreen" aria-label="Full screen">⛶</button></div>
    <div class="player-info"><span class="eyebrow" id="player-mode">LISTENING</span><strong id="player-title">Ready to listen</strong><small id="player-status" role="status"></small></div>
    <div class="player-center"><div class="player-controls"><button type="button" data-player="back" aria-label="Skip back 30 seconds">↶ 30</button><button class="play-button" type="button" data-player="play" aria-label="Play or pause">▶</button><button type="button" data-player="forward" aria-label="Skip forward 30 seconds">30 ↷</button><select id="player-speed" aria-label="Playback speed">
@foreach([0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as $speed)<option value="{{ $speed }}" @selected($speed == 1)>{{ $speed }}×</option>
@endforeach</select></div><div class="player-timeline"><time id="player-current">0:00</time><input id="player-seek" type="range" min="0" max="100" step="0.1" value="0" aria-label="Seek position"><time id="player-duration">0:00</time></div></div>
    <div class="player-options"><button type="button" data-player="mode" id="player-switch" hidden>Watch video</button><button type="button" data-player="bookmark" aria-label="Add bookmark">Bookmark</button><select id="player-sleep" aria-label="Sleep timer"><option value="0">Sleep off</option>
@foreach([15, 30, 45, 60] as $minutes)<option value="{{ $minutes }}">{{ $minutes }} min</option>
@endforeach</select><button type="button" data-player="close" aria-label="Close player">×</button></div>
</section>
@endpersist
@endif
<div id="toast" class="toast" role="status" hidden></div>
@livewireScripts
@stack('scripts')
</body>
</html>
