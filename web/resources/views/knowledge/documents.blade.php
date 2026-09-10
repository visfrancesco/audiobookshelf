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
@if($isAdmin || ($shelfUser['permissions']['upload'] ?? false))<details id="new-document" class="panel" @if(!$documents['total'] || $errors->any()) open @endif><summary>Add a document</summary><form action="{{ route('documents.create') }}" method="post" enctype="multipart/form-data" class="stack">
@csrf
<p class="muted">Choose a source. You can review and edit the extracted text before creating audio.</p>
<label class="field" hidden><span>Document source</span><select data-document-source><option value="url" @selected(!old('text'))>Article link</option><option value="file">Upload a file</option><option value="text" @selected(old('text'))>Paste text</option></select></label>
<div data-source-input="url"><x-field name="url" label="Article URL" type="url" /></div>
<div data-source-input="file"><label class="field"><span>Upload a document</span><input type="file" name="file" accept=".txt,.md,.html,.htm,.pdf,.epub,.docx"><small>TXT, Markdown, HTML, PDF, EPUB or DOCX · up to 20 MB</small></label></div>
<div data-source-input="text"><x-field name="text" label="Document text" type="textarea" rows="8" /></div>
<div class="form-grid"><x-field name="title" label="Title" required maxlength="300" /><x-field name="author" label="Author" maxlength="300" /></div>
<x-destination />
<button class="button primary">Prepare preview</button></form></details>
@endif
@endsection
