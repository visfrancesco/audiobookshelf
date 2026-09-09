const Path = require('path')
const fs = require('fs/promises')
const crypto = require('crypto')
const axios = require('axios')
const { Op } = require('sequelize')
const { parseStringPromise } = require('xml2js')
const Database = require('../Database')
const Logger = require('../Logger')
const { rawProbe } = require('../utils/prober')
const { containedFile, revisionFor, describeVideo, playbackError } = require('../utils/videoPodcastUtils')
const { AudioStreamBudget } = require('../objects/VideoAudioStream')

class VideoPodcastManager {
  constructor() {
    this.config = null
    this.timer = null
    this.busy = false
    this.lastReconcile = 0
    this.budget = new AudioStreamBudget()
    this.locks = new Map()
    this.observedRevisions = new Map()
  }
  get enabled() { return !!this.config }
  get records() { return Database.models.videoImport }

  async init(playbackSessionManager) {
    this.playbackSessionManager = playbackSessionManager
    const configPath = process.env.VIDEO_PODCAST_CONFIG || Path.join(global.ConfigPath, 'video-podcasts.json')
    let config
    try { config = JSON.parse(await fs.readFile(configPath, 'utf8')) } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    if (!config.enabled) return
    if (!Path.isAbsolute(config.mediaRoot || '') || !Path.isAbsolute(config.inbox || '') || !Array.isArray(config.sources)) throw new Error('Video podcasts need absolute mediaRoot/inbox and source mappings')
    config.mediaRoot = await fs.realpath(config.mediaRoot)
    await fs.mkdir(config.inbox, { recursive: true })
    config.inbox = await fs.realpath(config.inbox)
    const overlapsMedia = directory => {
      const relative = Path.relative(config.mediaRoot, directory)
      const reverse = Path.relative(directory, config.mediaRoot)
      return !relative || (!relative.startsWith('..' + Path.sep) && relative !== '..' && !Path.isAbsolute(relative)) ||
        (!reverse.startsWith('..' + Path.sep) && reverse !== '..' && !Path.isAbsolute(reverse))
    }
    if (overlapsMedia(config.inbox)) throw new Error('The completion inbox must be separate from original media')
    for (const key of ['concurrency', 'maxStreamBytes']) {
      if (config[key] !== undefined && (!Number.isSafeInteger(config[key]) || config[key] <= 0)) throw new Error(`Video ${key} must be a positive integer`)
    }
    const ids = new Set()
    const activeSources = []
    for (const source of config.sources) {
      if (!source.sourceId || ids.has(source.sourceId) || !source.libraryItemId) throw new Error('Video source mappings need unique sourceId and a target libraryItemId')
      ids.add(source.sourceId)
      const item = await Database.libraryItemModel.getExpandedById(source.libraryItemId)
      // Removing a mapped podcast must not prevent the entire server restarting.
      if (!item) { Logger.warn(`[VideoPodcasts] Source ${source.sourceId}: target podcast was removed; mapping disabled`); continue }
      if (!item.isPodcast) throw new Error(`Video source ${source.sourceId} must target a podcast`)
      if (item.media.autoDownloadEpisodes) throw new Error(`Disable RSS automatic downloads for video source ${source.sourceId}`)
      if (item.path && overlapsMedia(await fs.realpath(item.path))) throw new Error('Target podcast directories must be separate from Pinchflat originals')
      activeSources.push(source)
    }
    config.sources = activeSources
    this.config = config
    this.budget = new AudioStreamBudget(Math.max(1, Math.min(8, config.concurrency || 2)), Math.max(1024 ** 2, config.maxStreamBytes || 4 * 1024 ** 3))
    await this.records.update({ state: 'queued' }, { where: { state: 'processing' } })
    this.timer = setInterval(() => this.tick().catch(error => Logger.error('[VideoPodcasts] Import cycle failed', error.message)), 5000)
    this.timer.unref()
    Logger.info(`[VideoPodcasts] Enabled ${config.sources.length} source mappings`)
  }

  async stop() {
    clearInterval(this.timer)
    while (this.busy) await new Promise(resolve => setTimeout(resolve, 50))
  }

