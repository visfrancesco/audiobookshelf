const { expect } = require('chai')
const fs = require('fs')
const vm = require('vm')
const Path = require('path')

function loadClientClass(name, globals = {}) {
  const source = fs.readFileSync(Path.join(__dirname, '../../client/players', name + '.js'), 'utf8')
    .replace(/^import .*$/gm, '').replace('export default class', 'class')
  return vm.runInNewContext(source + '\n' + name, { console, setInterval, clearInterval, ...globals })
}

describe('Web video playback sessions', () => {
  const AudioTrack = loadClientClass('AudioTrack')
  const Handler = loadClientClass('PlayerHandler', { AudioTrack, LocalAudioPlayer: class {}, CastPlayer: class {} })
  let handler, calls, context, loads
  beforeEach(() => {
    calls = []; loads = []
    context = {
      $store: { state: { globals: { isCasting: false } }, commit() {} },
      $config: { routerBasePath: '/abs' }, $constants: { PlayMethod: { DIRECTPLAY: 0 } },
      $strings: { MessageVideoPlaybackFailed: 'Failed' }, $toast: { error(message) { calls.push(['error', message]) } },
      $axios: { async $post(path, body) { calls.push([path, body]); return { id: 'new', currentTime: 12, duration: 100, playMethod: 0, media: { mode: 'video', contentUrl: '/public/session/new/video' }, audioTracks: [] } } },
      async $nextTick() {}, setMediaSession() {}, playerLoading: false
    }
    handler = new Handler(context)
    handler.getDeviceId = () => 'device'
    handler.libraryItem = { id: 'item', media: { episodes: [{ id: 'episode', duration: 100, videoSource: { watchAvailable: true } }] } }
    handler.episodeId = 'episode'
    handler.player = { getCurrentTime: () => 61, pause() {}, playableMimeTypes: [], set(...args) { loads.push(args) } }
  })

  it('uses the explicit video URL with a router base and an empty audio track list', () => {
    handler.playbackMode = 'video'
    handler.prepareSession({ id: 'new', currentTime: 12, duration: 100, playMethod: 0, media: { mode: 'video', contentUrl: '/public/session/new/video' }, audioTracks: [] })
    expect(loads[0][1][0].relativeContentUrl).to.equal('/abs/public/session/new/video')
    expect(loads[0][1][0].duration).to.equal(100)
    expect(loads[0][5]).to.equal('video')
  })

  it('switches modes at the current position and preserves paused state and rate', async () => {
    handler.currentSessionId = 'old'
    handler.initialPlaybackRate = 1.5
    await handler.switchPlaybackMode('video')
    expect(calls[0][0]).to.equal('/api/session/old/close')
    expect(calls[1][1]).to.include({ mode: 'video', startTime: 61 })
    expect(loads[0][3]).to.equal(61)
    expect(loads[0][4]).to.equal(false)
    expect(handler.initialPlaybackRate).to.equal(1.5)
  })

  it('honors a sleep-timer pause while a mode change is loading', async () => {
    let finish
    let requested
    const started = new Promise(resolve => { requested = resolve })
    context.$axios.$post = () => new Promise(resolve => { finish = resolve; requested() })
    handler.playerState = 'PLAYING'
    const pending = handler.switchPlaybackMode('video')
    await started
    handler.pause()
    finish({ id: 'new', currentTime: 61, duration: 100, playMethod: 0, media: { mode: 'video', contentUrl: '/public/session/new/video' }, audioTracks: [] })
    await pending
    expect(loads[0][4]).to.equal(false)
  })

  it('does not recreate sessions indefinitely on failed video playback', () => {
    handler.pause = () => {}
    handler.playerError()
    expect(calls).to.deep.equal([['error', 'Failed']])
  })

  it('closes a late session when the player was dismissed during its request', async () => {
    let finish
    context.$axios.$post = (path) => {
      calls.push([path])
      if (path.includes('/play/')) return new Promise(resolve => { finish = resolve })
      return Promise.resolve()
    }
    const pending = handler.prepare()
    handler.prepareGeneration++
    finish({ id: 'late' })
    await pending
    expect(calls[1][0]).to.equal('/api/session/late/close')
    expect(loads).to.have.length(0)
  })
})
