const crypto = require('crypto')
const { Op } = require('sequelize')
const { problem, checkAbort } = require('./errors')

// The ABS SQLite server runs as one application instance. A conditional claim
// still prevents overlapping polls from executing the same durable job twice.
class JobQueue {
  constructor(jobs, { concurrency = 1, handlers = {}, maxAttempts = 3, onChange = () => {}, onError = () => {} } = {}) {
    this.jobs = jobs
    this.concurrency = concurrency
    this.handlers = handlers
    this.maxAttempts = maxAttempts
    this.onChange = onChange
    this.onError = onError
    this.active = new Map()
    this.stopping = false
    this.polling = false
    this.stateLock = Promise.resolve()
  }

  async locked(action) {
    const pending = this.stateLock.catch(() => {}).then(action)
    this.stateLock = pending
    return pending
  }

  async recover() {
    for (const job of await this.jobs.findAll({ where: { state: ['running', 'cancelling'] } })) {
      const uncertain = !!job.checkpoint?.pendingSpeech
      await job.update({
        state: uncertain ? 'needs_review' : job.state === 'cancelling' ? 'cancelled' : 'queued',
        error: uncertain ? 'A speech request was interrupted. Check provider usage before explicitly retrying; it may already have been charged.' : null,
        errorCode: uncertain ? 'speech_request_uncertain' : null
      })
    }
  }

  start(interval = 1000) {
    this.stopping = false
    this.timer = setInterval(() => this.tick().catch(this.onError), interval)
    this.timer.unref()
  }

  async enqueue(kind, key, payload, { ownerId = null, sourceId = null } = {}) {
    return this.locked(async () => {
      if (!this.handlers[kind]) throw problem('Unknown job type')
      const [job] = await this.jobs.findOrCreate({ where: { key }, defaults: { id: crypto.randomUUID(), kind, payload, ownerId, sourceId } })
      return job
    })
  }

  async tick() {
    return this.locked(() => this.poll())
  }

  async poll() {
    if (this.polling || this.stopping) return
    this.polling = true
    try {
      while (this.active.size < this.concurrency && !this.stopping) {
        const job = await this.jobs.findOne({ where: { state: ['queued', 'retry'], [Op.or]: [{ retryAt: null }, { retryAt: { [Op.lte]: new Date() } }] }, order: [['createdAt', 'ASC']] })
        if (!job) break
        const [claimed] = await this.jobs.update({ state: 'running', startedAt: new Date(), attempts: job.attempts + 1, error: null, errorCode: null }, { where: { id: job.id, state: job.state } })
        if (!claimed) continue
        await job.reload()
        const controller = new AbortController()
        const entry = { controller, promise: null }
        this.active.set(job.id, entry)
        entry.promise = this.execute(job, controller.signal).catch(this.onError).finally(() => this.active.delete(job.id))
      }
    } finally { this.polling = false }
  }

  async execute(job, signal) {
    try {
      const result = await this.handlers[job.kind](job, {
        signal,
        checkpoint: async (value, progress = job.progress) => {
          checkAbort(signal)
          await job.update({ checkpoint: JSON.parse(JSON.stringify(value)), progress: Math.max(0, Math.min(0.99, progress)) })
          await this.onChange(job)
        }
      })
      await this.locked(async () => {
        checkAbort(signal)
        await job.update({ state: 'completed', result: result || {}, progress: 1, finishedAt: new Date(), retryAt: null })
      })
    } catch (error) {
      await this.locked(async () => {
        await job.reload()
        const uncertain = !!job.checkpoint?.pendingSpeech || error.code === 'speech_request_uncertain'
        const cancelled = signal.aborted || job.state === 'cancelling' || error.code === 'cancelled'
        const canRetry = error.retryable && job.attempts < this.maxAttempts
        const state = uncertain ? 'needs_review' : cancelled ? (this.stopping ? 'queued' : 'cancelled') : canRetry ? 'retry' : 'failed'
        await job.update({ state, error: String(error.message || 'Job failed').slice(0, 2000), errorCode: uncertain ? 'speech_request_uncertain' : error.code || 'job_failed',
          retryAt: state === 'retry' ? new Date(Date.now() + 30000 * 2 ** (job.attempts - 1)) : null,
          finishedAt: ['failed', 'cancelled', 'needs_review'].includes(state) ? new Date() : null })
      })
    } finally { await this.onChange(job) }
  }

  async cancel(job) {
    return this.locked(async () => {
      await job.reload()
      if (['completed', 'cancelled'].includes(job.state)) return job
      const entry = this.active.get(job.id)
      const executing = entry && ['running', 'cancelling'].includes(job.state)
      await job.update({ state: executing ? 'cancelling' : 'cancelled', finishedAt: executing ? null : new Date() })
      entry?.controller.abort()
      await this.onChange(job)
      return job
    })
  }

  async retry(job, acknowledgeUncertain = false) {
    return this.locked(async () => {
      await job.reload()
      if (!['failed', 'cancelled', 'needs_review'].includes(job.state)) throw problem('Only stopped jobs can be retried', 409)
      if ((job.state === 'needs_review' || job.checkpoint?.pendingSpeech) && !acknowledgeUncertain) throw problem('Confirm that retrying an uncertain speech request may incur another charge', 409, 'speech_request_uncertain')
      const checkpoint = { ...job.checkpoint }
      delete checkpoint.pendingSpeech
      await job.update({ state: 'queued', checkpoint, error: null, errorCode: null, retryAt: null, finishedAt: null, attempts: 0 })
      await this.onChange(job)
      return job
    })
  }

  async stop() {
    this.stopping = true
    clearInterval(this.timer)
    while (this.polling) await new Promise(resolve => setTimeout(resolve, 10))
    for (const { controller } of this.active.values()) controller.abort()
    await Promise.allSettled([...this.active.values()].map(entry => entry.promise))
  }
}
module.exports = JobQueue
