<section class="panel"><h2>Notification rules</h2>
@forelse($data['settings']['notifications'] as $notification)<details class="panel"><summary>{{ $notification['eventName'] }} · {{ $notification['enabled'] ? 'Enabled' : 'Disabled' }}</summary><form method="post" action="{{ route('manage.action', ['notifications', 'update', $notification['id']]) }}" class="stack">
@csrf @include('admin.notification-fields', ['rule' => $notification])<button class="button secondary">Save rule</button></form><div class="button-row"><form method="post" action="{{ route('manage.action', ['notifications', 'test', $notification['id']]) }}">
@csrf<button class="text-button">Send test</button></form><form method="post" action="{{ route('manage.action', ['notifications', 'delete', $notification['id']]) }}">
@csrf<button class="text-button danger">Remove rule</button></form></div></details>
@empty<p>No notification rules yet.</p>
@endforelse</section><section class="panel"><h2>Add a notification</h2><form method="post" action="{{ route('manage.action', ['notifications', 'create']) }}" class="stack">
@csrf @include('admin.notification-fields', ['rule' => []])<button class="button primary">Add rule</button></form></section>
