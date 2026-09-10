<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\CatalogController;
use App\Http\Controllers\KnowledgeController;
use App\Http\Controllers\PlayerController;
use App\Http\Controllers\PodcastController;
use App\Http\Controllers\SignInController;
use App\Http\Controllers\UploadController;
use Illuminate\Support\Facades\Route;

Route::get('/sign-in', [SignInController::class, 'show'])->name('login');
Route::post('/sign-in', [SignInController::class, 'store'])->middleware('throttle:10,1')->name('login.store');
Route::post('/setup', [SignInController::class, 'initialize'])->middleware('throttle:5,1')->name('setup');
Route::get('/sign-in/openid', [SignInController::class, 'oidc'])->name('login.oidc');
Route::get('/sign-in/callback', [SignInController::class, 'callback'])->name('login.callback');
Route::post('/sign-out', [SignInController::class, 'destroy'])->name('logout');
Route::get('/delivery/{kind}/{id}/{file?}', [CatalogController::class, 'delivery'])->where(['id' => '[\w.-]+', 'file' => '[\w-]+'])->name('delivery');

Route::middleware('shelf')->group(function () {
    Route::get('/', [CatalogController::class, 'home'])->name('home');
    Route::get('/library/{id}', [CatalogController::class, 'library'])->name('library');
    Route::get('/pick-items', [CatalogController::class, 'pickItems'])->name('items.pick');
    Route::get('/item/{id}', [CatalogController::class, 'item'])->name('item');
    Route::get('/item/{id}/edit', [CatalogController::class, 'edit'])->name('item.edit');
    Route::post('/item/{id}/edit', [CatalogController::class, 'update'])->name('item.update');
    Route::post('/item/{id}/actions/{action}', [CatalogController::class, 'action'])->name('item.action');
    Route::get('/item/{id}/read', [CatalogController::class, 'reader'])->name('reader');
    Route::post('/item/{id}/reading-progress', [PlayerController::class, 'readerProgress'])->name('reader.progress');
    Route::get('/lists/{kind}/{id}', [CatalogController::class, 'entity'])->name('entity');
    Route::post('/lists/{kind}/{id?}', [CatalogController::class, 'entitySave'])->name('entity.save');
    Route::post('/lists/{kind}/{id}/actions/{action}', [CatalogController::class, 'entityAction'])->name('entity.action');
    Route::post('/player/start', [PlayerController::class, 'start'])->name('player.start');
    Route::post('/player/sync', [PlayerController::class, 'sync'])->name('player.sync');
    Route::get('/documents', [KnowledgeController::class, 'documents'])->name('documents');
    Route::post('/documents', [KnowledgeController::class, 'createDocument'])->name('documents.create');
    Route::get('/documents/{id}', [KnowledgeController::class, 'document'])->name('document');
    Route::post('/documents/{id}', [KnowledgeController::class, 'saveDocument'])->name('document.save');
    Route::post('/documents/{id}/generate', [KnowledgeController::class, 'generate'])->name('document.generate');
    Route::post('/documents/{id}/remove', [KnowledgeController::class, 'removeDocument'])->name('document.remove');
    Route::get('/jobs', [KnowledgeController::class, 'jobs'])->name('jobs');
    Route::get('/account', [AccountController::class, 'show'])->name('account');
    Route::post('/account/{action}', [AccountController::class, 'save'])->name('account.save');
    Route::get('/upload', [UploadController::class, 'show'])->name('upload');
    Route::post('/upload-media', [UploadController::class, 'store'])->name('upload.store');
});
Route::middleware('shelf:admin')->group(function () {
    Route::get('/sources', [KnowledgeController::class, 'sources'])->name('sources');
    Route::post('/sources', [KnowledgeController::class, 'saveSource'])->name('sources.create');
    Route::get('/sources/{id}', [KnowledgeController::class, 'source'])->name('source');
    Route::post('/sources/{id}', [KnowledgeController::class, 'saveSource'])->name('source.save');
    Route::post('/sources/{id}/{action}', [KnowledgeController::class, 'sourceAction'])->name('source.action');
    Route::post('/pinchflat/adopt', [KnowledgeController::class, 'adopt'])->name('pinchflat.adopt');
    Route::get('/podcasts/add', [PodcastController::class, 'show'])->name('podcasts.add');
    Route::post('/podcasts/preview', [PodcastController::class, 'preview'])->name('podcasts.preview');
    Route::post('/podcasts/add', [PodcastController::class, 'store'])->name('podcasts.store');
    Route::get('/podcasts/{id}/episodes', [PodcastController::class, 'episodes'])->name('podcasts.episodes');
    Route::post('/podcasts/{id}/{action}', [PodcastController::class, 'action'])->name('podcasts.action');
    Route::get('/manage/{section?}', [AdminController::class, 'show'])->name('manage');
    Route::post('/manage/{section}/{action}/{id?}', [AdminController::class, 'action'])->name('manage.action');
});
Route::get('/share/{slug}', [CatalogController::class, 'share'])->name('share');
Route::redirect('/login', '/sign-in');
Route::redirect('/config', '/manage');

Route::get('/author/{id}', fn (string $id) => redirect()->route('entity', ['authors', $id]));
Route::get('/collection/{id}', fn (string $id) => redirect()->route('entity', ['collections', $id]));
Route::get('/playlist/{id}', fn (string $id) => redirect()->route('entity', ['playlists', $id]));
Route::get('/audiobook/{id}/{action}', fn (string $id) => redirect()->route('item.edit', $id))->whereIn('action', ['chapters', 'edit', 'manage']);
Route::get('/library/{id}/{view}', fn (string $id, string $view) => redirect()->route('library', ['id' => $id, 'view' => in_array($view, ['search', 'bookshelf']) ? 'items' : $view]))->whereIn('view', ['search', 'bookshelf', 'authors', 'narrators', 'series', 'stats']);
Route::get('/config/{section}', fn (string $section) => redirect()->route('manage', $section))->whereIn('section', array_keys(AdminController::SECTIONS));
