const { problem } = require('./errors')
const crypto = require('crypto')

function text(value, name, max = 300, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw problem(`Invalid ${name}`)
  return value.trim()
}
function integer(value, name, fallback, min, max) {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < min || value > max) throw problem(`${name} must be an integer between ${min} and ${max}`)
  return value
}
function youtubeURL(value) {
  let url
  try { url = new URL(value) } catch (_) { throw problem('Enter a YouTube video, channel or playlist URL') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(url.hostname)) throw problem('Only HTTPS YouTube URLs are supported')
  const video = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})$/)?.[1]
  const playlist = url.searchParams.get('list')
  if (playlist && /^[\w-]{10,100}$/.test(playlist)) return `https://www.youtube.com/playlist?list=${playlist}`
  if (video && /^[\w-]{11}$/.test(video)) return `https://www.youtube.com/watch?v=${video}`
  if (/^\/(?:@[\w.%-]+|channel\/[\w-]+|c\/[\w.%-]+|user\/[\w.%-]+)(?:\/(?:videos|shorts|streams))?\/?$/.test(url.pathname)) return `https://www.youtube.com${url.pathname.replace(/\/$/, '')}`
  throw problem('Enter a YouTube video, channel or playlist URL')
}
function sourceValues(body) {
  const mode = body.mode || 'video'
  if (!['audio', 'video'].includes(mode)) throw problem('Mode must be audio or video')
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') throw problem('Enabled must be a boolean')
  if (body.startDate && (!/^\d{4}-\d{2}-\d{2}$/.test(body.startDate) || !Number.isFinite(Date.parse(body.startDate)) || new Date(body.startDate).toISOString().slice(0, 10) !== body.startDate)) throw problem('Invalid start date')
  return { name: text(body.name, 'source name'), url: youtubeURL(body.url), mode,
    enabled: body.enabled ?? true, intervalMinutes: integer(body.intervalMinutes, 'Check interval', 360, 15, 10080),
    retentionDays: integer(body.retentionDays, 'Retention', 0, 0, 3650), maxItems: integer(body.maxItems, 'Maximum items per check', 20, 1, 100), startDate: body.startDate || null }
}
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex') }
module.exports = { text, integer, youtubeURL, sourceValues, hash }
