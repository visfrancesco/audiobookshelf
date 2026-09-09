export function clock(seconds = 0) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0))
    const hours = Math.floor(total / 3600)
    return `${hours ? `${hours}:` : ''}${hours ? String(Math.floor(total / 60) % 60).padStart(2, '0') : Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function trackAt(tracks, seconds) {
    return Math.max(
        0,
        tracks.findLastIndex((track) => Number(track.startOffset || 0) <= seconds)
    )
}

export function clampTime(seconds, duration) {
    return Math.max(0, Math.min(Number(seconds) || 0, Number(duration) || 0))
}
