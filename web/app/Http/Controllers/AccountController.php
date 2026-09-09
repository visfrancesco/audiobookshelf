<?php

namespace App\Http\Controllers;

use App\Services\ShelfApi;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class AccountController extends Controller
{
    public function show(Request $request, ShelfApi $api): View
    {
        $tab = $request->query('tab', 'listening');
        abort_unless(in_array($tab, ['listening', 'security', 'devices']), 404);
        $page = max(0, min(10000, $request->integer('page', 1) - 1));
        $data = match ($tab) {
            'listening' => ['stats' => $api->get('/api/me/listening-stats'), 'history' => $api->get('/api/me/listening-sessions', ['itemsPerPage' => 30, 'page' => $page])],
            'security' => ['sessions' => $api->get('/api/me/sessions', ['itemsPerPage' => 30, 'page' => $page])],
            'devices' => ['user' => $api->get('/api/me')],
        };

        if ($tab === 'listening') {
            $data['stats']['thisWeek'] = 0;
            $data['stats']['thisMonth'] = 0;
            $weekStart = now()->startOfWeek()->toDateString();
            $monthStart = now()->startOfMonth()->toDateString();
            foreach ($data['stats']['days'] ?? [] as $day => $seconds) {
                if ($day >= $weekStart) {
                    $data['stats']['thisWeek'] += $seconds;
                }
                if ($day >= $monthStart) {
                    $data['stats']['thisMonth'] += $seconds;
                }
            }
        }

        return view('account.show', compact('tab', 'data'));
    }

    public function save(Request $request, ShelfApi $api, string $action): RedirectResponse
    {
        if ($action === 'password') {
            $data = $request->validate(['password' => 'nullable|string|max:1000', 'newPassword' => 'required|string|min:12|max:1000|confirmed']);
            $result = $api->patch('/api/me/password', $data);
            if (! empty($result['user']['accessToken'])) {
                session(['shelf.access_token' => $result['user']['accessToken'], 'shelf.refresh_token' => $result['user']['refreshToken']]);
            } else {
                $request->session()->invalidate();

                return redirect()->route('login')->with('status', 'Password changed. Please sign in again.');
            }
        } elseif ($action === 'revoke-session') {
            $id = $request->validate(['sessionId' => 'required|uuid'])['sessionId'];
            $api->delete("/api/me/sessions/$id");
        } elseif ($action === 'device') {
            $data = $request->validate(['name' => 'required|string|max:100', 'email' => 'required|email|max:300']);
            $user = $api->get('/api/me');
            $devices = $user['ereaderDevices'] ?? [];
            abort_if(count($devices) >= 50, 422, 'Remove an old device before adding another.');
            $devices[] = $data;
            $api->post('/api/me/ereader-devices', ['ereaderDevices' => $devices]);
        } elseif ($action === 'remove-device') {
            $name = $request->validate(['name' => 'required|string|max:100'])['name'];
            $devices = $api->get('/api/me')['ereaderDevices'] ?? [];
            $api->post('/api/me/ereader-devices', ['ereaderDevices' => array_values(array_filter($devices, fn ($device) => $device['name'] !== $name))]);
        } else {
            abort(404);
        }

        return back()->with('status', 'Account updated.');
    }
}