  async enqueue(manifest, restore = false) {
    if (!this.enabled) throw playbackError('Video podcasts are disabled', 503)
    const mapping = this.config.sources.find(s => s.sourceId === manifest.sourceId)
    if (!mapping || !/^[a-zA-Z0-9_-]{1,128}$/.test(manifest.videoId || '')) throw playbackError('Unknown source or invalid video ID', 400)
    if (manifest.kind !== 'deleted') await containedFile(this.config.mediaRoot, manifest.relativePath)
    const id = crypto.createHash('sha256').update(`${mapping.libraryItemId}:${manifest.videoId}`).digest('hex')
    return this.withRecordLock(id, async () => {
      const [record] = await this.records.findOrCreate({ where: { id }, defaults: { libraryItemId: mapping.libraryItemId, manifest, state: 'queued' } })
      if (record.state === 'excluded' && !restore) return record
      await record.update({ manifest: { ...record.manifest, ...manifest, kind: manifest.kind || 'completed' }, state: 'queued', retryAt: null, error: null })
      return record
    })
  }

  // A completion arriving during ffprobe must be processed after that import,
  // never overwritten by its final state update. This also orders exclusions.
  async withRecordLock(id, operation) {
    const previous = this.locks.get(id) || Promise.resolve()
    const pending = previous.catch(() => {}).then(operation)
    this.locks.set(id, pending)
    try { return await pending } finally { if (this.locks.get(id) === pending) this.locks.delete(id) }
  }

  async tick() {
    if (!this.enabled || this.busy) return
    this.busy = true
    try {
      for (const name of await fs.readdir(this.config.inbox)) {
        if (!name.endsWith('.json') && !name.endsWith('.json.processing')) continue
        try {
          // Claim with rename so a new atomic hook write cannot be unlinked.
          const claimed = name.endsWith('.processing') ? name : `${crypto.randomUUID()}.json.processing`
          if (claimed !== name) await fs.rename(Path.join(this.config.inbox, name), Path.join(this.config.inbox, claimed))
          const file = await containedFile(this.config.inbox, claimed)
          if (file.stat.size > 1024 ** 2) throw new Error('Completion manifest is too large')
          const body = await fs.readFile(file.path, 'utf8')
          await this.enqueue(JSON.parse(body))
          await fs.unlink(file.path)
        } catch (error) { Logger.warn(`[VideoPodcasts] Manifest ${name}: ${error.message}`) }
      }
      await this.playbackSessionManager?.closeStaleOpenSessions()
      const records = await this.records.findAll({ where: { state: ['queued', 'failed'], [Op.or]: [{ retryAt: null }, { retryAt: { [Op.lte]: new Date() } }] }, order: [['createdAt', 'ASC']], limit: 100 })
      for (const record of records) {
        await this.importRecord(record, true)
      }
      if (Date.now() - this.lastReconcile >= 300000) {
        this.lastReconcile = Date.now()
        await this.reconcile()
      }
    } finally { this.busy = false }
  }

