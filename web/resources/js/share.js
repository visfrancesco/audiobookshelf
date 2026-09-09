import { appUrl } from './http.js'

export async function openShare(element) {
    const slug = element.dataset.publicShare
    const base = appUrl(`/public/share/${encodeURIComponent(slug)}`)
    const status = element.querySelector('[data-share-status]')
    const response = await fetch(base, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    if (!response.ok) {
        status.textContent = 'This share is unavailable or has expired.'
        return
    }
    const share = await response.json()
    const session = share.playbackSession
    if (!session?.audioTracks?.length) {
        status.textContent = 'This share has no playable audio.'
        return
    }
    element.querySelector('[data-share-title]').textContent = session.displayTitle
    element.querySelector('[data-share-author]').textContent = session.displayAuthor
    const description = new DOMParser().parseFromString(session.mediaMetadata?.description || '', 'text/html').body.textContent
    element.querySelector('[data-share-description]').textContent = description
    const cover = element.querySelector('[data-share-cover]')
    cover.src = `${base}/cover`
    cover.hidden = false
    cover.addEventListener('error', () => {
        cover.hidden = true
    })
    const download = element.querySelector('[data-share-download]')
    download.href = `${base}/download`
    download.hidden = !share.isDownloadable
    const media = element.querySelector('[data-share-media]')
    const select = element.querySelector('[data-share-track]')
    const tracks = session.audioTracks
    let current = 0
    for (const [index, track] of tracks.entries()) {
        const option = document.createElement('option')
        option.value = String(index)
        option.textContent = track.title || `Track ${index + 1}`
        select.append(option)
    }
    const load = (index, time = 0, play = false) => {
        current = index
        select.value = String(index)
        media.src = `${base}/track/${tracks[index].index}`
        media.addEventListener(
            'loadedmetadata',
            () => {
                media.currentTime = Math.max(0, time - Number(tracks[index].startOffset || 0))
                if (play) media.play().catch(() => {})
            },
            { once: true }
        )
    }
    const position = Number(session.currentTime || 0)
    load(
        Math.max(
            0,
            tracks.findLastIndex((track) => Number(track.startOffset || 0) <= position)
        ),
        position
    )
    select.addEventListener('change', () => load(Number(select.value), Number(tracks[Number(select.value)].startOffset || 0), true))
    media.addEventListener('ended', () => {
        if (current + 1 < tracks.length) load(current + 1, Number(tracks[current + 1].startOffset || 0), true)
    })
    let lastSave = 0
    media.addEventListener('timeupdate', () => {
        if (Date.now() - lastSave < 15000) return
        lastSave = Date.now()
        fetch(`${base}/progress`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentTime: media.currentTime + Number(tracks[current].startOffset || 0) }) }).catch(() => {})
    })
    media.hidden = false
    status.textContent = ''
}
