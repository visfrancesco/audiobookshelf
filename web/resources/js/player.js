import { request, notice } from './http.js'
import { clock, trackAt, clampTime } from './player-time.js'

export class ShelfPlayer {
    constructor(element) {
        this.element = element
        this.media = element.querySelector('video')
        this.session = null
        this.track = 0
        this.listened = 0
        this.lastTick = performance.now()
        this.busy = false
        this.syncing = false
        this.loaded = false
        this.sleepAt = 0
        this.hls = null
        this.sourceVersion = 0
        this.media.addEventListener('timeupdate', () => this.paint())
        this.media.addEventListener('playing', () => {
            this.lastTick = performance.now()
            this.status('')
            this.paint()
        })
        this.media.addEventListener('pause', () => {
            this.tick()
            this.paint()
            if (this.loaded && !this.busy) this.sync().catch((e) => this.status(e.message))
        })
        this.media.addEventListener('waiting', () => this.status('Buffering…'))
        this.media.addEventListener('error', () => {
            if (this.loaded) this.status('Playback interrupted. Try opening this item again.')
        })
        this.media.addEventListener('ended', async () => {
            if (!this.session || this.busy) return
            if (!this.session.media && this.track + 1 < this.session.audioTracks.length) {
                await this.load(Number(this.session.audioTracks[this.track + 1].startOffset), true).catch((e) => this.status(e.message))
            } else {
                this.sync().catch((e) => this.status(e.message))
                this.status('Finished')
            }
        })
        element.addEventListener('click', (event) => {
            const action = event.target.closest('[data-player]')?.dataset.player
            if (action) this.action(action).catch((e) => this.status(e.message))
        })
        element.querySelector('#player-seek').addEventListener('change', (event) => this.seek(Number(event.target.value)).catch((e) => this.status(e.message)))
        element.querySelector('#player-speed').addEventListener('change', (event) => {
            this.media.playbackRate = Number(event.target.value)
            localStorage.setItem(`shelf-speed-${document.body.dataset.userId}`, event.target.value)
            this.paint()
        })
        element.querySelector('#player-sleep').addEventListener('change', (event) => {
            this.sleepAt = Number(event.target.value) ? Date.now() + Number(event.target.value) * 60000 : 0
        })
        this.timer = setInterval(() => {
            this.tick()
            if (this.listened >= 15) this.sync().catch((e) => this.status(e.message))
        }, 1000)
        window.addEventListener('pagehide', () => this.sync(false, true).catch(() => {}))
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.sync(false, true).catch(() => {})
        })
        if ('mediaSession' in navigator) {
            const actions = { play: () => this.action('play'), pause: () => this.media.pause(), seekbackward: () => this.seek(this.position() - 30), seekforward: () => this.seek(this.position() + 30), seekto: (details) => this.seek(details.seekTime) }
            for (const [name, handler] of Object.entries(actions)) {
                try {
                    navigator.mediaSession.setActionHandler(name, (details) => Promise.resolve(handler(details)).catch((e) => this.status(e.message)))
                } catch {
                    /* Older browsers support a subset of actions. */
                }
            }
        }
    }

    status(message) {
        this.element.querySelector('#player-status').textContent = message
    }
    position() {
        if (!this.session) return 0
        return clampTime(this.media.currentTime + (this.session.media ? 0 : Number(this.session.audioTracks[this.track]?.startOffset || 0)), this.session.duration)
    }

    tick() {
        const now = performance.now()
        if (this.session && !this.media.paused && !this.media.seeking && this.media.readyState >= 3) this.listened += Math.min((now - this.lastTick) / 1000, 30)
        this.lastTick = now
        if (this.sleepAt && Date.now() >= this.sleepAt) {
            this.media.pause()
            this.sleepAt = 0
            this.element.querySelector('#player-sleep').value = '0'
            this.status('Sleep timer finished')
        }
    }

    async start(options) {
        if (this.busy) return
        const same = this.options?.itemId === options.itemId && this.options?.episodeId === options.episodeId
        if (same && this.options.mode === options.mode && this.loaded) {
            if (options.startTime !== undefined) await this.seek(options.startTime)
            await this.media.play()
            return
        }
        this.busy = true
        const resumeTime = same ? this.position() : undefined
        const wasPlaying = !this.media.paused
        this.status('Opening…')
        this.tick()
        this.media.pause()
        try {
            await this.sync()
            const payload = { itemId: options.itemId, mode: options.mode, ...(options.episodeId ? { episodeId: options.episodeId } : {}) }
            if (options.startTime !== undefined || resumeTime !== undefined) payload.startTime = options.startTime ?? resumeTime
            const session = await request('/player/start', payload)
            this.loaded = false
            this.session = session
            this.options = { ...options }
            this.listened = 0
            this.element.hidden = false
            document.body.classList.add('has-player')
            this.element.querySelector('#player-title').textContent = session.displayTitle
            this.element.querySelector('#player-switch').hidden = !options.canWatch
            this.element.querySelector('#player-switch').textContent = options.mode === 'video' ? 'Listen only' : 'Watch video'
            this.element.querySelector('#player-mode').textContent = options.mode === 'video' ? 'WATCHING' : 'LISTENING'
            this.element.querySelector('#video-stage').hidden = options.mode !== 'video'
            if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: session.displayTitle, artist: session.displayAuthor || '' })
            await this.load(Number(session.currentTime ?? session.startTime ?? 0), options.preservePause ? wasPlaying : true)
            this.status('')
        } catch (error) {
            this.status(error.message)
        } finally {
            this.busy = false
            this.paint()
        }
    }

    async load(time, autoplay) {
        const version = ++this.sourceVersion
        this.loaded = false
        this.hls?.destroy()
        this.hls = null
        this.media.pause()
        this.media.removeAttribute('src')
        this.media.load()
        this.track = this.session.media ? 0 : trackAt(this.session.audioTracks, time)
        const track = this.session.media || this.session.audioTracks[this.track]
        if (!track?.contentUrl) throw new Error('This item has no playable audio.')
        const offset = this.session.media ? 0 : Number(track.startOffset || 0)
        const target = Math.max(0, time - offset)
        const isHls = track.delivery === 'hls' || /mpegurl/i.test(track.mimeType || '') || track.contentUrl.includes('.m3u8')
        const ready = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup()
                reject(new Error('Media is taking too long to load. Try again.'))
            }, 45000)
            const cleanup = () => {
                clearTimeout(timeout)
                this.media.removeEventListener('loadedmetadata', metadata)
                this.media.removeEventListener('error', error)
            }
            const metadata = () => {
                cleanup()
                resolve()
            }
            const error = () => {
                cleanup()
                reject(new Error('This browser could not load the media.'))
            }
            this.media.addEventListener('loadedmetadata', metadata, { once: true })
            this.media.addEventListener('error', error, { once: true })
        })
        // Observe early media errors while the optional HLS module is loading.
        ready.catch(() => {})
        if (isHls && !this.media.canPlayType('application/vnd.apple.mpegurl')) {
            const { default: Hls } = await import('hls.js')
            if (version !== this.sourceVersion) return
            if (!Hls.isSupported()) throw new Error('This browser does not support streamed audio.')
            this.hls = new Hls({ startPosition: target, maxBufferLength: 30, maxMaxBufferLength: 60, backBufferLength: 30 })
            this.hls.on(Hls.Events.ERROR, (_event, data) => {
                if (data.fatal) {
                    this.status('Streaming interrupted. Reopen the item to retry.')
                    this.hls?.destroy()
                }
            })
            this.hls.loadSource(track.contentUrl)
            this.hls.attachMedia(this.media)
        } else this.media.src = track.contentUrl
        await ready
        if (version !== this.sourceVersion) return
        this.media.currentTime = target
        const storedSpeed = Number(localStorage.getItem(`shelf-speed-${document.body.dataset.userId}`)) || 1
        this.media.playbackRate = Math.min(3, Math.max(0.75, storedSpeed))
        this.element.querySelector('#player-speed').value = String(this.media.playbackRate)
        this.loaded = true
        this.lastTick = performance.now()
        this.paint()
        if (autoplay) await this.media.play().catch(() => this.status('Press play to continue.'))
    }

    async seek(time) {
        if (!this.session || this.busy || !this.loaded) return
        time = clampTime(time, this.session.duration)
        if (!this.session.media && trackAt(this.session.audioTracks, time) !== this.track) await this.load(time, !this.media.paused)
        else this.media.currentTime = time - (this.session.media ? 0 : Number(this.session.audioTracks[this.track]?.startOffset || 0))
        this.paint()
    }

    async sync(close = false, keepalive = false) {
        if (!this.session || !this.loaded || this.syncing) return
        this.tick()
        this.syncing = true
        const sent = Math.min(300, this.listened)
        const id = this.session.id
        try {
            await request('/player/sync', { sessionId: id, currentTime: this.position(), duration: this.session.duration, timeListened: sent, close }, 'POST', keepalive)
            if (this.session?.id === id) this.listened = Math.max(0, this.listened - sent)
        } finally {
            this.syncing = false
        }
    }

    async action(action) {
        if (!this.session || this.busy) return
        if (action === 'play') this.media.paused ? await this.media.play() : this.media.pause()
        if (action === 'back') await this.seek(this.position() - 30)
        if (action === 'forward') await this.seek(this.position() + 30)
        if (action === 'fullscreen') await this.media.requestFullscreen?.()
        if (action === 'mode') await this.start({ ...this.options, mode: this.options.mode === 'video' ? 'audio' : 'video', startTime: this.position(), preservePause: true })
        if (action === 'bookmark') {
            const title = window.prompt('Bookmark title', `Saved at ${clock(this.position())}`)
            if (title?.trim()) {
                await request(`/item/${this.options.itemId}/actions/bookmark`, { time: Math.floor(this.position()), title: title.trim(), episodeId: this.options.episodeId || null })
                notice('Bookmark saved.')
            }
        }
        if (action === 'close') {
            this.tick()
            this.media.pause()
            await this.sync(true)
            this.session = null
            this.loaded = false
            this.sourceVersion++
            this.hls?.destroy()
            this.hls = null
            this.media.removeAttribute('src')
            this.media.load()
            this.element.hidden = true
            document.body.classList.remove('has-player')
        }
        this.paint()
    }

    paint() {
        if (!this.session) return
        const position = this.position()
        this.element.querySelector('#player-current').textContent = clock(position)
        this.element.querySelector('#player-duration').textContent = clock(this.session.duration)
        const seek = this.element.querySelector('#player-seek')
        seek.max = this.session.duration
        if (document.activeElement !== seek) seek.value = position
        this.element.querySelector('[data-player="play"]').textContent = this.media.paused ? '▶' : 'Ⅱ'
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = this.media.paused ? 'paused' : 'playing'
            try {
                navigator.mediaSession.setPositionState({ duration: this.session.duration, playbackRate: this.media.playbackRate, position })
            } catch {
                /* Metadata may precede a known duration. */
            }
        }
    }
}
