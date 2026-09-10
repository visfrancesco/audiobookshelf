<?php

namespace App\Http\Controllers;

use App\Services\AdminForms;
use App\Services\ShelfApi;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\View as Views;
use Illuminate\View\View;

class AdminController extends Controller
{
    public const SECTIONS = ['libraries' => 'Libraries', 'users' => 'Users', 'settings' => 'Server settings', 'authentication' => 'Sign-in', 'backups' => 'Backups', 'sessions' => 'Listening sessions', 'feeds' => 'RSS feeds', 'api-keys' => 'API keys', 'email' => 'Email', 'notifications' => 'Notifications', 'metadata' => 'Metadata providers', 'tags' => 'Tags & genres', 'logs' => 'Logs & tasks'];

    public function show(Request $request, ShelfApi $api, string $section = 'libraries'): View
    {
        abort_unless(isset(self::SECTIONS[$section]), 404);
        $query = ['page' => max(0, min(10000, $request->integer('page', 1) - 1)), 'itemsPerPage' => 30, 'desc' => 1];
        $data = match ($section) {
            'libraries' => ['libraries' => Views::shared('libraries')],
            'users' => $api->get('/api/users'), 'settings' => ['settings' => session('shelf.settings')],
            'authentication' => ['settings' => $api->get('/api/auth-settings')],
            'backups' => $api->get('/api/backups'), 'sessions' => $api->get('/api/sessions', $query),
            'feeds' => $api->get('/api/feeds'), 'api-keys' => [...$api->get('/api/api-keys'), ...$api->get('/api/users')],
            'email' => $api->get('/api/emails/settings'), 'notifications' => $api->get('/api/notifications'),
            'metadata' => $api->get('/api/custom-metadata-providers'), 'tags' => [...$api->get('/api/tags'), ...$api->get('/api/genres')],
            'logs' => [...$api->get('/api/logger-data'), ...$api->get('/api/tasks', ['include' => 'queue'])],
        };
        $edit = null;
        if ($request->filled('edit') && in_array($section, ['users', 'libraries'])) {
            $id = $request->validate(['edit' => 'required|uuid'])['edit'];
            $edit = $api->get("/api/$section/$id");
        }
        $fields = AdminForms::fields($section);

        return view('admin.show', ['section' => $section, 'sections' => self::SECTIONS, 'data' => $data, 'edit' => $edit, 'fields' => $fields]);
    }

