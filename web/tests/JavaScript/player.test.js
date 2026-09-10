import test from 'node:test'
import assert from 'node:assert/strict'
import { clock, trackAt, clampTime } from '../../resources/js/player-time.js'
import { ShelfPlayer } from '../../resources/js/player.js'

test('long audiobooks keep hours beyond one day', () => {
    assert.equal(clock(90061.7), '25:01:01')
    assert.equal(clock(75), '1:15')
    assert.equal(clock(-1), '0:00')
})

test('seeking across track boundaries selects the correct source', () => {
    const tracks = [{ startOffset: 0 }, { startOffset: 60 }, { startOffset: 120 }]
    assert.equal(trackAt(tracks, 59.99), 0)
    assert.equal(trackAt(tracks, 60), 1)
    assert.equal(trackAt(tracks, 150), 2)
    assert.equal(clampTime(180, 150), 150)
    assert.equal(clampTime(-30, 150), 0)
})

test('switching to video sends the shared position and preserves a paused player', async () => {
    const calls = []
    const previousDocument = globalThis.document
    const previousFetch = globalThis.fetch
    globalThis.document = { body: { dataset: {}, classList: { add() {} } }, querySelector: () => ({ content: 'csrf' }) }
    globalThis.fetch = async (_url, options) => {
        calls.push(JSON.parse(options.body))
        return { ok: true, json: async () => ({ id: 'new-session', currentTime: 123.75, duration: 500, displayTitle: 'Lecture', audioTracks: [] }) }
    }
    const state = {
        options: { itemId: 'item', episodeId: 'episode', mode: 'audio' },
        loaded: true,
        busy: false,
        media: { paused: true, pause() {} },
        position: () => 123.75,
        tick() {},
        status() {},
        paint() {},
        element: { querySelector: () => ({}), hidden: true },
        sync: async () => {},
        load: async (time, autoplay) => calls.push({ time, autoplay })
    }
    try {
        await ShelfPlayer.prototype.start.call(state, { itemId: 'item', episodeId: 'episode', mode: 'video', canWatch: true, preservePause: true })
        assert.deepEqual(calls, [
            { itemId: 'item', episodeId: 'episode', mode: 'video', startTime: 123.75 },
            { time: 123.75, autoplay: false }
        ])
        assert.equal(state.busy, false)
        assert.equal(state.options.mode, 'video')
    } finally {
        globalThis.document = previousDocument
        globalThis.fetch = previousFetch
    }
})

test('position includes the offset of the current audio track', () => {
    const state = { session: { duration: 300, audioTracks: [{ startOffset: 0 }, { startOffset: 120 }] }, track: 1, media: { currentTime: 25.5 } }
    assert.equal(ShelfPlayer.prototype.position.call(state), 145.5)
})

test('a concurrent play request cannot replace a session being opened', async () => {
    const state = { busy: true }
    await ShelfPlayer.prototype.start.call(state, { itemId: 'other' })
    assert.equal(state.session, undefined)
})
