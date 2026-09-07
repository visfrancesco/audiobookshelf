const EventEmitter = require('events')
const Path = require('path')
const fs = require('fs/promises')
const { spawn } = require('child_process')
const Logger = require('../Logger')
const AudioTrack = require('./files/AudioTrack')
const generatePlaylist = require('../utils/generators/hlsPlaylistGenerator')
const { playbackError } = require('../utils/videoPodcastUtils')

// On-demand audio segments use absolute presentation timestamps. A native HLS
// player can seek to any segment without resetting a browser/socket state machine.
class VideoAudioStream extends EventEmitter {
  constructor(sessionId, streamsPath, episode, mediaPath, budget) {
    super()
    this.id = sessionId
    this.episode = episode
    this.mediaPath = mediaPath
    this.budget = budget
    this.streamPath = Path.join(streamsPath, sessionId)
    this.clientPlaylistUri = `/hls/${sessionId}/output.m3u8`
    this.pending = new Map()
    this.children = new Set()
    this.closed = false
    this.bytes = 0
    this.lastAccess = Date.now()
  }

  async generatePlaylist() {
    await fs.mkdir(this.streamPath, { recursive: true })
    await generatePlaylist(Path.join(this.streamPath, 'output.m3u8'), 'output', this.episode.duration, 6, 'mpegts')
  }

  start() {} // Segments are prepared only when requested.

  getAudioTrack() {
    const track = new AudioTrack()
    track.setFromStream(this.episode.title, this.episode.duration, this.clientPlaylistUri)
    return track
  }

  async ensureSegment(filename) {
    this.lastAccess = Date.now()
    const match = /^output-(0|[1-9]\d*)\.ts$/.exec(filename)
    if (!match || Number(match[1]) >= Math.ceil(this.episode.duration / 6)) throw playbackError('Unknown audio segment', 404)
    if (this.closed) throw playbackError('Playback session closed', 410)
    const output = Path.join(this.streamPath, filename)
    try { await fs.access(output); return output } catch (_) {}
    if (!this.pending.has(filename)) {
      const job = this.generateSegment(Number(match[1]), output).finally(() => this.pending.delete(filename))
      this.pending.set(filename, job)
    }
    await this.pending.get(filename)
    return output
  }

  async generateSegment(number, output) {
    const release = await this.budget.acquire(() => this.closed)
    const temporary = output + '.partial'
    try {
      if (this.closed) throw playbackError('Playback session closed', 410)
      const source = this.episode.videoSource
      const start = number * 6
      const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(start), '-i', this.mediaPath,
        '-ss', '0', '-t', String(Math.min(6, source.duration - start)), '-map', `0:${source.audioIndex}`, '-vn', '-sn', '-dn']
      const copy = source.audioCodec === 'aac' && source.audioBitRate <= 320000
      args.push('-c:a', copy ? 'copy' : 'aac')
      if (!copy) args.push('-b:a', '160k', '-ac', '2', '-threads', '2')
      args.push('-mpegts_copyts', '1', '-output_ts_offset', String(start), '-muxdelay', '0', '-muxpreload', '0', '-f', 'mpegts', temporary)
      await new Promise((resolve, reject) => {
        const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
        this.children.add(child)
        let stderr = ''
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000) })
        const timeout = setTimeout(() => child.kill('SIGKILL'), 30000)
        child.once('error', reject)
        child.once('close', code => {
          clearTimeout(timeout)
          this.children.delete(child)
          if (this.closed) reject(playbackError('Playback session closed', 410))
          else if (code !== 0) {
            Logger.warn(`[VideoPodcasts] Audio preparation for session ${this.id}: ${stderr}`)
            reject(playbackError('Audio preparation failed. Retry playback or ask the server administrator to check the logs.', 503))
          }
          else resolve()
        })
      })
      const size = (await fs.stat(temporary)).size
      if (this.closed) throw playbackError('Playback session closed', 410)
      this.budget.add(size)
      this.bytes += size
      await fs.rename(temporary, output)
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {})
      release()
    }
  }

  async close() {
    if (this.closed) return
    this.closed = true
    for (const child of this.children) child.kill('SIGKILL')
    await Promise.allSettled([...this.pending.values()])
    await fs.rm(this.streamPath, { recursive: true, force: true })
    this.budget.bytes = Math.max(0, this.budget.bytes - this.bytes)
    this.emit('closed')
  }

  toJSON() { return { id: this.id, clientPlaylistUri: this.clientPlaylistUri } }
}

class AudioStreamBudget {
  constructor(concurrency = 2, maxBytes = 4 * 1024 ** 3) {
    this.concurrency = concurrency
    this.maxBytes = maxBytes
    this.active = 0
    this.bytes = 0
  }
  async acquire(cancelled) {
    const deadline = Date.now() + 30000
    while (this.active >= this.concurrency) {
      if (cancelled() || Date.now() > deadline) throw playbackError('Audio preparation cancelled or busy; retry playback', 503)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    if (cancelled() || this.bytes >= this.maxBytes) throw playbackError('Audio stream storage is full or session closed', 503)
    this.active++
    return () => { this.active-- }
  }
  add(bytes) {
    if (this.bytes + bytes > this.maxBytes) throw playbackError('Audio stream storage limit reached', 503)
    this.bytes += bytes
  }
}

module.exports = { VideoAudioStream, AudioStreamBudget }
