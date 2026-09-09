<section class="panel"><h2>Custom metadata providers</h2>
@forelse($data['providers'] as $provider)<div class="bookmark"><div><strong>{{ $provider['name'] }}</strong><small>{{ $provider['url'] }} · custom-{{ $provider['id'] }}</small></div><form action="{{ route('manage.action', ['metadata', 'delete', $provider['id']]) }}" method="post" data-confirm="Remove this provider? Its libraries will use the default provider.">
@csrf<button class="text-button danger">Remove</button></form></div>
@empty<p>No custom providers configured.</p>
@endforelse</section><section class="panel"><h2>Add a provider</h2><form action="{{ route('manage.action', ['metadata', 'create']) }}" method="post" class="stack">
@csrf<x-field name="name" label="Name" required /><x-field name="url" label="Provider URL" type="url" required /><label class="field"><span>Media type</span><select name="mediaType"><option value="book">Books</option><option value="podcast">Podcasts</option></select></label><x-field name="authHeaderValue" label="Authorization header" type="password" autocomplete="off" /><button class="button primary">Add provider</button></form></section>
