<?php

namespace App\Http\Controllers;

use App\Services\ShelfApi;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class UploadController extends Controller
{
    public function show(): View
    {
        abort_unless(session('shelf.user.permissions.upload'), 403);

        return view('upload.show');
    }

    public function store(Request $request, ShelfApi $api): RedirectResponse
    {
        abort_unless(session('shelf.user.permissions.upload'), 403);
        $data = $request->validate(['title' => 'required|string|max:300', 'author' => 'nullable|string|max:300', 'series' => 'nullable|string|max:300', 'libraryId' => 'required|uuid', 'libraryFolderId' => 'required|uuid', 'files' => 'required|array|min:1|max:100', 'files.*' => 'required|file|max:2097152']);
        $files = [];
        foreach ($request->file('files') as $index => $file) {
            $files['file'.$index] = $file;
        }
        $api->call('POST', '/api/upload', ['title' => $data['title'], 'author' => $data['author'] ?? '', 'series' => $data['series'] ?? '', 'library' => $data['libraryId'], 'folder' => $data['libraryFolderId']], files: $files);

        return redirect()->route('library', $data['libraryId'])->with('status', 'Files uploaded. The library scanner will add them shortly.');
    }
}
