@extends('layouts.app')
@section('title', 'Upload media')
@section('content')
<header class="page-header"><div><p class="eyebrow">BRING YOUR OWN LIBRARY</p><h1>Upload media</h1><p class="lede">Add audio tracks, ebooks, and cover images to your shelf.</p></div></header><section class="panel"><form action="{{ route('upload.store') }}" method="post" enctype="multipart/form-data" class="stack">
@csrf<div class="form-grid"><x-field name="title" label="Title" required /><x-field name="author" label="Author" /><x-field name="series" label="Series" /></div><x-destination /><label class="field upload-drop"><span>Choose media files</span><input name="files[]" type="file" multiple required><small>Up to 100 files. Keep tracks from the same book together.</small></label><button class="button primary">Upload to library</button></form></section>
@endsection
