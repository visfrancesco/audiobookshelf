<label class="field"><span>Event</span><select name="eventName" required>
@foreach($data['data']['events'] as $event)<option value="{{ $event['name'] }}" @selected(($rule['eventName'] ?? '') === $event['name'])>{{ $event['description'] }}</option>
@endforeach</select></label><label class="field"><span>Library</span><select name="libraryId"><option value="">All libraries</option>
@foreach($libraries as $library)<option value="{{ $library['id'] }}" @selected(($rule['libraryId'] ?? '') === $library['id'])>{{ $library['name'] }}</option>
@endforeach</select></label><x-field name="urls" label="Apprise destination URLs (one per line)" type="textarea" rows="3" :value="implode(chr(10), $rule['urls'] ?? [])" required /><x-field name="titleTemplate" label="Title template" :value="$rule['titleTemplate'] ?? ''" required /><x-field name="bodyTemplate" label="Message template" type="textarea" rows="4" :value="$rule['bodyTemplate'] ?? ''" required /><label class="field"><span>Message type</span><select name="type">
@foreach(['info', 'success', 'warning', 'failure'] as $type)<option value="{{ $type }}" @selected(($rule['type'] ?? 'info') === $type)>{{ ucfirst($type) }}</option>
@endforeach</select></label><label class="check"><input type="checkbox" name="enabled" value="1" @checked($rule['enabled'] ?? true)>Enabled</label><details><summary>Available template variables</summary>
@foreach($data['data']['events'] as $event)<p><strong>{{ $event['name'] }}</strong><br>{{ implode(', ', $event['variables']) }}</p>
@endforeach</details>
