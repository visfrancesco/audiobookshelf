@extends('layouts.app')
@section('title', 'Documents')
@section('content')
<header class="page-header"><div><p class="eyebrow">A GOOD READ, A GREAT LISTEN</p><h1>Documents</h1><p class="lede">Turn an article or document into a full, natural narration.</p></div>
@if($isAdmin || ($shelfUser['permissions']['upload'] ?? false))<a class="button primary" href="#new-document">Add document</a>
@endif</header>
<div class="entity-grid">
@forelse($documents['documents'] as $document)<a class="entity-card" href="{{ route('document', $document['id']) }}" wire:navigate><span class="status-badge">{{ ucfirst(str_replace('_', ' ', $document['state'])) }}</span><h2>{{ $document['title'] }}</h2><p>{{ $document['author'] }} · {{ number_format($document['characters']) }} characters</p>
@if($document['error'])<small class="danger">{{ $document['error'] }}</small>
@endif</a>
@empty<div class="empty-inline"><h2>Your reading list, ready to listen.</h2><p>Add a file, paste an article link, or start with text.</p></div>
@endforelse</div>
@include('knowledge.page-links', ['total' => $documents['total']])
@if($isAdmin || ($shelfUser['permissions']['upload'] ?? false))<section id="new-document" class="panel"><h2>Add a document</h2><form action="{{ route('documents.create') }}" method="post" enctype="multipart/form-data" class="stack">
@csrf<div class="form-grid"><x-field name="title" label="Title" required maxlength="300" /><x-field name="author" label="Author" maxlength="300" /></div><x-destination /><p class="muted">Choose one source below. You can review and edit all extracted text before creating audio.</p><x-field name="url" label="Article URL" type="url" /><label class="field"><span>Or upload a document</span><input type="file" name="file" accept=".txt,.md,.html,.htm,.pdf,.epub,.docx"><small>TXT, Markdown, HTML, PDF, EPUB or DOCX · up to 20 MB</small></label><x-field name="text" label="Or paste text" type="textarea" rows="8" /><button class="button primary">Prepare preview</button></form></section>
@endif
@endsection
