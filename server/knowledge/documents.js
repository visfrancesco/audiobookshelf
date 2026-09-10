const fs = require('fs/promises')
const Path = require('path')
const axios = require('axios')
const ssrf = require('ssrf-req-filter')
const { JSDOM } = require('jsdom')
const { Readability } = require('@mozilla/readability')
const Zip = require('adm-zip')
const { parseStringPromise } = require('xml2js')
const { run } = require('./process')
const { problem } = require('./errors')
const { hash } = require('./validation')

const MAX_FILE = 20 * 1024 ** 2
const MAX_TEXT = 1000000
const MAX_HTML = 2 * 1024 ** 2
const articleClient = axios.create({ proxy: false })
function normalize(text) {
  if (typeof text !== 'string') throw problem('Document text is required')
  const clean = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim()
  if (!clean) throw problem('No readable text was found. Scanned PDFs need OCR before upload.', 422, 'empty_document')
  if (clean.length > MAX_TEXT) throw problem('Document exceeds one million characters', 413)
  return clean
}
function preview(text, title) {
  text = normalize(text)
  return { text, title, contentHash: hash(text), sections: [{ title: title || 'Document', start: 0, end: text.length }], characters: text.length }
}
function htmlText(html, url = 'https://document.invalid/', article = true) {
  if (Buffer.byteLength(html) > MAX_HTML) throw problem('HTML exceeds the 2 MiB extraction limit', 413)
  const dom = new JSDOM(html, { url }) // No scripts or external resources are enabled.
  try {
    const doc = dom.window.document
    doc.querySelectorAll('script,style,nav,header,footer,form,aside,noscript').forEach(el => el.remove())
    let title = doc.title
    let body = doc.body
    if (article) {
      const parsed = new Readability(doc.cloneNode(true), { maxElemsToParse: 50000 }).parse()
      if (parsed) { body.innerHTML = parsed.content; title = parsed.title || title }
    }
    body.querySelectorAll('p,div,section,article,li,h1,h2,h3,h4,h5,h6,br,tr').forEach(el => el.append('\n\n'))
    return { text: body.textContent.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n'), title }
  } finally { dom.window.close() }
}
function publicURL(value) {
  let url
  try { url = new URL(value) } catch (_) { throw problem('Invalid article URL') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw problem('Use a public HTTP or HTTPS article URL')
  return url
}
async function fetchArticle(value, signal) {
  let url = publicURL(value)
  for (let redirects = 0; redirects <= 3; redirects++) {
    const agent = ssrf(url.href)
    let response
    try {
      response = await articleClient.get(url.href, { signal, timeout: 20000, maxRedirects: 0, proxy: false,
        [url.protocol === 'https:' ? 'httpsAgent' : 'httpAgent']: agent,
        responseType: 'text', maxContentLength: MAX_HTML, validateStatus: () => true,
        headers: { Accept: 'text/html,text/plain', 'User-Agent': 'KnowledgeShelf/1.0' } })
    } catch (_) { throw problem('Could not fetch this public article URL', 422, 'article_fetch_failed') } finally { agent.destroy() }
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
      url = publicURL(new URL(response.headers.location, url).href)
      continue
    }
    if (response.status !== 200) throw problem(`Article server returned HTTP ${response.status}`, 422)
    const mime = response.headers['content-type'] || ''
    if (!/^(text\/html|application\/xhtml\+xml|text\/plain)(;|$)/i.test(mime)) throw problem('Article URL must return HTML or plain text', 422)
    return { ...(/text\/plain/i.test(mime) ? { text: response.data } : htmlText(response.data, url.href)), sourceUrl: url.href }
  }
  throw problem('Article redirects too many times', 422)
}
async function xml(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw problem('Document XML declarations are not supported', 422)
  return parseStringPromise(text, { explicitArray: false, tagNameProcessors: [name => name.split(':').pop()] })
}
const array = value => value === undefined ? [] : Array.isArray(value) ? value : [value]
function archive(buffer) {
  const zip = new Zip(buffer)
  const entries = zip.getEntries()
  if (entries.length > 2000 || entries.reduce((size, entry) => size + entry.header.size, 0) > 50 * 1024 ** 2) throw problem('Expanded document exceeds its size limit', 413)
  return name => {
    const entry = zip.getEntry(name)
    if (!entry || entry.isDirectory) throw problem('Document archive is incomplete', 422)
    return entry.getData().toString('utf8')
  }
}
async function extract(path, format, signal) {
  const stat = await fs.stat(path)
  if (stat.size > MAX_FILE) throw problem('Maximum upload size is 20 MiB', 413)
  if (format === 'pdf') return { text: (await run('pdftotext', ['-enc', 'UTF-8', '-nopgbrk', path, '-'], { signal, maxBytes: 8 * 1024 ** 2 })).stdout }
  const data = await fs.readFile(path)
  if (format === 'txt' || format === 'md') return { text: data.toString('utf8') }
  if (format === 'html' || format === 'htm') return htmlText(data.toString('utf8'))
  const read = archive(data)
  if (format === 'docx') {
    const doc = await xml(read('word/document.xml'))
    const collect = node => {
      if (typeof node === 'string') return ''
      if (!node || typeof node !== 'object') return ''
      return Object.entries(node).map(([key, value]) => {
        if (key === 't') return array(value).map(t => typeof t === 'string' ? t : t._ || '').join('')
        if (key === 'tab') return '\t'
        if (key === 'br') return '\n'
        return array(value).map(collect).join(key === 'p' ? '\n\n' : '')
      }).join('')
    }
    return { text: collect(doc.document.body) }
  }
  if (format === 'epub') {
    const container = await xml(read('META-INF/container.xml'))
    const packagePath = array(container.container.rootfiles.rootfile)[0].$['full-path']
    const pkg = (await xml(read(packagePath))).package
    const items = new Map(array(pkg.manifest.item).map(item => [item.$.id, item.$.href]))
    const sections = []
    let text = ''
    for (const item of array(pkg.spine.itemref)) {
      if (item.$.linear === 'no') continue
      const href = items.get(item.$.idref)
      if (!href) throw problem('Invalid EPUB reading order', 422)
      const parsed = htmlText(read(Path.posix.normalize(Path.posix.join(Path.posix.dirname(packagePath), decodeURIComponent(href.split('#')[0])))), undefined, false)
      const content = parsed.text.trim()
      if (content) {
        const start = text.length
        text += content + '\n\n'
        sections.push({ title: parsed.title || `Chapter ${sections.length + 1}`, start, end: start + content.length })
      }
    }
    return { text: text.trim(), sections }
  }
  throw problem('Supported formats: TXT, Markdown, HTML, PDF, EPUB and DOCX', 415)
}
function chunks(text, sections = [], limit = 4000) {
  text = normalize(text)
  const result = []
  let offset = 0
  while (offset < text.length) {
    let end = Math.min(offset + limit, text.length)
    if (end < text.length) {
      const part = text.slice(offset, end)
      const boundary = Math.max(part.lastIndexOf('\n\n'), part.lastIndexOf('. '), part.lastIndexOf('? '), part.lastIndexOf('! '))
      if (boundary > limit / 2) end = offset + boundary + (part[boundary] === '\n' ? 2 : 1)
      else { const space = part.lastIndexOf(' '); if (space > limit / 2) end = offset + space + 1 }
      // Do not split a UTF-16 surrogate pair.
      if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--
    }
    result.push({ text: text.slice(offset, end), start: offset, title: sections.find(s => offset >= s.start && offset < s.end)?.title || `Part ${result.length + 1}` })
    offset = end
  }
  return result
}
module.exports = { MAX_FILE, MAX_TEXT, normalize, preview, htmlText, publicURL, fetchArticle, extract, chunks }
