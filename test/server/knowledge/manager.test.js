const { expect } = require('chai')
const fs = require('fs/promises')
const Path = require('path')
const express = require('express')
const { KnowledgeShelfManager } = require('../../../server/managers/KnowledgeShelfManager')
const { fixture, rejects, media, drain } = require('./helpers')
const { hash } = require('../../../server/knowledge/validation')
const { rawProbe } = require('../../../server/utils/prober')
const { problem } = require('../../../server/knowledge/errors')

describe('KnowledgeShelf library integration', function () {
  this.timeout(30000)
  let context, manager, calls, sample, sourceBody, documentBody
  beforeEach(async () => {
    context = await fixture()
    calls = 0
    sample = Path.join(context.directory, 'speech.mp3')
    media(sample)
    manager = new KnowledgeShelfManager({ root: Path.join(context.directory, 'knowledge'), speech: {
      configured: true, voices: async () => [{ id: 'voice', name: 'Reader' }],
      speak: async () => { calls++; return fs.readFile(sample) }
    }, youtube: {
      list: async () => [{ id: 'abcdefghijk', title: 'Episode' }],
      download: async (source, id, directory) => {
        await fs.mkdir(directory, { recursive: true })
        const path = Path.join(directory, source.mode === 'video' ? 'media.mp4' : 'media.m4a')
        media(path, source.mode === 'video')
        return { path, metadata: { id, title: 'Episode title', upload_date: '20260901', chapters: [{ title: 'Introduction', start_time: 0, end_time: 0.3 }] } }
      }
    } })
    await manager.init({ start: false })
    sourceBody = { name: 'Source', url: 'https://youtube.com/@channel', libraryId: context.libraries.podcast.library.id, libraryFolderId: context.libraries.podcast.folder.id }
    documentBody = { title: 'A readable document', author: 'Test author', text: 'Read the complete document exactly as it was written.', libraryId: context.libraries.book.library.id, libraryFolderId: context.libraries.book.folder.id }
  })
  afterEach(async () => { await manager.stop(); await context.close() })
  it('imports one original video with chapters, legacy filtering and native playback validation', async () => {
    const source = await manager.createSource(sourceBody, context.user)
    await drain(manager.queue)
    const job = await context.models.knowledgeJob.findOne({ where: { kind: 'youtube.download' } })
    expect(job.state, job.error).to.equal('completed')
    const asset = await context.models.knowledgeAsset.findOne({ where: { sourceId: source.id } })
    const episode = await context.models.podcastEpisode.unscoped().findByPk(asset.episodeId)
    expect(episode.title).to.equal('Episode title')
    expect(episode.audioFile).to.equal(null)
    expect(episode.chapters[0].title).to.equal('Introduction')
    expect(episode.videoSource.watchAvailable).to.equal(true)
    expect(await context.models.podcastEpisode.count()).to.equal(0)
    const original = await manager.validateVideo(episode, 'video')
    expect((await fs.readdir(Path.dirname(original))).filter(name => /\.(mp4|m4a|mp3)$/.test(name))).to.have.length(1)
    await manager.enqueueSource(source)
    await drain(manager.queue)
    expect(await context.models.podcastEpisode.unscoped().count()).to.equal(1)
    await manager.excludeEpisode(episode.id)
    await rejects(() => manager.validateVideo(episode, 'audio'), 'unavailable')
  })
  it('imports audio-only sources as ordinary ABS podcast episodes', async () => {
    await manager.createSource({ ...sourceBody, mode: 'audio' }, context.user)
    await drain(manager.queue)
    const job = await context.models.knowledgeJob.findOne({ where: { kind: 'youtube.download' } })
    expect(job.state, job.error).to.equal('completed')
    const episode = await context.models.podcastEpisode.findOne()
    expect(episode.audioFile.duration).to.be.greaterThan(0)
    expect(episode.videoSource).to.equal(null)
    await fs.access(episode.audioFile.metadata.path)
    const asset = await context.models.knowledgeAsset.findOne()
    expect(await fs.readdir(Path.join(manager.root, 'media'))).not.to.include(asset.id)
  })
  it('exposes native video through item and playback middleware without Pinchflat configuration', async () => {
    const source = await manager.createSource(sourceBody, context.user)
    await drain(manager.queue)
    const native = require('../../../server/managers/KnowledgeShelfManager')
    const legacy = require('../../../server/managers/VideoPodcastManager')
    const saved = { ready: native.ready, config: legacy.config }
    native.ready = true
    legacy.config = null
    const controller = require('../../../server/controllers/LibraryItemController')
    const app = express()
    app.use((req, _, next) => { req.user = context.user; next() })
    app.get('/items/:id', controller.middleware.bind(controller), controller.findOne.bind(controller))
    app.post('/items/:id/play/:episodeId', controller.middleware.bind(controller), (req, res) => res.json({ episodes: req.libraryItem.media.podcastEpisodes.map(episode => episode.id) }))
    const server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    const url = `http://127.0.0.1:${server.address().port}/items/${source.libraryItemId}`
    try {
      const item = await (await fetch(url + '?expanded=1&includeVideoEpisodes=1')).json()
      expect(item.media.episodes).to.have.length(1)
      const legacyItem = await (await fetch(url + '?expanded=1')).json()
      expect(legacyItem.media.episodes).to.have.length(0)
      const episodeId = item.media.episodes[0].id
      const playback = await (await fetch(url + `/play/${episodeId}?includeVideoEpisodes=1`, { method: 'POST' })).json()
      expect(playback.episodes).to.include(episodeId)
    } finally { await new Promise(resolve => server.close(resolve)); native.ready = saved.ready; legacy.config = saved.config }
  })
  it('checks original revisions and refuses replacement files', async () => {
    await manager.createSource(sourceBody, context.user)
    await drain(manager.queue)
    const episode = await context.models.podcastEpisode.unscoped().findOne()
    const path = await manager.validateVideo(episode, 'audio')
    await fs.appendFile(path, 'replacement')
    await rejects(() => manager.validateVideo(episode, 'video'), 'changed')
    await manager.reconcileSources()
    const asset = await context.models.knowledgeAsset.findOne()
    expect(asset.available).to.equal(false)
    media(path, true)
    await manager.refreshAsset(asset)
    await episode.reload()
    expect(await manager.validateVideo(episode, 'video')).to.equal(path)
    expect((await asset.reload()).episodeId).to.equal(episode.id)
  })
  it('keeps native video playlists available to opted-in clients and hidden from legacy clients', async () => {
    const source = await manager.createSource(sourceBody, context.user)
    await drain(manager.queue)
    const asset = await context.models.knowledgeAsset.findOne()
    const controller = require('../../../server/controllers/PlaylistController')
    const app = express()
    app.use(express.json(), (req, _, next) => { req.user = context.user; next() })
    app.post('/playlists', controller.create.bind(controller))
    app.get('/playlists/:id', controller.middleware.bind(controller), controller.findOne.bind(controller))
    app.post('/playlists/:id/item', controller.middleware.bind(controller), controller.addItem.bind(controller))
    const server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    const url = `http://127.0.0.1:${server.address().port}/playlists`
    const item = { libraryItemId: source.libraryItemId, episodeId: asset.episodeId }
    const body = { name: 'Video listens', libraryId: source.libraryId, items: [item] }
    const post = (path, data) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    try {
      expect((await post(url, body)).status).to.equal(400)
      const created = await post(url + '?includeVideoEpisodes=1', body)
      expect(created.status).to.equal(200)
      const playlist = await created.json()
      expect(playlist.items[0].episodeId).to.equal(asset.episodeId)
      const legacy = await (await fetch(url + '/' + playlist.id)).json()
      expect(legacy.items).to.have.length(0)
      const visible = await (await fetch(url + '/' + playlist.id + '?includeVideoEpisodes=1')).json()
      expect(visible.items).to.have.length(1)
      const libraryLists = await context.models.playlist.getOldPlaylistsForUserAndLibrary(context.user.id, source.libraryId, true)
      expect(libraryLists[0].items).to.have.length(1)
      const empty = await (await post(url, { ...body, items: [] })).json()
      expect((await post(url + '/' + empty.id + '/item?includeVideoEpisodes=1', item)).status).to.equal(200)
      const otherSource = await manager.createSource({ ...sourceBody, url: 'https://youtube.com/@another-channel' }, context.user)
      await drain(manager.queue)
      const mismatched = { ...body, items: [{ ...item, libraryItemId: otherSource.libraryItemId }] }
      expect((await post(url + '?includeVideoEpisodes=1', mismatched)).status).to.equal(400)
    } finally { await new Promise(resolve => server.close(resolve)) }
  })
  it('adopts a Pinchflat video without changing episode, progress or bookmark identity', async () => {
    const legacy = require('../../../server/managers/VideoPodcastManager')
    const previousConfig = legacy.config
    const source = await manager.createSource({ ...sourceBody, enabled: false }, context.user)
    const path = Path.join(context.directory, 'legacy.mp4')
    media(path, true)
    legacy.config = { mediaRoot: context.directory, sources: [{ sourceId: 'legacy-source', libraryItemId: source.libraryItemId }] }
    try {
      const record = await legacy.enqueue({ sourceId: 'legacy-source', videoId: 'abcdefghijk', relativePath: 'legacy.mp4', title: 'Existing episode' })
      await legacy.importRecord(record)
      const id = record.episodeId
      context.user.mediaProgresses = []
      await context.user.createUpdateMediaProgressFromPayload({ libraryItemId: source.libraryItemId, episodeId: id, currentTime: 0.1, duration: 0.3 })
      await context.user.createBookmark(source.libraryItemId, 0.1, 'Bookmark', id)
      const input = { sourceId: 'legacy-source', name: 'Adopted', url: sourceBody.url }
      expect((await manager.adoptPinchflat(input, context.user)).episodes).to.equal(1)
      expect((await manager.adoptPinchflat(input, context.user, true)).adopted).to.equal(1)
      const asset = await context.models.knowledgeAsset.findOne()
      expect(asset.episodeId).to.equal(id)
      expect(asset.owned).to.equal(false)
      expect((await record.reload()).state).to.equal('excluded')
      const progress = await context.models.mediaProgress.findOne({ where: { mediaItemId: id } })
      expect(progress.currentTime).to.equal(0.1)
      expect(context.user.findBookmark(source.libraryItemId, 0.1, id)).not.to.equal(undefined)
      const episode = await context.models.podcastEpisode.unscoped().findByPk(id)
      expect(await manager.validateVideo(episode, 'video')).to.equal(path)
      expect((await manager.adoptPinchflat(input, context.user, true)).adopted).to.equal(0)
    } finally { legacy.config = previousConfig }
  })
  it('retention deletes owned originals and keeps external adopted media', async () => {
    const source = await manager.createSource({ ...sourceBody, retentionDays: 1 }, context.user)
    await drain(manager.queue)
    const asset = await context.models.knowledgeAsset.findOne()
    await context.database.getQueryInterface().bulkUpdate('knowledgeAssets', { createdAt: new Date(Date.now() - 3 * 86400000).toISOString().replace('T', ' ').replace('Z', ' +00:00') }, { id: asset.id })
    await asset.update({ owned: false })
    await manager.retainSources()
    const path = Path.join(asset.root, asset.relativePath)
    await fs.access(path)
    await asset.update({ owned: true })
    await manager.retainSources()
    expect((await asset.reload()).available).to.equal(false)
    await rejects(() => fs.access(path))
    await manager.enqueueSource(source)
    await drain(manager.queue)
    expect(await context.models.podcastEpisode.unscoped().count()).to.equal(1)
  })
  it('creates a normal audiobook with real FFmpeg chapters and scanner import', async () => {
    const doc = await manager.createDocument(documentBody, null, context.user)
    const job = await manager.generateDocument(doc, { contentHash: doc.contentHash, voiceId: 'voice' }, context.user)
    await drain(manager.queue)
    await job.reload()
    expect(job.state, job.error).to.equal('completed')
    expect(calls).to.equal(1)
    await doc.reload()
    const item = await context.models.libraryItem.getExpandedById(doc.libraryItemId)
    expect(item.media.title).to.equal(documentBody.title)
    expect(item.media.audioFiles).to.have.length(1)
    const raw = await rawProbe(item.media.audioFiles[0].metadata.path)
    expect(raw.chapters).to.have.length(1)
    expect(raw.chapters[0].tags.title).to.equal('Document')
    expect((await manager.generateDocument(doc, { contentHash: doc.contentHash, voiceId: 'voice' }, context.user)).id).to.equal(job.id)
    expect(calls).to.equal(1)
    const originalItemId = item.id
    await manager.editDocument(doc, { title: 'Updated document title', text: 'A new complete document.' })
    const updated = await manager.generateDocument(doc, { contentHash: doc.contentHash, voiceId: 'voice' }, context.user)
    await drain(manager.queue)
    expect((await updated.reload()).state, updated.error).to.equal('completed')
    await doc.reload()
    expect(doc.libraryItemId).to.equal(originalItemId)
    expect((await context.models.libraryItem.getExpandedById(originalItemId)).media.title).to.equal('Updated document title')
  })
  it('resumes a narration using already paid chunks after a provider rate limit', async () => {
    const doc = await manager.createDocument({ ...documentBody, text: 'A complete sentence. '.repeat(300) }, null, context.user)
    manager.speech.speak = async () => {
      calls++
      if (calls === 2) throw Object.assign(problem('Rate limited', 502, 'speech_rejected'), { retryable: true })
      return fs.readFile(sample)
    }
    const job = await manager.generateDocument(doc, { contentHash: doc.contentHash, voiceId: 'voice' }, context.user)
    await drain(manager.queue)
    await job.reload()
    expect(job.state, job.error).to.equal('retry')
    expect(job.checkpoint.chunks).to.have.length(1)
    expect(job.checkpoint.pendingSpeech).to.equal(undefined)
    await job.update({ retryAt: new Date(0) })
    await drain(manager.queue)
    expect((await job.reload()).state, job.error).to.equal('completed')
    expect(calls).to.equal(3)
  })
  it('does not automatically retry uncertain paid requests, stale previews or excess character budgets', async () => {
    const doc = await manager.createDocument(documentBody, null, context.user)
    await rejects(() => manager.generateDocument(doc, { contentHash: 'old', voiceId: 'voice' }, context.user), 'latest document')
    await rejects(() => manager.generateDocument(doc, { contentHash: doc.contentHash, voiceId: 'voice', maxCharacters: 2 }, context.user), 'budget')
    manager.speech.speak = async () => { calls++; throw problem('Request interrupted', 502, 'speech_request_uncertain') }
    const job = await manager.generateDocument(doc, { contentHash: doc.contentHash, voiceId: 'voice' }, context.user)
    await drain(manager.queue)
    expect((await job.reload()).state).to.equal('needs_review')
    await drain(manager.queue)
    expect(calls).to.equal(1)
    await rejects(() => manager.editDocument(doc, { text: 'Another document.' }), 'active document')
    expect((await doc.reload()).state).to.equal('needs_review')
  })
  it('rechecks permissions before sending a queued paid request', async () => {
    const doc = await manager.createDocument(documentBody, null, context.user)
    const job = await manager.generateDocument(doc, { contentHash: doc.contentHash, voiceId: 'voice' }, context.user)
    await context.user.update({ isActive: false })
    await drain(manager.queue)
    expect((await job.reload()).state).to.equal('failed')
    expect(job.error).to.include('permission')
    expect(calls).to.equal(0)
    expect((await doc.reload()).state).to.equal('failed')
  })
  it('enforces owner, library and administrator access and hides disk paths in API responses', async () => {
    const doc = await manager.createDocument(documentBody, null, context.user)
    const app = express()
    app.use(express.json())
    let user = context.user
    app.use((req, _, next) => { req.user = user; next() })
    app.use(require('../../../server/routers/KnowledgeRouter')(manager))
    const server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    const request = (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, options)
    try {
      const body = await (await request(`/documents/${doc.id}`)).json()
      expect(body.text).to.equal(doc.text)
      expect(body).not.to.have.property('originalPath')
      const listing = await (await request('/documents')).json()
      expect(listing.documents[0]).not.to.have.property('text')
      expect(listing.documents[0].characters).to.equal(doc.text.length)
      expect((await request('/jobs')).status).to.equal(200)
      user = { id: 'another-user', isAdminOrUp: false, canUpload: false, checkCanAccessLibrary: () => true }
      expect((await request(`/documents/${doc.id}`)).status).to.equal(404)
      expect((await (await request('/jobs')).json()).total).to.equal(0)
      expect((await request('/sources')).status).to.equal(403)
      expect((await request('/voices')).status).to.equal(403)
      expect((await (await request('/documents')).json()).total).to.equal(0)
      user = { id: context.user.id, isAdminOrUp: true, checkCanAccessLibrary: () => false }
      expect((await request(`/documents/${doc.id}`)).status).to.equal(404)
    } finally { await new Promise(resolve => server.close(resolve)) }
  })
  it('runs the upgrade migration twice without losing queued checkpoints', async () => {
    const migration = require('../../../server/migrations/v2.37.0-knowledgeshelf')
    const job = await manager.queue.enqueue('document.extract', 'migration', { documentId: 'test' })
    await job.update({ checkpoint: { pendingSpeech: { index: 0 } } })
    const contextArg = { context: { queryInterface: context.database.getQueryInterface() } }
    await migration.up(contextArg)
    await migration.up(contextArg)
    expect((await job.reload()).checkpoint.pendingSpeech.index).to.equal(0)
    await rejects(() => migration.down(), 'backup')
  })
})
