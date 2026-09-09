<section class="panel"><h2>Published feeds</h2><p class="muted">Open a feed from an item’s management options to listen in a podcast app.</p>
@forelse($data['feeds'] as $feed)<div class="bookmark"><div><strong>{{ $feed['meta']['title'] ?? $feed['title'] ?? 'RSS feed' }}</strong><small>{{ $feed['feedUrl'] ?? url('/feed/'.$feed['id']) }}</small></div><form method="post" action="{{ route('manage.action', ['feeds', 'close', $feed['id']]) }}" data-confirm="Close this RSS feed? Existing podcast app subscriptions will stop working.">
@csrf<button class="text-button danger">Close feed</button></form></div>
@empty<p>No feeds are published.</p>
@endforelse</section>
