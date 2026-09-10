<div class="detail-columns">
@foreach(['tags' => 'Tags', 'genres' => 'Genres'] as $kind => $label)<section class="panel"><h2>{{ $label }}</h2>
@forelse($data[$kind] ?? [] as $entry)
@php($name = is_string($entry) ? $entry : ($entry['name'] ?? $entry['tag'] ?? $entry['genre'] ?? ''))<details class="tag-editor"><summary>{{ $name }}</summary><form action="{{ route('manage.action', ['tags', 'rename']) }}" method="post" class="stack">
@csrf<input type="hidden" name="kind" value="{{ $kind }}"><input type="hidden" name="name" value="{{ $name }}"><x-field name="newName" label="New name" :value="$name" required /><button class="button secondary small">Rename everywhere</button></form><form action="{{ route('manage.action', ['tags', 'delete']) }}" method="post" data-confirm="Remove this label from every item?">
@csrf<input type="hidden" name="kind" value="{{ $kind }}"><input type="hidden" name="name" value="{{ $name }}"><button class="text-button danger">Remove everywhere</button></form></details>
@empty<p class="muted">No {{ strtolower($label) }} yet.</p>
@endforelse</section>
@endforeach</div>
