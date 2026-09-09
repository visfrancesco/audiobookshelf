@extends('layouts.app')
@section('title', $document['title'])
@section('content')
<a class="back-link" href="{{ route('documents') }}" wire:navigate>← Documents</a><header class="page-header" data-document-id="{{ $document['id'] }}" data-document-state="{{ $document['state'] }}"><div><p class="eyebrow">{{ strtoupper(str_replace('_', ' ', $document['state'])) }}</p><h1>{{ $document['title'] }}</h1><p class="lede">{{ number_format($document['characters']) }} characters · {{ $document['author'] }}</p></div>
@if($document['libraryItemId'])<a class="button primary" href="{{ route('item', $document['libraryItemId']) }}" wire:navigate>Open audiobook</a>
@endif</header>
@if($document['error'])<div class="error-box" role="alert">{{ $document['error'] }}</div>
@endif
<div class="detail-columns"><section class="panel"><h2>Review the full text</h2><p class="muted">This is the text that will be read aloud. Save any edits before generating narration.</p><form action="{{ route('document.save', $document['id']) }}" method="post" class="stack">
@csrf<x-field name="title" label="Title" :value="$document['title']" required /><x-field name="author" label="Author" :value="$document['author'] ?? ''" /><x-field name="text" label="Narration text" type="textarea" rows="24" class="document-preview" :value="$document['text'] ?? ''" required /><button class="button secondary" @disabled(in_array($document['state'], ['extracting', 'generating']))>Save preview</button></form></section>
<section class="panel"><h2>Make it a listen</h2>
@if(!$status['elevenLabs'])<p>ElevenLabs is not configured yet. An administrator can enable narration by setting the server’s ElevenLabs API key.</p>
@elseif(empty($voices))<p>Voices are temporarily unavailable. Check the ElevenLabs configuration and try again.</p>
@else<form method="post" action="{{ route('document.generate', $document['id']) }}" class="stack">
@csrf<input type="hidden" name="contentHash" value="{{ $document['contentHash'] }}"><label class="field"><span>Voice</span><select name="voiceId" required>
@foreach($voices as $voice)<option value="{{ $voice['id'] }}" @selected(($document['generation']['voiceId'] ?? '') === $voice['id'])>{{ $voice['name'] }}</option>
@endforeach</select></label><label class="field"><span>Model</span><select name="modelId"><option value="eleven_multilingual_v2">Multilingual v2 · expressive narration</option><option value="eleven_turbo_v2_5">Turbo v2.5 · faster narration</option><option value="eleven_flash_v2_5">Flash v2.5 · fastest narration</option></select></label><x-field name="maxCharacters" label="Maximum characters approved" type="number" :value="max(1, $document['characters'])" min="1" max="1000000" required hint="Generation stops before exceeding this limit. ElevenLabs charges your account for narration." /><label class="check"><input type="checkbox" name="approved" value="1" required>I reviewed the saved text and approve narrating these {{ number_format($document['characters']) }} characters.</label><button class="button primary" @disabled(!$document['contentHash'] || in_array($document['state'], ['extracting', 'generating']))>{{ $document['libraryItemId'] ? 'Regenerate audiobook' : 'Create audiobook' }}</button>
@if($document['libraryItemId'])<p class="muted">Regeneration replaces this document’s audiobook and keeps its library identity and progress.</p>
@endif</form>
@endif</section></div>
<section class="section"><h2>Document activity</h2><livewire:jobs :document-id="$document['id']" :document-state="$document['state']" /></section><form class="danger-zone" action="{{ route('document.remove', $document['id']) }}" method="post" data-confirm="Remove this document and its generation cache? The imported audiobook will remain.">
@csrf<button class="button danger">Remove document</button></form>
@endsection
