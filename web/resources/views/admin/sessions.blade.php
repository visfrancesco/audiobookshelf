<div class="table-wrap"><table><thead><tr><th>Listener</th><th>Title</th><th>Listened</th><th>Last played</th><th></th></tr></thead><tbody>
@forelse($data['sessions'] as $listen)<tr><td>{{ $listen['user']['username'] ?? 'Removed account' }}</td><td>{{ $listen['displayTitle'] }}<small>{{ $listen['displayAuthor'] }}</small></td><td>{{ round(($listen['timeListening'] ?? 0) / 60) }} min</td><td>{{ date('M j, Y H:i', (int) ($listen['updatedAt'] / 1000)) }}</td><td><form method="post" action="{{ route('manage.action', ['sessions', 'delete', $listen['id']]) }}" data-confirm="Remove this listening session from statistics?">
@csrf<button class="text-button danger">Delete</button></form></td></tr>
@empty<tr><td colspan="5">No listening sessions yet.</td></tr>
@endforelse</tbody></table></div>@include('knowledge.page-links', ['total' => $data['total']])
