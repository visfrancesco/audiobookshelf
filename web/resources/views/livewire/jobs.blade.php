<div wire:poll.10s>
<div class="section-heading"><p class="muted">{{ $result['total'] }} jobs · updates every 10 seconds</p><label class="field compact"><span class="sr-only">Filter by status</span><select wire:model.live="state"><option value="">All activity</option>
@foreach(['queued', 'running', 'completed', 'failed', 'needs_review', 'cancelled', 'retry', 'cancelling'] as $option)<option value="{{ $option }}">{{ ucfirst(str_replace('_', ' ', $option)) }}</option>
@endforeach</select></label></div>
<div class="job-list">
@forelse($result['jobs'] as $job)<article class="job-row" wire:key="job-{{ $job['id'] }}"><div class="job-copy"><span class="status-badge">{{ ucfirst(str_replace('_', ' ', $job['state'])) }}</span><h3>{{ match($job['kind']) { 'youtube.check' => 'Check YouTube source', 'youtube.download' => 'Download episode', 'document.extract' => 'Prepare document', 'document.narrate' => 'Narrate document', default => ucfirst(str_replace('.', ' ', $job['kind'])) } }}</h3><small>{{ \Carbon\Carbon::parse($job['createdAt'])->diffForHumans() }}
@if($job['completedChunks']) · {{ $job['completedChunks'] }} sections saved
@endif</small>
@if(!empty($job['documentId']))<a href="{{ route('document', $job['documentId']) }}" wire:navigate>Open document →</a>
@endif
@if($job['error'])<p class="danger">{{ $job['error'] }}</p>
@endif
@if($job['state'] === 'running')<progress max="1" value="{{ $job['progress'] }}" aria-label="Job progress"></progress>
@endif</div><div class="job-actions">
@if(in_array($job['state'], ['queued', 'retry', 'running']))<button class="button secondary small" wire:click="cancel('{{ $job['id'] }}')" wire:loading.attr="disabled" wire:confirm="Cancel this job? Completed narration sections are kept.">Cancel</button>
@elseif(in_array($job['state'], ['failed', 'cancelled', 'needs_review']))
@if($job['uncertainRequest'])<label class="check"><input type="checkbox" wire:model="acknowledged.{{ $job['id'] }}">The previous voice request may have been charged. I approve retrying it.</label>
@endif<button class="button secondary small" wire:click="retry('{{ $job['id'] }}')" wire:loading.attr="disabled">Retry</button>
@endif</div></article>
@empty<div class="empty-inline"><h3>All quiet here.</h3><p>Your background work will appear here.</p></div>
@endforelse</div>
@error('request')<p class="error-box" role="alert">{{ $message }}</p>@enderror
@if($result['total'] > 30)<nav class="pagination" aria-label="Activity pages"><button class="button secondary small" wire:click="previous" @disabled($page === 1)>Previous</button><span>Page {{ $page }}</span><button class="button secondary small" wire:click="next" @disabled($page * 30 >= $result['total'])>Next</button></nav>
@endif
</div>
