const axios = require('axios')
const { problem, checkAbort } = require('./errors')

class ElevenLabs {
  constructor({ key = process.env.ELEVENLABS_API_KEY, request = axios.request } = {}) { this.key = key; this.request = request }
  get configured() { return !!this.key }
  async voices(signal) {
    if (!this.configured) throw problem('Set ELEVENLABS_API_KEY on the server to enable narration', 503, 'speech_not_configured')
    if (this.cached && this.cached.expires > Date.now()) return this.cached.voices
    let response
    try { response = await this.request({ method: 'GET', url: 'https://api.elevenlabs.io/v1/voices', headers: { 'xi-api-key': this.key }, signal, timeout: 20000, maxRedirects: 0, maxContentLength: 4 * 1024 ** 2 }) }
    catch (_) { throw problem('Could not load ElevenLabs voices. Check the server API key and provider availability.', 502, 'voices_unavailable') }
    const voices = (response.data.voices || []).map(v => ({ id: v.voice_id, name: v.name, labels: v.labels || {} }))
    this.cached = { voices, expires: Date.now() + 3600000 }
    return voices
  }
  async speak(text, settings, { signal, previousText, nextText } = {}) {
    if (!this.configured) throw problem('ElevenLabs is not configured', 503, 'speech_not_configured')
    checkAbort(signal)
    try {
      const response = await this.request({ method: 'POST', url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(settings.voiceId)}`,
        params: { output_format: 'mp3_44100_128' }, headers: { 'xi-api-key': this.key, Accept: 'audio/mpeg', 'Content-Type': 'application/json' },
        data: { text, model_id: settings.modelId, previous_text: previousText?.slice(-1000), next_text: nextText?.slice(0, 1000), voice_settings: settings.voiceSettings },
        signal, timeout: 180000, maxRedirects: 0, responseType: 'arraybuffer', maxContentLength: 32 * 1024 ** 2 })
      if (!/^audio\//i.test(response.headers['content-type'] || '') || !response.data?.byteLength) throw new Error('Unexpected speech response')
      return Buffer.from(response.data)
    } catch (error) {
      const status = error.response?.status
      if ([400, 401, 403, 404, 422, 429].includes(status)) {
        const failure = problem(status === 429 ? 'ElevenLabs rate or quota limit reached' : `ElevenLabs rejected the request (HTTP ${status}). Check voice, model and account settings.`, 502, 'speech_rejected')
        failure.retryable = status === 429
        throw failure
      }
      throw problem('Speech request interrupted or failed after sending. Check ElevenLabs usage before retrying; this request may already have been charged.', 502, 'speech_request_uncertain')
    }
  }
}
module.exports = ElevenLabs
