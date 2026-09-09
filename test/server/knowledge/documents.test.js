const { expect } = require('chai')
const fs = require('fs/promises')
const os = require('os')
const Path = require('path')
const Zip = require('adm-zip')
const documents = require('../../../server/knowledge/documents')
const { rejects } = require('./helpers')
const { run } = require('../../../server/knowledge/process')
const { youtubeURL, sourceValues } = require('../../../server/knowledge/validation')

describe('KnowledgeShelf extraction and input boundaries', function () {
  this.timeout(10000)
  let directory
  before(async () => { directory = await fs.mkdtemp(Path.join(os.tmpdir(), 'knowledge-doc-')) })
  after(async () => fs.rm(directory, { recursive: true, force: true }))
  it('splits complete narration text without dropping or repeating characters', () => {
    const input = ('A complete sentence. Another paragraph with an emoji 🙂.\n\n').repeat(400)
    const chunks = documents.chunks(input)
    expect(chunks.map(c => c.text).join('')).to.equal(input.trim())
    expect(chunks.every(c => c.text.length <= 4000)).to.equal(true)
  })
  it('extracts article prose and removes scripts, navigation and footer text', () => {
    const html = `<title>A useful article</title><nav>Menu</nav><article><h1>A useful article</h1><p>${'Here is the actual document, preserved as written. '.repeat(30)}</p></article><script>secret()</script><footer>Copyright footer</footer>`
    const parsed = documents.htmlText(html)
    expect(parsed.text).to.include('actual document')
    expect(parsed.text).not.to.match(/secret|Menu|Copyright footer/)
    expect(parsed.title).to.equal('A useful article')
  })
  it('reads DOCX paragraphs and table cells in order', async () => {
    const zip = new Zip()
    zip.addFile('word/document.xml', Buffer.from('<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t>reader.</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph.</w:t></w:r></w:p></w:body></w:document>'))
    const path = Path.join(directory, 'sample.docx')
    await fs.writeFile(path, zip.toBuffer())
    expect((await documents.extract(path, 'docx')).text).to.equal('Hello reader.\n\nSecond paragraph.')
  })
  it('extracts PDF embedded text with the real Poppler tool', async () => {
    const stream = 'BT /F1 12 Tf 20 80 Td (Read this complete document.) Tj ET'
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    ]
    let content = '%PDF-1.4\n'
    const offsets = [0]
    objects.forEach((object, index) => { offsets.push(content.length); content += `${index + 1} 0 obj\n${object}\nendobj\n` })
    const xref = content.length
    content += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    const path = Path.join(directory, 'sample.pdf')
    await fs.writeFile(path, content)
    expect(documents.normalize((await documents.extract(path, 'pdf')).text)).to.equal('Read this complete document.')
    expect(() => documents.normalize(' \n ')).to.throw('OCR')
  })
  it('rejects archive expansion bombs and XML entity declarations', async () => {
    const zip = new Zip()
    zip.addFile('word/document.xml', Buffer.from('<!DOCTYPE root [<!ENTITY x "expanded">]><document><body>&x;</body></document>'))
    const path = Path.join(directory, 'entities.docx')
    await fs.writeFile(path, zip.toBuffer())
    await rejects(() => documents.extract(path, 'docx'), 'XML declarations')
    const data = zip.toBuffer()
    const central = data.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    data.writeUInt32LE(60 * 1024 ** 2, central + 24)
    await fs.writeFile(path, data)
    await rejects(() => documents.extract(path, 'docx'), 'Expanded document')
  })
  it('uses EPUB spine order instead of archive order', async () => {
    const zip = new Zip()
    for (const [name, content] of Object.entries({
      'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
      'OPS/book.opf': '<package><manifest><item id="a" href="a.xhtml"/><item id="b" href="b.xhtml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>',
      'OPS/a.xhtml': '<title>Second</title><p>Second chapter.</p>', 'OPS/b.xhtml': '<title>First</title><p>First chapter.</p>'
    })) zip.addFile(name, Buffer.from(content))
    const path = Path.join(directory, 'sample.epub')
    await fs.writeFile(path, zip.toBuffer())
    const extracted = await documents.extract(path, 'epub')
    expect(extracted.text).to.equal('First chapter.\n\nSecond chapter.')
    expect(extracted.sections.map(s => s.title)).to.deep.equal(['First', 'Second'])
  })
  it('rejects private article addresses, credentials and non-web URLs', async () => {
    await rejects(() => documents.fetchArticle('http://127.0.0.1:80'), 'Could not fetch')
    await rejects(() => documents.fetchArticle('http://[::1]'), 'Could not fetch')
    for (const url of ['file:///etc/passwd', 'https://user:pass@example.com', 'http://example.com:1234']) expect(() => documents.publicURL(url)).to.throw()
  })
  it('accepts canonical YouTube inputs and rejects arbitrary download URLs/options', () => {
    expect(youtubeURL('https://youtu.be/abcdefghijk?t=20')).to.equal('https://www.youtube.com/watch?v=abcdefghijk')
    expect(youtubeURL('https://youtube.com/@my-channel/videos')).to.equal('https://www.youtube.com/@my-channel/videos')
    for (const value of ['--exec=evil', 'https://youtube.com.evil/watch?v=abcdefghijk', 'https://youtube.com/redirect?q=http://localhost', 'https://user@youtube.com/watch?v=abcdefghijk', 'http://youtube.com/watch?v=abcdefghijk']) expect(() => youtubeURL(value)).to.throw()
    expect(() => sourceValues({ name: 'Channel', url: 'https://youtube.com/@channel', maxItems: 10000 })).to.throw('Maximum items')
  })
  it('terminates runaway subprocesses and bounds output', async () => {
    await rejects(() => run(process.execPath, ['-e', 'setInterval(()=>{},100)'], { timeout: 30 }), 'timed out')
    await rejects(() => run(process.execPath, ['-e', 'process.stdout.write("x".repeat(20000))'], { maxBytes: 1000 }), 'output limit')
    await rejects(() => run('knowledgeshelf-no-such-tool', []), 'not installed')
  })
})
