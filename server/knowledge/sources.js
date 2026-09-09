const fs = require('fs/promises')
const Path = require('path')
const crypto = require('crypto')
const { Op } = require('sequelize')
const Database = require('../Database')
const { sourceValues, hash } = require('./validation')
const { problem, checkAbort } = require('./errors')
const { containedFile, revisionFor, describeVideo, normalizeChapters } = require('../utils/videoPodcastUtils')
const prober = require('../utils/prober')
const LibraryFile = require('../objects/files/LibraryFile')
const AudioFile = require('../objects/files/AudioFile')

module.exports = {
  async createSource(body, user) {
    await this.capacity()
    const values = sourceValues(body)
    const destination = await this.destination(body.libraryId, body.libraryFolderId, 'podcast', user)
    const id = crypto.randomUUID()
    const relPath = `KnowledgeShelf-${id}`
    const directory = Path.join(destination.root, relPath)
    await fs.mkdir(directory)
    const metadataPath = Path.join(directory, 'metadata.json')
    await fs.writeFile(metadataPath, JSON.stringify({ title: values.name, description: `Imported from ${values.url}`, tags: [], genres: [] }))
    const metadataFile = new LibraryFile()
    await metadataFile.setDataFromPath(metadataPath, 'metadata.json')
    const stat = await fs.stat(directory)
    let source
    try {
      await Database.sequelize.transaction(async transaction => {
        const podcast = await this.models.podcast.create({ title: values.name, autoDownloadEpisodes: false, description: `Imported from ${values.url}` }, { transaction })
        const item = await this.models.libraryItem.create({ path: directory, relPath, ino: String(stat.ino), isFile: false, isMissing: false, isInvalid: false,
          libraryFiles: [metadataFile.toJSON()], mediaId: podcast.id, mediaType: 'podcast', libraryId: body.libraryId, libraryFolderId: body.libraryFolderId }, { transaction })
        source = await this.models.knowledgeSource.create({ id, ...values, libraryId: body.libraryId, libraryFolderId: body.libraryFolderId, libraryItemId: item.id }, { transaction })
      })
    } catch (error) { await fs.rm(directory, { recursive: true, force: true }).catch(() => {}); throw error }
    if (source.enabled) await this.enqueueSource(source, user.id)
    return source
  },
  async updateSource(source, body) {
    // Destination and mode remain fixed so old episode paths and identities stay valid.
    if (['libraryId', 'libraryFolderId', 'mode', 'url'].some(key => body[key] !== undefined && body[key] !== source[key])) throw problem('Create a new source to change its URL, mode or destination', 409)
    await source.update(sourceValues({ ...source.toJSON(), ...body }))
    if (!source.enabled) {
      for (const job of await this.models.knowledgeJob.findAll({ where: { sourceId: source.id, state: ['queued', 'retry', 'running'] } })) await this.queue.cancel(job)
    }
    return source
  },
  async enqueueSource(source, ownerId) {
    return this.locked(`check:${source.id}`, async () => {
      const pending = await this.models.knowledgeJob.findOne({ where: { sourceId: source.id, kind: 'youtube.check', state: ['queued', 'retry', 'running'] } })
      if (pending) return pending
      await this.capacity()
      return this.queue.enqueue('youtube.check', `check:${source.id}:${crypto.randomUUID()}`, {}, { sourceId: source.id, ownerId })
    })
  },
  async schedule() {
    if (this.scheduling || !this.ready) return
    this.scheduling = true
    try {
      for (const source of await this.models.knowledgeSource.findAll({ where: { enabled: true, [Op.or]: [{ nextCheckAt: null }, { nextCheckAt: { [Op.lte]: new Date() } }] } })) {
        await this.enqueueSource(source)
        await source.update({ nextCheckAt: new Date(Date.now() + source.intervalMinutes * 60000) })
      }
      await this.retainSources()
      await this.reconcileSources()
    } finally { this.scheduling = false }
  },
  async checkSource(job, { signal }) {
    const source = await this.models.knowledgeSource.findByPk(job.sourceId)
    if (!source) throw problem('Source was removed', 404)
    try {
      const videos = await this.youtube.list(source, signal)
      for (const video of videos) {
        checkAbort(signal)
        const asset = await this.models.knowledgeAsset.findOne({ where: { sourceId: source.id, externalId: video.id } })
        if (asset) continue // Includes retained and deliberately excluded episodes.
        await this.capacity()
        await this.queue.enqueue('youtube.download', `youtube:${source.id}:${video.id}`, { videoId: video.id }, { sourceId: source.id, ownerId: job.ownerId })
      }
      await source.update({ lastCheckedAt: new Date(), lastError: null, nextCheckAt: new Date(Date.now() + source.intervalMinutes * 60000) })
      return { discovered: videos.length }
    } catch (error) { await source.update({ lastError: error.message }); throw error }
  },
  async downloadVideo(job, { signal }) {
    const source = await this.models.knowledgeSource.findByPk(job.sourceId)
    if (!source) throw problem('Source was removed', 404)
    const id = hash(`${source.id}:${job.payload.videoId}`)
    const existing = await this.models.knowledgeAsset.findByPk(id)
    if (existing) return { assetId: existing.id, episodeId: existing.episodeId }
    const directory = Path.join(this.root, 'media', id)
    const result = await this.youtube.download(source, job.payload.videoId, directory, signal)
    checkAbort(signal)
    if (!result) return { skipped: true }
    let filePath = result.path, root = this.root
    if (source.mode === 'audio') {
      const item = await this.models.libraryItem.findByPk(source.libraryItemId)
      if (!item) throw problem('Target podcast was removed', 404)
      const destination = await this.destination(source.libraryId, source.libraryFolderId, 'podcast')
      root = destination.root
      const itemRoot = await fs.realpath(item.path)
      const relative = Path.relative(root, itemRoot)
      if (!relative || relative.startsWith('..') || Path.isAbsolute(relative)) throw problem('Podcast directory is outside its library folder', 409)
      filePath = Path.join(item.path, `${job.payload.videoId}${Path.extname(result.path)}`)
      const temporary = Path.join(item.path, `.${job.payload.videoId}.tmp`)
      await fs.copyFile(result.path, temporary)
      // Linking publishes atomically without overwriting an unrelated file.
      try { await fs.link(temporary, filePath) } catch (error) {
        if (error.code !== 'EEXIST') throw error
        const existing = await containedFile(root, Path.relative(root, filePath))
        if (await fileHash(existing.path) !== await fileHash(temporary)) throw problem('A different file already exists at the audio destination', 409)
      } finally { await fs.unlink(temporary).catch(() => {}) }
    }
    const asset = await this.importSourceMedia(source, { id, externalId: job.payload.videoId, root, relativePath: Path.relative(root, filePath), metadata: result.metadata, thumbnail: result.thumbnail, owned: true })
    if (source.mode === 'audio') await fs.rm(directory, { recursive: true, force: true })
    return { assetId: asset.id, episodeId: asset.episodeId, libraryItemId: asset.libraryItemId }
  },
  async importSourceMedia(source, input) {
    return this.locked(`asset:${input.id}`, async () => {
      const existing = await this.models.knowledgeAsset.findByPk(input.id)
      if (existing && !input.replace) return existing
      const item = await this.models.libraryItem.getExpandedById(source.libraryItemId, true)
      if (!item?.isPodcast) throw problem('Target podcast was removed', 404)
      const file = await containedFile(input.root, input.relativePath)
      const revision = revisionFor(file.stat)
      let videoSource = null, audioFile = null, chapters
      if (source.mode === 'video') {
        const description = describeVideo(await prober.rawProbe(file.path, { timeout: 30000, maxOutputBytes: 16 * 1024 ** 2 }))
        chapters = description.chapters.length ? description.chapters : normalizeChapters(input.metadata.chapters, description.duration)
        delete description.chapters
        videoSource = { ...description, provider: 'knowledgeshelf', assetId: input.id, sourceId: source.id, videoId: input.externalId, revision, previousRevision: existing?.revision || null, size: file.stat.size, available: true }
      } else {
        const libraryFile = new LibraryFile()
        await libraryFile.setDataFromPath(file.path, Path.relative(item.path, file.path))
        const probe = await prober.probe(file.path)
        if (probe.error) throw problem('Could not probe downloaded audio', 422)
        audioFile = new AudioFile()
        audioFile.setDataFromProbe(libraryFile, probe)
        audioFile.index = 1
        chapters = normalizeChapters(input.metadata.chapters, audioFile.duration)
        audioFile = audioFile.toJSON()
        const files = item.libraryFiles.filter(f => f.metadata.path !== file.path)
        await item.update({ libraryFiles: [...files, libraryFile.toJSON()] })
      }
      if (revisionFor(await fs.stat(file.path)) !== revision) throw problem('Media changed during import', 409)
      const date = input.metadata.upload_date?.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
      const publishedAt = date && Number.isFinite(Date.parse(date)) ? new Date(date) : new Date()
      let asset
      await Database.sequelize.transaction(async transaction => {
        const episodeId = existing?.episodeId || input.episodeId
        let episode = episodeId && await this.models.podcastEpisode.unscoped().findByPk(episodeId, { transaction })
        const values = { podcastId: item.media.id, title: String(input.metadata.title || input.externalId).slice(0, 1000), description: input.metadata.description || '',
          audioFile, videoSource, chapters, publishedAt, pubDate: publishedAt.toUTCString(), extraData: { ...episode?.extraData, guid: `youtube:${input.externalId}`, originalURL: `https://www.youtube.com/watch?v=${input.externalId}` } }
        if (episode) {
          if (episode.podcastId !== item.media.id) throw problem('Episode belongs to another podcast', 409)
          await episode.update(values, { transaction })
        } else episode = await this.models.podcastEpisode.unscoped().create(values, { transaction })
        const assetValues = { ...input, libraryItemId: item.id, episodeId: episode.id, sourceId: source.id, revision, available: true, excluded: false }
        asset = existing ? await existing.update(assetValues, { transaction }) : await this.models.knowledgeAsset.create(assetValues, { transaction })
        if (input.legacyRecordId) await this.models.videoImport.update({ state: 'excluded' }, { where: { id: input.legacyRecordId }, transaction })
      })
      if (input.thumbnail && !item.media.coverPath) {
        const thumbnail = await containedFile(this.root, Path.relative(this.root, input.thumbnail))
        if (thumbnail.stat.size <= 10 * 1024 ** 2) {
          const coverPath = Path.join(global.MetadataPath, 'items', item.id, 'cover.jpg')
          await fs.mkdir(Path.dirname(coverPath), { recursive: true })
          await fs.copyFile(thumbnail.path, coverPath)
          await item.media.update({ coverPath })
        }
      }
      return asset
    })
  },
  async refreshAsset(asset) {
    const source = await this.models.knowledgeSource.findByPk(asset.sourceId)
    if (!source) throw problem('The source must exist to reimport its media', 409)
    await require('../managers/VideoPodcastManager').closeEpisodeSessions(asset.episodeId)
    return this.importSourceMedia(source, { ...asset.toJSON(), replace: true })
  },
  async validateVideo(episode, mode) {
    const source = episode.videoSource
    const asset = source?.assetId && await this.models.knowledgeAsset.findByPk(source.assetId)
    if (!asset || asset.excluded || !asset.available || asset.episodeId !== episode.id) throw problem('The original video is unavailable', 404)
    const item = await this.models.libraryItem.findByPk(asset.libraryItemId)
    if (!item || item.mediaId !== episode.podcastId) throw problem('This media no longer belongs to the podcast', 409)
    let file
    try { file = await containedFile(asset.root, asset.relativePath) } catch (_) { throw problem('The original video is unavailable', 404) }
    if (revisionFor(file.stat) !== source.revision) throw problem('The original video changed; reimport it before playback', 409)
    if (mode === 'video' && !source.watchAvailable) throw problem(source.watchReason, 422)
    return file.path
  },
  async excludeEpisode(episodeId) {
    if (!this.models.knowledgeAsset) return
    await this.models.knowledgeAsset.update({ excluded: true }, { where: { episodeId } })
  },
  async retainSources() {
    for (const source of await this.models.knowledgeSource.findAll({ where: { retentionDays: { [Op.gt]: 0 } } })) {
      const assets = await this.models.knowledgeAsset.findAll({ where: { sourceId: source.id, owned: true, available: true, createdAt: { [Op.lt]: new Date(Date.now() - source.retentionDays * 86400000) } } })
      for (const asset of assets) {
        await this.locked(`asset:${asset.id}`, async () => {
          const episode = await this.models.podcastEpisode.unscoped().findByPk(asset.episodeId)
          await require('../managers/VideoPodcastManager').closeEpisodeSessions(asset.episodeId)
          const file = await containedFile(asset.root, asset.relativePath).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
          if (file) {
            if (revisionFor(file.stat) !== asset.revision) return // Ownership of replaced files is uncertain.
            await fs.unlink(file.path)
          }
          await asset.update({ available: false })
          if (episode?.videoSource) await episode.update({ videoSource: { ...episode.videoSource, available: false } })
        })
      }
    }
  },
  async reconcileSources() {
    let offset = 0
    while (true) {
      const assets = await this.models.knowledgeAsset.findAll({ where: { sourceId: { [Op.ne]: null }, excluded: false, available: true }, limit: 100, offset, order: [['id', 'ASC']] })
      if (!assets.length) break
      // Adjust the offset below when updates remove rows from this result set.
      offset += assets.length
      for (const asset of assets) {
        const file = await containedFile(asset.root, asset.relativePath).catch(() => null)
        if (file && revisionFor(file.stat) === asset.revision) continue
        await require('../managers/VideoPodcastManager').closeEpisodeSessions(asset.episodeId)
        await asset.update({ available: false })
        offset--
        const episode = await this.models.podcastEpisode.unscoped().findByPk(asset.episodeId)
        if (episode?.videoSource) await episode.update({ videoSource: { ...episode.videoSource, available: false } })
      }
    }
  },
  async adoptPinchflat(body, user, execute = false) {
    const legacy = require('../managers/VideoPodcastManager')
    const mapping = legacy.config?.sources.find(source => source.sourceId === body.sourceId)
    if (!mapping) throw problem('Select an existing Pinchflat source mapping', 404)
    const item = await this.models.libraryItem.findByPk(mapping.libraryItemId)
    if (!item || !user.checkCanAccessLibrary(item.libraryId)) throw problem('Library access denied', 403)
    const values = sourceValues({ ...body, name: body.name || 'Imported Pinchflat source', mode: 'video', enabled: false })
    const records = await this.models.videoImport.findAll({ where: { libraryItemId: item.id, state: 'ready' } })
    const candidates = records.filter(record => record.manifest?.sourceId === body.sourceId && record.episodeId)
    if (!execute) return { sourceId: body.sourceId, episodes: candidates.length, libraryItemId: item.id, ownsFiles: false }
    return this.locked(`adopt:${body.sourceId}`, async () => {
      const [source] = await this.models.knowledgeSource.findOrCreate({ where: { id: body.sourceId }, defaults: { ...values, libraryId: item.libraryId, libraryFolderId: item.libraryFolderId, libraryItemId: item.id } })
      if (source.libraryItemId !== item.id || source.url !== values.url) throw problem('Source was already adopted with different settings', 409)
      let adopted = 0
      for (const record of candidates) {
        await legacy.withRecordLock(record.id, async () => {
          await record.reload()
          if (record.state !== 'ready') return
          const episode = await this.models.podcastEpisode.unscoped().findByPk(record.episodeId)
          if (!episode) return
          await legacy.closeEpisodeSessions(episode.id)
          await this.importSourceMedia(source, { id: hash(`${source.id}:${record.manifest.videoId}`), externalId: record.manifest.videoId,
            root: legacy.config.mediaRoot, relativePath: record.manifest.relativePath, owned: false, episodeId: episode.id, legacyRecordId: record.id,
            metadata: { title: episode.title, description: episode.description, chapters: episode.chapters, upload_date: episode.publishedAt?.toISOString().slice(0, 10).replace(/-/g, '') } })
          adopted++
        })
      }
      return { source, adopted }
    })
  }
}

async function fileHash(path) {
  const digest = crypto.createHash('sha256')
  for await (const chunk of require('fs').createReadStream(path)) digest.update(chunk)
  return digest.digest('hex')
}
