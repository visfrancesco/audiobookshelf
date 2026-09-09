const { expect } = require('chai')
const JobQueue = require('../../../server/knowledge/JobQueue')
const { problem } = require('../../../server/knowledge/errors')
const { fixture, rejects, drain } = require('./helpers')

describe('KnowledgeShelf durable jobs', function () {
  this.timeout(15000)
  let context, queue
  beforeEach(async () => { context = await fixture(); queue = new JobQueue(context.models.knowledgeJob, { handlers: { test: async () => ({ success: true }) } }) })
  afterEach(async () => { await queue.stop(); await context.close() })
  it('deduplicates submissions and claims an overlapping poll once', async () => {
    let calls = 0
    queue.handlers.test = async () => { calls++; return { success: true } }
    const job = await queue.enqueue('test', 'one', {})
    expect((await queue.enqueue('test', 'one', {})).id).to.equal(job.id)
    await Promise.all([queue.tick(), queue.tick()])
    await drain(queue)
    await job.reload()
    expect(job.state).to.equal('completed')
    expect(calls).to.equal(1)
  })
  it('recovers ordinary jobs and isolates possibly charged requests after restart', async () => {
    const a = await queue.enqueue('test', 'a', {})
    const b = await queue.enqueue('test', 'b', {})
    await a.update({ state: 'running' })
    await b.update({ state: 'cancelling', checkpoint: { pendingSpeech: { index: 1 } } })
    await queue.recover()
    expect((await a.reload()).state).to.equal('queued')
    expect((await b.reload()).state).to.equal('needs_review')
    await rejects(() => queue.retry(b), 'another charge')
    await queue.retry(b, true)
    expect(b.checkpoint.pendingSpeech).to.equal(undefined)
  })
  it('backs off retryable failures and stops at the attempt limit', async () => {
    queue.handlers.test = async () => { throw Object.assign(problem('Busy'), { retryable: true }) }
    const job = await queue.enqueue('test', 'retry', {})
    for (let i = 1; i <= 3; i++) {
      await drain(queue)
      await job.reload()
      expect(job.state).to.equal(i === 3 ? 'failed' : 'retry')
      if (i < 3) { expect(job.retryAt.valueOf()).to.be.greaterThan(Date.now()); await job.update({ retryAt: new Date(0) }) }
    }
  })
  it('cancels active work through its abort signal', async () => {
    queue.handlers.test = async (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(problem('Aborted')), { once: true }))
    const job = await queue.enqueue('test', 'cancel', {})
    await queue.tick()
    await queue.cancel(job)
    await Promise.all([...queue.active.values()].map(entry => entry.promise))
    expect((await job.reload()).state).to.equal('cancelled')
  })
  it('retains partial checkpoints and requires explicit retry for uncertain speech', async () => {
    queue.handlers.test = async (_, { checkpoint }) => { await checkpoint({ chunks: [{ duration: 4 }], pendingSpeech: { index: 1 } }); throw new Error('Connection lost') }
    const job = await queue.enqueue('test', 'speech', {})
    await drain(queue)
    await job.reload()
    expect(job.state).to.equal('needs_review')
    await rejects(() => queue.retry(job), 'another charge')
    await queue.retry(job, true)
    expect(job.checkpoint.chunks).to.have.length(1)
  })
})
