<section class="panel"><div class="section-heading"><h2>Saved backups</h2><form action="{{ route('manage.action', ['backups', 'create']) }}" method="post">
@csrf<button class="button primary">Create backup</button></form></div><p class="muted">{{ $data['backupLocation'] }}</p>
@forelse($data['backups'] as $backup)<article class="bookmark"><div><strong>{{ $backup['datePretty'] }}</strong><small>Version {{ $backup['serverVersion'] }} · {{ round(($backup['fileSize'] ?? 0) / 1048576, 1) }} MB</small></div><div class="button-row"><a class="button secondary small" href="{{ route('delivery', ['backup', $backup['id']]) }}">Download</a><form method="post" action="{{ route('manage.action', ['backups', 'delete', $backup['id']]) }}" data-confirm="Permanently delete this backup?">
@csrf<button class="text-button danger">Delete</button></form></div><details><summary>Restore backup</summary><form method="post" action="{{ route('manage.action', ['backups', 'restore', $backup['id']]) }}" class="stack">
@csrf<label class="check"><input type="checkbox" name="confirmed" value="1" required>Replace the current database and settings with this backup. The server will restart.</label><button class="button danger">Restore this backup</button></form></details></article>
@empty<p>No backups yet.</p>
@endforelse</section><section class="panel"><h2>Upload a backup</h2><form action="{{ route('manage.action', ['backups', 'upload']) }}" method="post" enctype="multipart/form-data" class="stack">
@csrf<label class="field"><span>Backup archive</span><input type="file" name="file" required></label><button class="button secondary">Upload backup</button></form></section>
@if(!$data['backupPathEnvSet'])<section class="panel"><h2>Backup location</h2><form action="{{ route('manage.action', ['backups', 'path']) }}" method="post" class="stack">
@csrf<x-field name="path" label="Absolute server path" :value="$data['backupLocation']" required /><button class="button secondary">Update location</button></form></section>
@endif
