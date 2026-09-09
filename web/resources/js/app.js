import { ShelfPlayer } from './player.js'
import { notice, request } from './http.js'

let player
let readerModule
function initialize() {
    const element = document.querySelector('#player')
    if (element && !player) player = new ShelfPlayer(element)
    if (player?.session) document.body.classList.add('has-player')
    for (const destination of document.querySelectorAll('[data-destination]')) {
        if (destination.dataset.initialized) continue
        destination.dataset.initialized = '1'
        const library = destination.querySelector('[data-library-select]')
        const folder = destination.querySelector('[data-folder-select]')
        const filter = () => {
            for (const option of folder.options) {
                if (!option.value) continue
                option.hidden = option.disabled = option.dataset.library !== library.value
                if (option.selected && option.disabled) folder.value = ''
            }
            const available = Array.from(folder.options).filter((option) => option.value && !option.disabled)
            if (available.length === 1 && !folder.value) folder.value = available[0].value
        }
        library.addEventListener('change', filter)
        filter()
    }
    document.querySelectorAll('[data-cover-fallback]').forEach((image) => {
        image.addEventListener(
            'error',
            () => {
                image.hidden = true
                image.parentElement.classList.add('cover-missing')
            },
            { once: true }
        )
        if (image.complete && !image.naturalWidth) {
            image.hidden = true
            image.parentElement.classList.add('cover-missing')
        }
    })
    const shared = document.querySelector('[data-public-share]')
    if (shared && !shared.dataset.initialized) {
        shared.dataset.initialized = '1'
        import('./share.js').then((module) => module.openShare(shared)).catch((e) => notice(e.message))
    }
    const reader = document.querySelector('#ebook-reader')
    if (reader)
        import('./reader.js')
            .then((module) => {
                readerModule = module
                return module.openReader(reader)
            })
            .catch((e) => notice(`Could not open this ebook: ${e.message}`))
}

document.addEventListener('click', (event) => {
    const play = event.target.closest('[data-play]')
    if (play && player) {
        event.preventDefault()
        player.start({ itemId: play.dataset.item, episodeId: play.dataset.episode, mode: play.dataset.mode || 'audio', canWatch: play.dataset.canWatch === '1', ...(play.dataset.time !== undefined ? { startTime: Number(play.dataset.time) } : {}) })
    }
    const reader = event.target.closest('[data-reader]')
    if (reader) readerModule?.readerAction(reader.dataset.reader)
    const nav = event.target.closest('[data-toggle-nav]')
    if (nav) {
        const open = document.querySelector('#navigation').classList.toggle('open')
        nav.setAttribute('aria-expanded', String(open))
    }
    const addChapter = event.target.closest('[data-add-chapter]')
    if (addChapter) {
        const list = document.querySelector('#chapter-fields')
        if (!list) return
        const index = list.querySelectorAll('.chapter-fields').length
        const row = document.createElement('div')
        row.className = 'chapter-fields form-grid'
        for (const [name, label, type] of [
            ['title', 'Title', 'text'],
            ['start', 'Start (seconds)', 'number'],
            ['end', 'End (seconds)', 'number']
        ]) {
            const field = document.createElement('label')
            field.className = 'field'
            const span = document.createElement('span')
            span.textContent = label
            const input = document.createElement('input')
            input.name = `chapters[${index}][${name}]`
            input.type = type
            input.required = true
            if (type === 'number') {
                input.min = '0'
                input.step = '0.01'
            }
            field.append(span, input)
            row.append(field)
        }
        list.append(row)
        row.querySelector('input').focus()
    }
})
document.addEventListener('submit', (event) => {
    const form = event.target
    if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) event.preventDefault()
})
document.addEventListener('notice', (event) => notice(event.detail.message))
document.addEventListener('document-ready', (event) => {
    const page = document.querySelector('[data-document-id]')
    if (page?.dataset.documentId === event.detail.documentId && ['extracting', 'generating'].includes(page.dataset.documentState) && !page.dataset.refreshing) {
        page.dataset.refreshing = '1'
        window.Livewire.navigate(window.location.href, { preserveScroll: true })
    }
})
document.addEventListener('livewire:navigating', () => readerModule?.closeReader())
document.addEventListener('livewire:navigated', initialize)
window.addEventListener('pagehide', () => readerModule?.closeReader())
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize)
else initialize()

document.addEventListener('input', (event) => {
    if (!event.target.matches('[data-picker-search]')) return
    const picker = event.target.closest('[data-item-picker]')
    clearTimeout(picker.searchTimer)
    picker.searchVersion = (picker.searchVersion || 0) + 1
    const version = picker.searchVersion
    const results = picker.querySelector('[data-picker-results]')
    const status = picker.querySelector('[data-picker-status]')
    results.replaceChildren()
    if (event.target.value.trim().length < 2) {
        status.textContent = 'Enter at least two characters.'
        return
    }
    picker.searchTimer = setTimeout(async () => {
        status.textContent = 'Searching…'
        try {
            const query = new URLSearchParams({ libraryId: picker.dataset.library, q: event.target.value.trim() })
            const data = await request(`/pick-items?${query}`, undefined, 'GET')
            if (version !== picker.searchVersion || !picker.isConnected) return
            status.textContent = data.items.length ? 'Select a book below.' : 'No matching books.'
            for (const item of data.items) {
                const button = document.createElement('button')
                button.type = 'button'
                button.className = 'picker-option text-button'
                button.textContent = `+ ${item.title}`
                button.addEventListener('click', () => {
                    const selected = picker.querySelector('[data-picker-selected]')
                    if (Array.from(selected.querySelectorAll('input')).some((input) => input.value === item.id)) return
                    if (picker.dataset.multiple !== '1') selected.replaceChildren()
                    const row = document.createElement('div')
                    row.className = 'bookmark'
                    const input = document.createElement('input')
                    input.type = 'hidden'
                    input.name = picker.dataset.name
                    input.value = item.id
                    const title = document.createElement('span')
                    title.textContent = item.title
                    const remove = document.createElement('button')
                    remove.type = 'button'
                    remove.className = 'text-button'
                    remove.textContent = 'Remove'
                    remove.addEventListener('click', () => row.remove())
                    row.append(input, title, remove)
                    selected.append(row)
                })
                results.append(button)
            }
        } catch (error) {
            status.textContent = error.message
        }
    }, 300)
})
document.addEventListener('click', (event) => {
    const move = event.target.closest('[data-move]')
    if (!move) return
    const row = move.closest('[data-reorder-row]')
    const list = row.parentElement
    if (move.dataset.move === 'up' && row.previousElementSibling) list.insertBefore(row, row.previousElementSibling)
    if (move.dataset.move === 'down' && row.nextElementSibling) list.insertBefore(row.nextElementSibling, row)
    Array.from(list.children).forEach((entry, index) =>
        entry.querySelectorAll('input').forEach((input) => {
            input.name = input.name.replace(/items\[\d+\]/, `items[${index}]`)
        })
    )
    move.focus()
})
