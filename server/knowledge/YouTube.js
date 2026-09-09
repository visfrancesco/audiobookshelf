const Path = require('path')
const fs = require('fs/promises')
const os = require('os')
const { run } = require('./process')
const { youtubeURL } = require('./validation')
const { problem } = require('./errors')
const { containedFile } = require('../utils/videoPodcastUtils')

class YouTube {
  constructor({ execute = run, binary = process.env.YTDLP_PATH || 'yt-dlp', cookiesFile = process.env.YTDLP_COOKIES_FILE } = {}) { this.execute = execute; this.binary = binary; this.cookiesFile = cookiesFile }
  base() { return ['--ignore-config', '--no-cache-dir', '--no-colors', '--socket-timeout', '30', '--retries', '3', '--fragment-retries', '3', '--js-runtimes', 'node', '--no-remote-components',
    ...(Path.isAbsolute(process.env.FFMPEG_PATH || '') ? ['--ffmpeg-location', Path.dirname(process.env.FFMPEG_PATH)] : [])] }
  async invoke(args, options) {
    let temporary
    try {
      if (this.cookiesFile) {
        if (!Path.isAbsolute(this.cookiesFile)) throw problem('YTDLP_COOKIES_FILE must be an absolute path', 503)
        const stat = await fs.stat(this.cookiesFile)
        if (!stat.isFile() || stat.size > 1024 ** 2) throw problem('YouTube cookie file is invalid or too large', 503)
        temporary = await fs.mkdtemp(Path.join(os.tmpdir(), 'knowledgeshelf-cookies-'))
        const cookiePath = Path.join(temporary, 'cookies.txt')
        await fs.writeFile(cookiePath, await fs.readFile(this.cookiesFile), { mode: 0o600 })
        args = ['--cookies', cookiePath, ...args]
      }
      return await this.execute(this.binary, args, options)
    } catch (error) {
      if (/not a bot|[Ss]ign in to/i.test(error.message)) throw problem('YouTube requires authentication for this download. Configure a Netscape cookie file with YTDLP_COOKIES_FILE on the server.', 502, 'youtube_auth_required')
      if (this.cookiesFile && error.code === 'process_failed') throw problem('YouTube download failed. Check the cookie file, video availability and source settings.', 502, 'youtube_download_failed')
      throw error
    } finally { if (temporary) await fs.rm(temporary, { recursive: true, force: true }) }
  }
  async list(source, signal) {
    const { stdout } = await this.invoke([...this.base(), '--flat-playlist', '--dump-single-json', '--playlist-end', String(source.maxItems), '--', youtubeURL(source.url)], { signal, timeout: 120000, maxBytes: 16 * 1024 ** 2 })
    const info = JSON.parse(stdout)
    return (info.entries || [info]).filter(entry => entry && /^[\w-]{11}$/.test(entry.id) && !['is_live', 'is_upcoming'].includes(entry.live_status))
      .filter(entry => !source.startDate || !entry.upload_date || entry.upload_date >= source.startDate.replace(/-/g, '')).slice(0, source.maxItems)
      .map(entry => ({ id: entry.id, title: entry.title || entry.id }))
  }
  async download(source, videoId, directory, signal) {
    if (!/^[\w-]{11}$/.test(videoId)) throw problem('Invalid YouTube video ID')
    await fs.mkdir(directory, { recursive: true })
    const args = [...this.base(), '--no-playlist', '--no-progress', '--no-overwrites', '--write-info-json', '--write-thumbnail', '--convert-thumbnails', 'jpg', '--embed-chapters',
      '--max-filesize', '4G', '--match-filters', 'duration <= 43200 & !is_live', '--paths', directory, '--output', 'media.%(ext)s', '--print', 'after_move:%(filepath)j']
    if (source.startDate) args.push('--dateafter', source.startDate.replace(/-/g, ''))
    if (source.mode === 'audio') args.push('--format', 'bestaudio/best', '--extract-audio', '--audio-format', 'm4a')
    else args.push('--format', 'bv*[ext=mp4][vcodec^=avc1][height<=1080]+ba[ext=m4a]/b[ext=mp4][vcodec^=avc1]/bv*[height<=1080]+ba/b', '--merge-output-format', 'mp4')
    const { stdout } = await this.invoke([...args, '--', `https://www.youtube.com/watch?v=${videoId}`], { signal, timeout: 4 * 3600000 })
    const lines = stdout.trim().split('\n').filter(Boolean)
    if (!lines.length) return null // Date/duration filters intentionally skipped this video.
    const mediaPath = JSON.parse(lines[lines.length - 1])
    const file = await containedFile(directory, Path.relative(directory, mediaPath))
    if (file.stat.size > 4 * 1024 ** 3) throw problem('Downloaded media exceeds 4 GiB', 413)
    const info = await containedFile(directory, 'media.info.json')
    if (info.stat.size > 16 * 1024 ** 2) throw problem('YouTube metadata exceeds its size limit', 413)
    const metadata = JSON.parse(await fs.readFile(info.path, 'utf8'))
    if (metadata.id !== videoId) throw problem('Downloaded metadata belongs to another video')
    const selected = { id: metadata.id, title: String(metadata.title || videoId).slice(0, 1000), description: String(metadata.description || '').slice(0, 256000),
      upload_date: metadata.upload_date, uploader: metadata.uploader, chapters: metadata.chapters || [] }
    return { path: file.path, metadata: selected, thumbnail: await fs.stat(Path.join(directory, 'media.jpg')).then(() => Path.join(directory, 'media.jpg')).catch(() => null) }
  }
}
module.exports = YouTube
