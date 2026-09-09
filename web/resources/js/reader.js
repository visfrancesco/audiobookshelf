import { request, notice } from './http.js'

let active
export async function openReader(element) {
    if (active?.element === element) return
    closeReader()
    const { default: ePub } = await import('epubjs')
    if (!element.isConnected) return
    const book = ePub(element.dataset.url, { openAs: 'epub' })
    const rendition = book.renderTo(element, { width: '100%', height: '100%', spread: 'auto', allowScriptedContent: false, allowPopups: false })
    active = { element, book, rendition, size: 110, saveTimer: null }
    rendition.themes.default({ body: { color: '#20332e', 'font-family': 'Georgia, serif', 'line-height': '1.7', padding: '0 16px !important' } })
    rendition.themes.fontSize('110%')
    rendition.on('relocated', (location) => {
        if (!active || active.book !== book) return
        clearTimeout(active.saveTimer)
        active.location = { ebookLocation: location.start.cfi, ebookProgress: Math.max(0, Math.min(1, location.start.percentage || 0)) }
        active.saveTimer = setTimeout(() => request(`/item/${element.dataset.item}/reading-progress`, active.location).catch((e) => notice(e.message)), 1000)
    })
    rendition.on('keydown', (event) => {
        if (event.key === 'ArrowRight') rendition.next()
        if (event.key === 'ArrowLeft') rendition.prev()
    })
    await rendition.display(element.dataset.location || undefined).catch(async () => rendition.display())
    await book.ready
    await book.locations.generate(1600)
}

export function readerAction(action) {
    if (!active) return
    if (action === 'next') active.rendition.next()
    if (action === 'previous') active.rendition.prev()
    if (action === 'larger' || action === 'smaller') {
        active.size = Math.min(200, Math.max(80, active.size + (action === 'larger' ? 10 : -10)))
        active.rendition.themes.fontSize(`${active.size}%`)
    }
}

export function closeReader() {
    if (!active) return
    clearTimeout(active.saveTimer)
    if (active.location) request(`/item/${active.element.dataset.item}/reading-progress`, active.location, 'POST', true).catch(() => {})
    active.rendition.destroy()
    active.book.destroy()
    active = null
}
