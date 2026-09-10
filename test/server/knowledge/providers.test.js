const { expect } = require('chai')
const ElevenLabs = require('../../../server/knowledge/ElevenLabs')
const YouTube = require('../../../server/knowledge/YouTube')
const { rejects } = require('./helpers')

describe('KnowledgeShelf provider contracts', () => {
  it('discovers episodes inside channel tabs and caps the combined result', async () => {
    const info = { entries: [
      { _type: 'playlist', id: 'channel-id', entries: [null, { id: 'livevideo01', live_status: 'is_live' }, { id: 'abcdefghijk', title: 'First episode' }] },
      { _type: 'playlist', id: 'channel-id', entries: [{ id: 'lmnopqrstuv', title: 'Second episode' }, { id: '12345678901' }] }
    ] }
    const provider = new YouTube({ execute: async () => ({ stdout: JSON.stringify(info) }) })
    expect(await provider.list({ url: 'https://youtube.com/@channel', maxItems: 2 })).to.deep.equal([
      { id: 'abcdefghijk', title: 'First episode' }, { id: 'lmnopqrstuv', title: 'Second episode' }
    ])
  })
  it('caps every video format alternative and avoids unwatchable codec fallbacks', async () => {
    const fs = require('fs/promises'), Path = require('path'), os = require('os')
    const directory = await fs.mkdtemp(Path.join(os.tmpdir(), 'quality-test-'))
    try {
      for (const quality of [360, 480, 720, 1080, 1440, 2160]) {
        let args
        const provider = new YouTube({ execute: async (_, values) => { args = values; return { stdout: '' } } })
        await provider.download({ mode: 'video', options: { videoQuality: quality } }, 'abcdefghijk', directory)
        const alternatives = args[args.indexOf('--format') + 1].split('/')
        expect(alternatives).to.have.length(2)
        for (const format of alternatives) {
          expect(format).to.include(`[height<=${quality}]`)
          expect(format).to.include('[vcodec^=avc1]')
        }
      }
    } finally { await fs.rm(directory, { recursive: true, force: true }) }
  })
  it('defaults old sources to 1080p and rejects unsupported quality settings', () => {
    const { sourceValues } = require('../../../server/knowledge/validation')
    const source = { name: 'Source', url: 'https://youtube.com/@channel' }
    expect(sourceValues(source).options.videoQuality).to.equal(1080)
    expect(sourceValues({ ...source, videoQuality: 480 }).options.videoQuality).to.equal(480)
    for (const quality of [0, 800, 4320, '720', 'best']) {
      expect(() => sourceValues({ ...source, videoQuality: quality })).to.throw('video quality')
    }
  })
  it('sends full text and bounded continuity context to ElevenLabs', async () => {
    let request
    const provider = new ElevenLabs({ key: 'secret-key', request: async options => { request = options; return { data: Buffer.from('audio'), headers: { 'content-type': 'audio/mpeg' } } } })
    const result = await provider.speak('Read every word.', { voiceId: 'voice', modelId: 'eleven_multilingual_v2' }, { previousText: 'p'.repeat(3000), nextText: 'n'.repeat(3000) })
    expect(result.toString()).to.equal('audio')
    expect(request.data.text).to.equal('Read every word.')
    expect(request.data.previous_text).to.have.length(1000)
    expect(request.data.next_text).to.have.length(1000)
    expect(request.headers['xi-api-key']).to.equal('secret-key')
    expect(request.maxRedirects).to.equal(0)
  })
  it('classifies explicit rejection separately from potentially charged failures without leaking secrets', async () => {
    for (const status of [401, 429, 500, undefined]) {
      const provider = new ElevenLabs({ key: 'secret-key', request: async () => { throw Object.assign(new Error('secret-key in raw request'), { response: status ? { status } : undefined }) } })
      const error = await rejects(() => provider.speak('Document.', { voiceId: 'voice' }))
      expect(error.message).not.to.include('secret-key')
      expect(error.code).to.equal([401, 429].includes(status) ? 'speech_rejected' : 'speech_request_uncertain')
      expect(!!error.retryable).to.equal(status === 429)
    }
  })
  it('caches a minimal voice list without returning provider account details', async () => {
    let calls = 0
    const provider = new ElevenLabs({ key: 'secret', request: async () => { calls++; return { data: { voices: [{ voice_id: 'a', name: 'Voice', labels: { language: 'en' }, sharing: { private: true } }] } } } })
    expect(await provider.voices()).to.deep.equal([{ id: 'a', name: 'Voice', labels: { language: 'en' } }])
    await provider.voices()
    expect(calls).to.equal(1)
  })
  it('bounds source discovery, excludes live entries and avoids shell/config execution', async () => {
    let args
    const provider = new YouTube({ execute: async (_, values) => { args = values; return { stdout: JSON.stringify({ entries: [{ id: 'abcdefghijk' }, { id: 'livevideo01', live_status: 'is_live' }, { id: 'invalid' }] }) } } })
    const entries = await provider.list({ url: 'https://youtube.com/@channel', maxItems: 20 })
    expect(entries.map(entry => entry.id)).to.deep.equal(['abcdefghijk'])
    expect(args).to.include('--ignore-config')
    expect(args).to.include('--flat-playlist')
    expect(args[args.indexOf('--playlist-end') + 1]).to.equal('20')
    expect(args.slice(-2)).to.deep.equal(['--', 'https://www.youtube.com/@channel'])
  })
  it('uses a private disposable cookie copy and never leaks cookie values on failure', async () => {
    const fs = require('fs/promises'), Path = require('path'), os = require('os')
    const directory = await fs.mkdtemp(Path.join(os.tmpdir(), 'knowledge-cookie-test-'))
    const original = Path.join(directory, 'cookies.txt')
    const secret = '# Netscape HTTP Cookie File\nsecret-cookie-value'
    await fs.writeFile(original, secret, { mode: 0o400 })
    let copy
    const provider = new YouTube({ cookiesFile: original, execute: async (_, args) => {
      copy = args[args.indexOf('--cookies') + 1]
      expect(copy).not.to.equal(original)
      expect((await fs.stat(copy)).mode & 0o777).to.equal(0o600)
      throw Object.assign(new Error(`Malformed cookies: ${secret}`), { code: 'process_failed' })
    } })
    try {
      const error = await rejects(() => provider.list({ url: 'https://youtube.com/@channel', maxItems: 1 }))
      expect(error.message).not.to.include('secret-cookie-value')
      expect(await fs.readFile(original, 'utf8')).to.equal(secret)
      await rejects(() => fs.access(copy))
    } finally { await fs.rm(directory, { recursive: true, force: true }) }
  })
})