  async importRecord(record, queuedOnly = false) {
    return this.withRecordLock(record.id, async () => {
      await record.reload()
      if (record.state === 'excluded' || (queuedOnly && !['queued', 'failed'].includes(record.state))) return
      await record.update({ state: 'processing', attempts: record.attempts + 1 })
      try { await this.processRecord(record) } catch (error) {
        await record.update({ state: 'failed', error: error.message, retryAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.min(record.attempts, 7)) * 1000) })
        if (!queuedOnly) throw error
        Logger.warn(`[VideoPodcasts] Import ${record.id}: ${error.message}`)
      }
    })
  }

  async processRecord(record) {
    const manifest = record.manifest
    const item = await Database.libraryItemModel.getExpandedById(record.libraryItemId)
    if (!item?.isPodcast) throw new Error('Target podcast was removed')
    let episode = record.episodeId ? await Database.podcastEpisodeModel.unscoped().findByPk(record.episodeId) : null
    if (manifest.kind === 'deleted') {
      if (episode) await this.closeEpisodeSessions(episode.id)
      if (episode?.videoSource) await episode.update({ videoSource: { ...episode.videoSource, available: false } })
      await record.update({ state: 'missing' })
      return
    }
    const file = await containedFile(this.config.mediaRoot, manifest.relativePath)
    const revision = revisionFor(file.stat)
    if (episode && episode.videoSource?.revision !== revision) {
      await this.closeEpisodeSessions(episode.id)
      await episode.update({ videoSource: { ...episode.videoSource, available: false } })
    }
    if (manifest.expectedSize && Number(manifest.expectedSize) !== file.stat.size) throw new Error('Completed file size does not match the manifest')
    if (episode?.videoSource?.revision === revision) {
      await episode.update({ videoSource: { ...episode.videoSource, available: true } })
      await record.update({ state: 'ready', error: null, retryAt: null })
      return
    }
    const raw = await rawProbe(file.path, { timeout: 30000, maxOutputBytes: 16 * 1024 ** 2 })
    const description = describeVideo(raw)
    const after = await fs.stat(file.path)
    if (revisionFor(after) !== revision) throw new Error('File changed during import; waiting for a completed revision')
    let metadata = {}
    if (manifest.metadataPath) {
      const metaFile = await containedFile(this.config.mediaRoot, manifest.metadataPath)
      if (metaFile.stat.size > 16 * 1024 ** 2) throw new Error('Metadata is too large')
      metadata = JSON.parse(await fs.readFile(metaFile.path, 'utf8'))
      if (metadata.id !== manifest.videoId) throw new Error('Metadata belongs to a different YouTube video')
    }
    const videoSource = { ...description, relativePath: manifest.relativePath, sourceId: manifest.sourceId,
      videoId: manifest.videoId, revision, size: file.stat.size, available: true,
      previousRevision: episode?.videoSource?.revision || null }
    delete videoSource.chapters
    const uploadDate = metadata.upload_date?.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
    const publishedAt = uploadDate && Number.isFinite(Date.parse(uploadDate)) ? new Date(uploadDate) : new Date()
    const values = { podcastId: item.media.id, title: metadata.title || manifest.title || manifest.videoId,
      description: metadata.description || '', audioFile: null, videoSource, chapters: description.chapters,
      publishedAt, pubDate: publishedAt.toUTCString(), extraData: { ...(episode?.extraData || {}), guid: `youtube:${manifest.videoId}`, originalURL: `https://www.youtube.com/watch?v=${manifest.videoId}` } }
    await Database.sequelize.transaction(async transaction => {
      if (episode) await episode.update(values, { transaction })
      else episode = await Database.podcastEpisodeModel.unscoped().create(values, { transaction })
      await record.update({ episodeId: episode.id, state: 'ready', error: null, retryAt: null }, { transaction })
    })
    if (manifest.thumbnailPath) {
      try {
        const thumbnail = await containedFile(this.config.mediaRoot, manifest.thumbnailPath)
        if (thumbnail.stat.size < 10 * 1024 ** 2 && /\.(jpg|jpeg|png|webp)$/i.test(thumbnail.path)) {
          const coverDirectory = Path.join(global.MetadataPath, 'items', item.id)
          await fs.mkdir(coverDirectory, { recursive: true })
          const coverPath = Path.join(coverDirectory, 'cover' + Path.extname(thumbnail.path))
          if (!item.media.coverPath) { await fs.copyFile(thumbnail.path, coverPath); await item.media.update({ coverPath }) }
        }
      } catch (error) { Logger.warn(`[VideoPodcasts] Artwork unavailable: ${error.message}`) }
    }
    Logger.info(`[VideoPodcasts] Imported episode ${episode.id}`)
  }

  async validateSource(episode, mode) {
    if (episode.videoSource?.provider === 'knowledgeshelf') return require('./KnowledgeShelfManager').validateVideo(episode, mode)
    if (!this.enabled) throw playbackError('Video podcasts are disabled', 503)
    const source = episode.videoSource
    if (!source || source.available === false) throw playbackError('The original video is unavailable', 404)
    const mapping = this.config.sources.find(s => s.sourceId === source.sourceId)
    const target = mapping && await Database.libraryItemModel.findByPk(mapping.libraryItemId, { attributes: ['mediaId'] })
    if (!target || target.mediaId !== episode.podcastId) throw playbackError('Video source mapping is disabled for this podcast', 503)
    let file
    try { file = await containedFile(this.config.mediaRoot, source.relativePath) } catch (_) { throw playbackError('The original video is unavailable', 404) }
    if (revisionFor(file.stat) !== source.revision) throw playbackError('The original changed; wait for reimport before resuming', 409)
    if (mode === 'video' && !source.watchAvailable) throw playbackError(source.watchReason)
    return file.path
  }

  async closeEpisodeSessions(episodeId) {
    const manager = this.playbackSessionManager
    if (!manager) return
    for (const session of [...manager.sessions]) {
      if (session.episodeId === episodeId) await manager.removeSession(session.id)
    }
  }

  async excludeEpisode(episodeId) {
    for (const record of await this.records.findAll({ where: { episodeId } })) {
      await this.withRecordLock(record.id, async () => {
        await this.closeEpisodeSessions(episodeId)
        await record.update({ state: 'excluded' })
      })
    }
  }

  async reconcile() {
    for (const mapping of this.config.sources) {
      if (!mapping.feedURL || !mapping.relativeDirectory) continue
      try {
        const response = await axios.get(mapping.feedURL, { timeout: 15000, maxContentLength: 16 * 1024 ** 2, responseType: 'text', maxRedirects: 0 })
        const feed = await parseStringPromise(response.data)
        const entries = feed.rss?.channel?.[0]?.item || []
        if (entries.length >= 2000) Logger.warn(`[VideoPodcasts] Source ${mapping.sourceId}: feed reached 2000 items; use completed-file backfill for older downloads`)
        const complete = new Map(entries.map(e => [new URL(e.link?.[0] || 'https://youtube.com').searchParams.get('v'), e]))
        // Reconciliation only accepts files confirmed by the downloaded-media feed.
        const directory = Path.resolve(this.config.mediaRoot, mapping.relativeDirectory)
        const relative = Path.relative(this.config.mediaRoot, await fs.realpath(directory))
        if (relative.startsWith('..') || Path.isAbsolute(relative)) throw new Error('Reconciliation directory is outside media root')
        const walk = async dir => {
          for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
            const path = Path.join(dir, entry.name)
            if (entry.isDirectory()) await walk(path)
            else if (entry.isFile() && entry.name.endsWith('.info.json')) {
              const stat = await fs.stat(path)
              if (stat.size > 16 * 1024 ** 2) continue
              let meta
              try { meta = JSON.parse(await fs.readFile(path, 'utf8')) } catch (_) { continue }
              const rss = complete.get(meta.id)
              if (!rss) continue
              const ext = Path.extname(new URL(rss.enclosure[0].$.url).pathname)
              const media = path.slice(0, -'.info.json'.length) + ext
              const mediaStat = await fs.stat(media).catch(() => null)
              if (!mediaStat || mediaStat.size !== Number(rss.enclosure[0].$.length)) continue
              const id = crypto.createHash('sha256').update(`${mapping.libraryItemId}:${meta.id}`).digest('hex')
              const existing = await this.records.findByPk(id)
              if (existing?.state === 'excluded' || ['queued', 'processing', 'failed'].includes(existing?.state)) continue
              const episode = existing?.episodeId && await Database.podcastEpisodeModel.unscoped().findByPk(existing.episodeId)
              const revision = revisionFor(mediaStat)
              if (episode?.videoSource?.revision === revision && existing.state === 'ready') continue
              // Recover missed hooks only after two observations of a stable,
              // feed-confirmed download; never import a file being replaced.
              if (this.observedRevisions.get(id) !== revision) { this.observedRevisions.set(id, revision); continue }
              this.observedRevisions.delete(id)
              await this.enqueue({ kind: 'completed', sourceId: mapping.sourceId, videoId: meta.id, relativePath: Path.relative(this.config.mediaRoot, media), metadataPath: Path.relative(this.config.mediaRoot, path), expectedSize: mediaStat.size })
            }
          }
        }
        await walk(directory)
      } catch (error) { Logger.warn(`[VideoPodcasts] Source ${mapping.sourceId} reconciliation failed: ${error.message}`) }
    }
    const records = await this.records.findAll({ where: { state: ['ready', 'missing'] } })
    for (const record of records) {
      await this.withRecordLock(record.id, async () => {
        await record.reload()
        if (!['ready', 'missing'].includes(record.state)) return
        const episode = await Database.podcastEpisodeModel.unscoped().findByPk(record.episodeId)
        if (!episode?.videoSource) return
        try {
          const file = await containedFile(this.config.mediaRoot, episode.videoSource.relativePath)
          if (revisionFor(file.stat) !== episode.videoSource.revision) throw new Error('Source revision changed; waiting for completion')
          // An explicit deletion remains missing until a completion confirms it.
        } catch (_) {
          await this.closeEpisodeSessions(episode.id)
          await episode.update({ videoSource: { ...episode.videoSource, available: false } })
          await record.update({ state: 'missing' })
        }
      })
    }
  }
}
module.exports = new VideoPodcastManager()
module.exports.VideoPodcastManager = VideoPodcastManager
