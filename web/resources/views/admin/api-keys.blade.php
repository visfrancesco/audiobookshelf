
@if(session('createdApiKey'))<div class="notice"><strong>Copy this key now</strong><p>It grants the permissions of the selected account.</p><textarea readonly rows="4" aria-label="New API key">{{ session('createdApiKey') }}</textarea></div>
@endif<section class="panel"><h2>Application access</h2>
@forelse($data['apiKeys'] as $key)<div class="bookmark"><div><strong>{{ $key['name'] }}</strong><small>{{ $key['user']['username'] ?? 'Removed account' }} · {{ $key['isActive'] ? 'Active' : 'Disabled' }} · {{ $key['expiresAt'] ? 'Expires '.\Carbon\Carbon::parse($key['expiresAt'])->toDateString() : 'No expiry' }}</small></div><div class="button-row"><form method="post" action="{{ route('manage.action', ['api-keys', 'toggle', $key['id']]) }}">
@csrf<input type="hidden" name="isActive" value="{{ $key['isActive'] ? 0 : 1 }}"><button class="text-button">{{ $key['isActive'] ? 'Disable' : 'Enable' }}</button></form><form method="post" action="{{ route('manage.action', ['api-keys', 'delete', $key['id']]) }}" data-confirm="Revoke this API key? Connected applications will lose access.">
@csrf<button class="text-button danger">Revoke</button></form></div></div>
@empty<p>No API keys yet.</p>
@endforelse</section><section class="panel"><h2>Create an API key</h2><form action="{{ route('manage.action', ['api-keys', 'create']) }}" method="post" class="stack">
@csrf<x-field name="name" label="Application name" required /><label class="field"><span>Account</span><select name="userId" required>
@foreach($data['users'] as $user)<option value="{{ $user['id'] }}">{{ $user['username'] }} · {{ $user['type'] }}</option>
@endforeach</select></label><x-field name="days" label="Expires after (days)" type="number" value="90" min="1" max="3650" required /><button class="button primary">Create key</button></form></section>
