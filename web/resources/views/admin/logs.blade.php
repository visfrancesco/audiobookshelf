<section class="panel"><div class="section-heading"><h2>Active tasks</h2><a href="{{ route('manage', 'logs') }}" wire:navigate>Refresh</a></div>
@forelse($data['tasks'] as $task)<div class="bookmark"><strong>{{ $task['title'] ?? $task['action'] ?? 'Task' }}</strong><span>{{ $task['description'] ?? $task['status'] ?? '' }}</span></div>
@empty<p class="muted">No active media tasks.</p>
@endforelse<a href="{{ route('jobs') }}" wire:navigate>View downloads and narration →</a></section><section class="panel"><h2>Recent server logs</h2><div class="log-output">
@foreach($data['currentDailyLogs'] ?? [] as $log)<pre>{{ is_string($log) ? $log : ($log['timestamp'] ?? $log['ts'] ?? '').' '.($log['message'] ?? '') }}</pre>
@endforeach</div></section>
