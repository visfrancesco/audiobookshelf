const Path = require('path')
const fs = require('fs/promises')
const crypto = require('crypto')

function playbackError(message, status = 422) {
  return Object.assign(new Error(message), { status })
}

async function containedFile(root, relativePath) {
  if (typeof relativePath !== 'string' || Path.isAbsolute(relativePath)) throw playbackError('Expected a relative media path', 400)
  const realRoot = await fs.realpath(root)
  const path = await fs.realpath(Path.resolve(realRoot, relativePath))
  const relative = Path.relative(realRoot, path)
  if (!relative || relative.startsWith('..' + Path.sep) || relative === '..' || Path.isAbsolute(relative)) throw playbackError('Media path is outside the configured root', 400)
  const stat = await fs.stat(path)
  if (!stat.isFile()) throw playbackError('Media is not a regular file', 400)
  return { path, stat }
}

function revisionFor(stat) {
  return crypto.createHash('sha256').update(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`).digest('hex')
}

function normalizeChapters(chapters, duration) {
  return (chapters || []).map((chapter, index) => ({
    id: index, title: chapter.tags?.title || chapter.title || `Chapter ${index + 1}`,
    start: Number(chapter.start_time ?? chapter.start), end: Number(chapter.end_time ?? chapter.end)
  })).filter(ch => Number.isFinite(ch.start) && ch.start >= 0 && ch.start < duration)
    .sort((a, b) => a.start - b.start)
    .filter((ch, i, all) => !i || ch.start !== all[i - 1].start)
    .map((ch, i, all) => ({ ...ch, id: i, end: Math.min(duration, all[i + 1]?.start ?? duration,
      Number.isFinite(ch.end) && ch.end > ch.start ? ch.end : duration) }))
}

function describeVideo(raw) {
  if (raw.error) throw playbackError('Unable to probe the completed media')
  const video = raw.streams?.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic)
  const audioStreams = raw.streams?.filter(s => s.codec_type === 'audio') || []
  const audio = audioStreams.find(s => s.disposition?.default) || audioStreams[0]
  const duration = Number(raw.format?.duration)
  if (!video || !audio || !Number.isFinite(duration) || duration <= 0) throw playbackError('A video podcast needs moving video, audio, and a valid duration')
  const watchAvailable = !!(raw.format?.format_name?.split(',').includes('mp4') && video.codec_name === 'h264' &&
    ['yuv420p', 'yuvj420p'].includes(video.pix_fmt) && audio.codec_name === 'aac')
  return {
    duration, container: raw.format.format_name, audioIndex: audio.index, audioCodec: audio.codec_name, videoCodec: video.codec_name,
    audioBitRate: Number(audio.bit_rate) || 0, width: video.width, height: video.height,
    watchAvailable, watchReason: watchAvailable ? null : 'Watch requires MP4 with 8-bit H.264 4:2:0 video and AAC audio. Change the source download profile.',
    chapters: normalizeChapters(raw.chapters, duration)
  }
}

function publicVideoSource(source) {
  if (!source) return undefined
  const { duration, size, revision, available, watchAvailable, watchReason, width, height, audioCodec, videoCodec, previousRevision } = source
  return { duration, size, revision, available, watchAvailable: available !== false && watchAvailable,
    watchReason: available === false ? 'The original file is unavailable.' : watchReason,
    width, height, audioCodec, videoCodec, previousRevision }
}

module.exports = { playbackError, containedFile, revisionFor, normalizeChapters, describeVideo, publicVideoSource }
