const crypto = require('crypto')
const { problem } = require('./errors')

// Browser delivery links authorize a single GET path, never the general API.
class WebTickets {
  constructor(secret = crypto.randomBytes(32), now = () => Date.now()) { this.secret = secret; this.now = now }
  allowed(path) {
    return /^\/items\/[\w-]+\/(?:cover|download|ebook(?:\/[\w-]+)?|file\/[\w-]+\/download)$/.test(path) || /^\/authors\/[\w-]+\/image$/.test(path) || /^\/backups\/[\w.-]+\/download$/.test(path)
  }
  issue(userId, path) {
    if (!this.allowed(path)) throw problem('Unsupported browser delivery path')
    const payload = Buffer.from(JSON.stringify({ userId, path, expires: this.now() + (path.includes('/ebook') ? 3600000 : 600000) })).toString('base64url')
    return `${payload}.${crypto.createHmac('sha256', this.secret).update(payload).digest('base64url')}`
  }
  verify(token, path) {
    if (typeof token !== 'string' || token.length > 3000 || !this.allowed(path)) throw problem('Invalid media link', 401)
    const [payload, signature, extra] = token.split('.')
    const expected = crypto.createHmac('sha256', this.secret).update(payload || '').digest('base64url')
    if (extra || typeof signature !== 'string' || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw problem('Invalid media link', 401)
    let data
    try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()) } catch (_) { throw problem('Invalid media link', 401) }
    if (data.path !== path || !Number.isFinite(data.expires) || data.expires <= this.now()) throw problem('Media link expired', 401)
    return data.userId
  }
}
module.exports = new WebTickets()
module.exports.WebTickets = WebTickets
