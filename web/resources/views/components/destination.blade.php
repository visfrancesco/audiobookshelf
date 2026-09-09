@props(['mediaType' => 'book', 'selectedLibrary' => '', 'selectedFolder' => ''])
<div class="form-grid" data-destination>
    <label class="field"><span>Library *</span><select name="libraryId" required data-library-select><option value="">Choose a library</option>
@foreach($libraries as $library)
@if($library['mediaType'] === $mediaType)<option value="{{ $library['id'] }}" @selected(old('libraryId', $selectedLibrary) === $library['id'])>{{ $library['name'] }}</option>
@endif
@endforeach</select></label>
    <label class="field"><span>Folder *</span><select name="libraryFolderId" required data-folder-select><option value="">Choose a folder</option>
@foreach($libraries as $library)
@if($library['mediaType'] === $mediaType)
@foreach($library['folders'] as $folder)<option value="{{ $folder['id'] }}" data-library="{{ $library['id'] }}" @selected(old('libraryFolderId', $selectedFolder) === $folder['id'])>{{ $folder['fullPath'] }}</option>
@endforeach
@endif
@endforeach</select></label>
</div>
