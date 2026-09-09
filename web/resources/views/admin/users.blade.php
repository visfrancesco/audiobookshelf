<div class="table-wrap"><table><thead><tr><th>User</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>
@foreach($data['users'] as $user)<tr><td>{{ $user['username'] }}<small>{{ $user['email'] }}</small></td><td>{{ ucfirst($user['type']) }}</td><td>{{ $user['isActive'] ? 'Enabled' : 'Disabled' }}</td><td><a href="{{ route('manage', ['section' => 'users', 'edit' => $user['id']]) }}" wire:navigate>Edit account</a></td></tr>
@endforeach</tbody></table></div><section class="panel"><h2>{{ $edit ? 'Edit account' : 'Create an account' }}</h2><form method="post" action="{{ route('manage.action', ['users', 'save', $edit['id'] ?? null]) }}" class="stack">
@csrf @include('admin.user-fields')<button class="button primary">Save account</button></form>
@if($edit && $edit['type'] !== 'root')<div class="danger-zone"><form method="post" action="{{ route('manage.action', ['users', 'delete', $edit['id']]) }}" data-confirm="Delete this account and all of its listening history?">
@csrf<button class="button danger">Delete account</button></form><form method="post" action="{{ route('manage.action', ['users', 'unlink', $edit['id']]) }}" data-confirm="Unlink this account from OpenID?">
@csrf<button class="text-button danger">Unlink OpenID</button></form></div>
@endif</section>
