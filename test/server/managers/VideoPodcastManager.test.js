const { expect } = require('chai')
const { Sequelize } = require('sequelize')
const fs = require('fs/promises')
const os = require('os')
const Path = require('path')
const { execFileSync } = require('child_process')
const Database = require('../../../server/Database')
const { VideoPodcastManager } = require('../../../server/managers/VideoPodcastManager')
const { up } = require('../../../server/migrations/v2.36.1-video-podcasts')

describe('Video podcast import and compatibility', function () {
  this.timeout(30000)
  let directory, manager, item, previousDatabase, previousMetadata, previousSettings, database, manifest
  before(async function () {
    try { execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], { stdio: 'ignore' }) } catch (_) { this.skip() }
    previousDatabase = Database.sequelize
    previousMetadata = global.MetadataPath
    previousSettings = global.ServerSettings
    global.ServerSettings = { sortingPrefixes: ['the', 'a', 'an'] }
    directory = await fs.mkdtemp(Path.join(os.tmpdir(), 'abs-import-test-'))
    global.MetadataPath = directory
    database = new Sequelize('sqlite::memory:', { logging: false })
    database.uppercaseFirst = value => value.charAt(0).toUpperCase() + value.slice(1)
    Database.sequelize = database
    await Database.buildModels(true)
    const library = await Database.libraryModel.create({ name: 'Podcasts', mediaType: 'podcast' })
    const folder = await Database.libraryFolderModel.create({ path: directory, libraryId: library.id })
    const podcast = await Database.podcastModel.create({ title: 'Video podcast', autoDownloadEpisodes: false })
    item = await Database.libraryItemModel.create({ libraryFiles: [], mediaId: podcast.id, mediaType: 'podcast', libraryId: library.id, libraryFolderId: folder.id })
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10', '-f', 'lavfi', '-i', 'sine=sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', Path.join(directory, 'episode.mp4')])
    await fs.writeFile(Path.join(directory, 'episode.info.json'), JSON.stringify({ id: 'yt-test', title: 'An interview', description: 'Description', upload_date: '20260901' }))
    manager = new VideoPodcastManager()
    manager.config = { mediaRoot: directory, inbox: Path.join(directory, 'inbox'), sources: [{ sourceId: 'source', libraryItemId: item.id }] }
    await fs.mkdir(manager.config.inbox)
    manifest = { sourceId: 'source', videoId: 'yt-test', relativePath: 'episode.mp4', metadataPath: 'episode.info.json' }
  })
  after(async () => {
    if (database) await database.close()
    Database.sequelize = previousDatabase
    global.MetadataPath = previousMetadata
    global.ServerSettings = previousSettings
    if (directory) await fs.rm(directory, { recursive: true, force: true })
  })

  it('supports an empty target podcast and stores one external episode', async () => {
    expect(await Database.libraryItemModel.getExpandedById(item.id)).to.have.property('media').that.is.not.null
    const record = await manager.enqueue(manifest)
    await manager.importRecord(record)
    const episode = await Database.podcastEpisodeModel.unscoped().findByPk(record.episodeId)
    expect(episode.title).to.equal('An interview')
    expect(episode.audioFile).to.equal(null)
    expect(episode.videoSource.watchAvailable).to.equal(true)
    expect(episode.duration).to.be.closeTo(3, 0.1)
    const legacy = await Database.libraryItemModel.getExpandedById(item.id)
    expect(legacy.toOldJSONExpanded().media.episodes).to.deep.equal([])
    const expanded = await Database.libraryItemModel.getExpandedById(item.id, true)
    expect(expanded.toOldJSONExpanded().media.episodes).to.deep.equal([])
    const publicEpisode = expanded.toOldJSONExpanded(true).media.episodes[0]
    expect(publicEpisode.id).to.equal(episode.id)
    expect(publicEpisode.videoSource).not.to.have.property('relativePath')
    expect(expanded.media.checkCanDirectPlay(['audio/mp4'], episode.id)).to.equal(false)
  })

  it('includes video in web shelves and counts without changing legacy queries', async () => {
    const queries = require('../../../server/utils/queries/libraryItemsPodcastFilters')
    const user = { id: 'web-test', canAccessExplicitContent: true, permissions: { accessAllTags: true }, mediaProgresses: [] }
    const library = { id: item.libraryId }
    const legacy = await queries.getFilteredPodcastEpisodes(item.libraryId, user, null, null, 'createdAt', true, 10, 0)
    const web = await queries.getFilteredPodcastEpisodes(item.libraryId, user, null, null, 'createdAt', true, 10, 0, false, true)
    expect(legacy.count).to.equal(0)
    expect(web.count).to.equal(1)
    expect(web.libraryItems[0].recentEpisode.duration).to.be.greaterThan(0)
    expect(web.libraryItems[0].recentEpisode.videoSource.watchAvailable).to.equal(true)
    expect((await queries.getRecentEpisodes(user, library, 10, 0)).length).to.equal(0)
    expect((await queries.getRecentEpisodes(user, library, 10, 0, true)).length).to.equal(1)
    const webItems = await queries.getFilteredLibraryItems(item.libraryId, user, null, null, null, false, [], 10, 0, true)
    expect(webItems.libraryItems[0].media.numEpisodes).to.equal(1)
    const legacyAgain = await queries.getFilteredPodcastEpisodes(item.libraryId, user, null, null, 'createdAt', true, 10, 0)
    expect(legacyAgain.count).to.equal(0)
  })

  it('expands video playlists for the web and safely omits them for legacy clients', async () => {
    const user = await Database.userModel.create({ username: 'playlist-test', type: 'user' })
    const playlist = await Database.playlistModel.create({ name: 'Watch later', libraryId: item.libraryId, userId: user.id })
    const episode = await Database.podcastEpisodeModel.unscoped().findOne({ where: { podcastId: item.mediaId } })
    await Database.playlistMediaItemModel.create({ playlistId: playlist.id, mediaItemId: episode.id, mediaItemType: 'podcastEpisode', order: 0 })
    const legacy = await Database.playlistModel.getOldPlaylistsForUserAndLibrary(user.id, item.libraryId)
    const web = await Database.playlistModel.getOldPlaylistsForUserAndLibrary(user.id, item.libraryId, true)
    expect(legacy[0].items).to.deep.equal([])
    expect(web[0].items[0].episode.videoSource.watchAvailable).to.equal(true)
    const stats = await require('../../../server/utils/queries/libraryItemsPodcastFilters').getPodcastLibraryStats(item.libraryId, true)
    expect(stats.numAudioFiles).to.equal(1)
    expect(stats.totalDuration).to.be.greaterThan(0)
    await playlist.destroy()
    await user.destroy()
  })

  it('deduplicates repeated completions and preserves deletion exclusions', async () => {
    const record = await manager.enqueue(manifest)
    const id = record.episodeId
    await manager.importRecord(record)
    expect(record.episodeId).to.equal(id)
    expect(await Database.podcastEpisodeModel.unscoped().count()).to.equal(1)
    await manager.excludeEpisode(id)
    const excluded = await manager.enqueue(manifest)
    expect(excluded.state).to.equal('excluded')
    await fs.access(Path.join(directory, 'episode.mp4'))
    const restored = await manager.enqueue(manifest, true)
    expect(restored.state).to.equal('queued')
    await manager.importRecord(restored)
  })

  it('marks upstream deletion unavailable without deleting progress identity', async () => {
    const record = await manager.enqueue({ ...manifest, kind: 'deleted' })
    const id = record.episodeId
    await manager.importRecord(record)
    const episode = await Database.podcastEpisodeModel.unscoped().findByPk(id)
    expect(episode.videoSource.available).to.equal(false)
    expect(record.state).to.equal('missing')
    await manager.importRecord(await manager.enqueue(manifest))
  })

  it('rejects metadata from a different video without publishing an episode', async () => {
    const record = await manager.enqueue({ ...manifest, videoId: 'wrong-video' })
    try { await manager.importRecord(record); throw new Error('accepted mismatched metadata') } catch (error) { expect(error.message).to.contain('different YouTube video') }
    expect(await Database.podcastEpisodeModel.unscoped().count()).to.equal(1)
  })

  it('keeps progress and same-time bookmarks independent for two episodes', async () => {
    const first = await manager.enqueue(manifest)
    const second = await manager.enqueue({ ...manifest, videoId: 'second-video', metadataPath: null })
    await manager.importRecord(second)
    const user = await Database.userModel.create({ username: 'listener', type: 'user', bookmarks: [], extraData: {}, permissions: {} })
    user.mediaProgresses = []
    for (const [episodeId, currentTime] of [[first.episodeId, 1], [second.episodeId, 2]]) {
      const result = await user.createUpdateMediaProgressFromPayload({ libraryItemId: item.id, episodeId, currentTime, duration: 3 })
      expect(result.error).to.equal(undefined)
      await user.createBookmark(item.id, 1, episodeId, episodeId)
    }
    expect(user.mediaProgresses.map(p => p.currentTime)).to.deep.equal([1, 2])
    expect(user.bookmarks).to.have.length(2)
    await user.removeBookmark(item.id, 1, first.episodeId)
    expect(user.findBookmark(item.id, 1, second.episodeId)).not.to.equal(undefined)
    const invalid = await user.createUpdateMediaProgressFromPayload({ libraryItemId: 'other-podcast', episodeId: first.episodeId, currentTime: 1 })
    expect(invalid.statusCode).to.equal(400)
  })

  it('orders a new completion behind an in-flight import without losing it', async () => {
    const record = await manager.enqueue(manifest)
    let release, started
    const gate = new Promise(resolve => { release = resolve })
    const beginning = new Promise(resolve => { started = resolve })
    const original = manager.processRecord
    manager.processRecord = async function (job) { started(); await gate; return original.call(this, job) }
    try {
      const importing = manager.importRecord(record)
      await beginning
      const enqueue = manager.enqueue({ ...manifest, title: 'New completion' })
      release()
      await importing
      const newer = await enqueue
      expect(newer.state).to.equal('queued')
      expect(newer.manifest.title).to.equal('New completion')
    } finally { manager.processRecord = original; release() }
  })

  it('serves ranged MP4 and audio HLS only for live, revision-bound sessions', async () => {
    const express = require('express')
    const VideoPodcasts = require('../../../server/managers/VideoPodcastManager')
    const PlaybackSessionManager = require('../../../server/managers/PlaybackSessionManager')
    const PublicRouter = require('../../../server/routers/PublicRouter')
    const HlsRouter = require('../../../server/routers/HlsRouter')
    const DeviceInfo = require('../../../server/objects/DeviceInfo')
    const oldConfig = VideoPodcasts.config
    VideoPodcasts.config = manager.config
    const sessions = new PlaybackSessionManager()
    const app = express()
    app.use('/proxy/public', new PublicRouter(sessions).router)
    app.use('/proxy/hls', new HlsRouter(null, sessions).router)
    const http = app.listen(0, '127.0.0.1')
    await new Promise(resolve => http.once('listening', resolve))
    const base = `http://127.0.0.1:${http.address().port}/proxy`
    try {
      const record = await manager.enqueue(manifest)
      await manager.importRecord(record)
      const expanded = await Database.libraryItemModel.getExpandedById(item.id, true)
      const user = { id: 'user', username: 'listener', getMediaProgress: () => null, toJSONForPublic: () => ({}) }
      const watch = await sessions.startSession(user, new DeviceInfo({ id: 'watch-device' }), expanded, record.episodeId, { mode: 'video', startTime: 1 })
      expect(watch.currentTime).to.equal(1)
      expect(watch.audioTracks).to.deep.equal([])
      const response = await fetch(base + watch.playbackMedia.contentUrl, { headers: { Range: 'bytes=0-99' } })
      expect(response.status).to.equal(206)
      expect(response.headers.get('content-type')).to.equal('video/mp4')
      expect((await response.arrayBuffer()).byteLength).to.equal(100)
      const listen = await sessions.startSession(user, new DeviceInfo({ id: 'listen-device' }), expanded, record.episodeId, { mode: 'audio', forceDirectPlay: true })
      expect(listen.playbackMedia.delivery).to.equal('hls')
      const playlist = await fetch(base + listen.playbackMedia.contentUrl)
      expect(playlist.status).to.equal(200)
      expect(await playlist.text()).to.include('#EXT-X-ENDLIST')
      expect((await fetch(`${base}/hls/${listen.id}/output-0.ts`)).status).to.equal(200)
      expect((await fetch(`${base}/hls/${listen.id}/unknown.m3u8`)).status).to.equal(404)
      expect((await fetch(`${base}/public/session/unknown/video`)).status).to.equal(404)
      await sessions.removeSession(watch.id)
      expect((await fetch(base + watch.playbackMedia.contentUrl)).status).to.equal(404)
      // A changed inode/time cannot reuse even already generated audio segments.
      await fs.utimes(Path.join(directory, 'episode.mp4'), new Date(), new Date(Date.now() + 1000))
      expect((await fetch(`${base}/hls/${listen.id}/output-0.ts`)).status).to.equal(409)
      await sessions.removeSession(listen.id)
      expect((await fetch(base + listen.playbackMedia.contentUrl)).status).to.equal(404)
    } finally {
      for (const session of [...sessions.sessions]) await sessions.removeSession(session.id)
      VideoPodcasts.config = oldConfig
      await new Promise(resolve => http.close(resolve))
    }
  })

  it('migrates an existing audio-only database idempotently', async () => {
    const db = new Sequelize('sqlite::memory:', { logging: false })
    try {
      await db.query('CREATE TABLE podcastEpisodes (id TEXT PRIMARY KEY, audioFile JSON)')
      await db.query("INSERT INTO podcastEpisodes VALUES ('audio', '{\"duration\":20}')")
      const options = { context: { queryInterface: db.getQueryInterface() } }
      await up(options)
      await up(options)
      const [rows] = await db.query('SELECT * FROM podcastEpisodes')
      expect(rows[0].id).to.equal('audio')
      expect(rows[0].videoSource).to.equal(null)
      expect(await db.getQueryInterface().tableExists('videoImports')).to.equal(true)
    } finally { await db.close() }
  })

  it('starts after a mapped podcast is removed and keeps remaining mappings', async () => {
    const previousConfig = process.env.VIDEO_PODCAST_CONFIG
    const inbox = await fs.mkdtemp(Path.join(os.tmpdir(), 'abs-inbox-test-'))
    const configPath = Path.join(directory, 'video-podcasts.json')
    const restarted = new VideoPodcastManager()
    try {
      await fs.writeFile(configPath, JSON.stringify({ enabled: true, mediaRoot: directory, inbox, sources: [
        { sourceId: 'removed-source', libraryItemId: 'missing-podcast' },
        ...manager.config.sources
      ] }))
      process.env.VIDEO_PODCAST_CONFIG = configPath
      await restarted.init()
      expect(restarted.config.sources.map(s => s.sourceId)).to.deep.equal(['source'])
    } finally {
      await restarted.stop()
      if (previousConfig === undefined) delete process.env.VIDEO_PODCAST_CONFIG
      else process.env.VIDEO_PODCAST_CONFIG = previousConfig
      await fs.rm(inbox, { recursive: true, force: true })
    }
  })

  it('rejects playback when the source mapping is moved to another podcast', async () => {
    const record = await manager.enqueue(manifest)
    await manager.importRecord(record)
    const episode = await Database.podcastEpisodeModel.unscoped().findByPk(record.episodeId)
    const originalTarget = manager.config.sources[0].libraryItemId
    manager.config.sources[0].libraryItemId = 'removed-target'
    try {
      await manager.validateSource(episode, 'audio')
      throw new Error('accepted disabled target')
    } catch (error) { expect(error.status).to.equal(503) }
    finally { manager.config.sources[0].libraryItemId = originalTarget }
  })

  it('marks failed replacements unavailable instead of advertising stale playback', async () => {
    const record = await manager.enqueue(manifest)
    await manager.importRecord(record)
    await fs.writeFile(Path.join(directory, 'invalid-replacement.mp4'), 'incomplete video')
    const replacement = await manager.enqueue({ ...manifest, relativePath: 'invalid-replacement.mp4' })
    try { await manager.importRecord(replacement); throw new Error('accepted invalid media') }
    catch (error) { expect(error.message).to.include('probe') }
    const episode = await Database.podcastEpisodeModel.unscoped().findByPk(record.episodeId)
    expect(episode.videoSource.available).to.equal(false)
    expect(replacement.state).to.equal('failed')
  })
})