    public function action(Request $request, ShelfApi $api, string $section, string $action, ?string $id = null): RedirectResponse|View
    {
        abort_unless(isset(self::SECTIONS[$section]), 404);
        if ($id !== null) {
            abort_unless(preg_match('/^[\w.-]{1,200}$/', $id), 404);
        }
        if (in_array($section, ['settings', 'authentication', 'email', 'notifications']) && $action === 'save') {
            $path = match ($section) {
                'authentication' => 'auth-settings', 'email' => 'emails/settings', default => $section
            };
            $api->patch('/api/'.$path, AdminForms::values($request, $section));
        } elseif ($section === 'libraries') {
            if ($action === 'delete' && $id) {
                $api->delete("/api/libraries/$id");
            } elseif ($action === 'scan' && $id) {
                $api->post("/api/libraries/$id/scan", ['force' => $request->boolean('force')]);
            } elseif ($action === 'save') {
                $data = $request->validate(['name' => 'required|string|max:300', 'mediaType' => 'required|in:book,podcast', 'paths' => 'required|string|max:10000', 'provider' => 'nullable|string|max:300', 'icon' => 'nullable|string|max:100']);
                $existing = $id ? $api->get("/api/libraries/$id") : [];
                $folders = [];
                foreach (AdminForms::lines($data['paths']) as $path) {
                    abort_unless(str_starts_with($path, '/') && ! str_contains($path, "\0"), 422, 'Library paths must be absolute paths inside the server.');
                    $old = collect($existing['folders'] ?? [])->firstWhere('fullPath', $path);
                    $folders[] = $old ? ['id' => $old['id'], 'fullPath' => $path] : ['fullPath' => $path];
                }
                abort_unless($folders, 422, 'Add at least one folder.');
                $payload = ['name' => $data['name'], 'mediaType' => $data['mediaType'], 'provider' => ($data['provider'] ?? '') ?: ($data['mediaType'] === 'book' ? 'google' : 'itunes'), 'icon' => ($data['icon'] ?? '') ?: 'database', 'folders' => $folders];
                $settings = $request->validate(['scanSchedule' => 'nullable|string|max:100', 'markAsFinishedPercentComplete' => 'nullable|numeric|min:0|max:100', 'markAsFinishedTimeRemaining' => 'nullable|numeric|min:0']);
                $payload['settings'] = ['autoScanCronExpression' => $request->boolean('disableAutoScan') ? null : (($settings['scanSchedule'] ?? '') ?: null), 'disableWatcher' => $request->boolean('disableWatcher'), 'markAsFinishedPercentComplete' => isset($settings['markAsFinishedPercentComplete']) ? (float) $settings['markAsFinishedPercentComplete'] : null, 'markAsFinishedTimeRemaining' => isset($settings['markAsFinishedTimeRemaining']) ? (float) $settings['markAsFinishedTimeRemaining'] : null];
                $id ? $api->patch("/api/libraries/$id", $payload) : $api->post('/api/libraries', $payload);
            } else {
                abort(404);
            }
        } elseif ($section === 'users') {
            if ($action === 'delete' && $id) {
                $api->delete("/api/users/$id");
            } elseif ($action === 'unlink' && $id) {
                $api->patch("/api/users/$id/openid-unlink");
            } elseif ($action === 'save') {
                $data = $request->validate(['username' => 'required|string|max:100', 'email' => 'nullable|email|max:300', 'password' => ($id ? 'nullable' : 'required').'|string|min:12|max:1000', 'type' => 'required|in:root,admin,user,guest', 'librariesAccessible' => 'sometimes|array|max:1000', 'librariesAccessible.*' => 'uuid', 'itemTagsSelected' => 'nullable|string|max:10000']);
                if (! $request->filled('password')) {
                    unset($data['password']);
                }
                abort_if(! $id && $data['type'] === 'root', 422, 'There can be only one root account.');
                $data['isActive'] = $request->boolean('isActive');
                $data['permissions'] = [];
                foreach (AdminForms::permissions() as $permission => $label) {
                    $data['permissions'][$permission] = $request->boolean('permissions.'.$permission);
                }
                $data['librariesAccessible'] = $data['librariesAccessible'] ?? [];
                $data['itemTagsSelected'] = AdminForms::lines($data['itemTagsSelected'] ?? '');
                $id ? $api->patch("/api/users/$id", $data) : $api->post('/api/users', $data);
            } else {
                abort(404);
            }
        } elseif ($section === 'backups') {
            if ($action === 'create') {
                $api->post('/api/backups');
            } elseif ($action === 'delete' && $id) {
                $api->delete("/api/backups/$id");
            } elseif ($action === 'restore' && $id) {
                $request->validate(['confirmed' => 'accepted']);
                $api->get("/api/backups/$id/apply");
                session()->forget('shelf');

                return redirect()->route('login')->with('status', 'Backup restoration started. Sign in again after the server restarts.');
            } elseif ($action === 'upload') {
                $request->validate(['file' => 'required|file|max:2097152']);
                $api->call('POST', '/api/backups/upload', files: ['file' => $request->file('file')]);
            } elseif ($action === 'path') {
                $api->patch('/api/backups/path', $request->validate(['path' => 'required|string|max:4000']));
            } else {
                abort(404);
            }
        } elseif ($section === 'sessions' && $action === 'delete' && $id) {
            $api->delete("/api/sessions/$id");
        } elseif ($section === 'feeds' && $action === 'close' && $id) {
            $api->post("/api/feeds/$id/close");
        } elseif ($section === 'api-keys') {
            if ($action === 'create') {
                $data = $request->validate(['name' => 'required|string|max:300', 'userId' => 'required|uuid', 'days' => 'required|integer|min:1|max:3650']);
                $result = $api->post('/api/api-keys', ['name' => $data['name'], 'userId' => $data['userId'], 'expiresIn' => (int) $data['days'] * 86400, 'isActive' => true]);

                return redirect()->route('manage', $section)->with('createdApiKey', $result['apiKey']['apiKey'])->with('status', 'API key created. Copy it now; it will not be shown again.');
            } elseif ($action === 'delete' && $id) {
                $api->delete("/api/api-keys/$id");
            } elseif ($action === 'toggle' && $id) {
                $api->patch("/api/api-keys/$id", ['isActive' => $request->boolean('isActive')]);
            } else {
                abort(404);
            }
        } elseif ($section === 'email' && $action === 'test') {
            $api->post('/api/emails/test');
        } elseif ($section === 'metadata') {
            if ($action === 'delete' && $id) {
                $api->delete("/api/custom-metadata-providers/$id");
            } elseif ($action === 'create') {
                $api->post('/api/custom-metadata-providers', $request->validate(['name' => 'required|string|max:300', 'url' => 'required|url|max:4000', 'mediaType' => 'required|in:book,podcast', 'authHeaderValue' => 'nullable|string|max:4000']));
            } else {
                abort(404);
            }
        } elseif ($section === 'notifications') {
            if ($action === 'delete' && $id) {
                $api->delete("/api/notifications/$id");
            } elseif ($action === 'test' && $id) {
                $api->get("/api/notifications/$id/test");
            } elseif ($action === 'create' || ($action === 'update' && $id)) {
                $data = $request->validate(['eventName' => 'required|string|max:200', 'libraryId' => 'nullable|uuid', 'urls' => 'required|string|max:10000', 'titleTemplate' => 'required|string|max:2000', 'bodyTemplate' => 'required|string|max:10000', 'type' => 'required|in:info,success,warning,failure']);
                $data['urls'] = AdminForms::lines($data['urls']);
                $data['enabled'] = $request->boolean('enabled');
                $id ? $api->patch("/api/notifications/$id", [...$data, 'id' => $id]) : $api->post('/api/notifications', $data);
            } else {
                abort(404);
            }
        } elseif ($section === 'tags') {
            $data = $request->validate(['kind' => 'required|in:tags,genres', 'name' => 'required|string|max:300', 'newName' => 'nullable|string|max:300']);
            $kind = $data['kind'];
            if ($action === 'delete') {
                $api->delete('/api/'.$kind.'/'.rawurlencode($data['name']));
            } elseif ($action === 'rename' && ! empty($data['newName'])) {
                $key = $kind === 'tags' ? 'tag' : 'genre';
                $api->post("/api/$kind/rename", [$key => $data['name'], 'new'.ucfirst($key) => $data['newName']]);
            } else {
                abort(422, 'Enter a new name.');
            }
        } else {
            abort(404);
        }

        return redirect()->route('manage', $section)->with('status', 'Changes saved.');
    }
}
