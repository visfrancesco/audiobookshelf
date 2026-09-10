export function appUrl(path) {
    return `${document.body.dataset.publicPrefix || ''}${path}`
}

export async function request(path, data, method = 'POST', keepalive = false) {
    const response = await fetch(appUrl(path), {
        method,
        credentials: 'same-origin',
        keepalive,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content },
        body: data === undefined ? undefined : JSON.stringify(data)
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
        const message = Object.values(body.errors || {}).flat()[0] || body.message || `Request failed (${response.status}).`
        throw new Error(response.status === 401 || response.status === 419 ? 'Your session expired. Sign in again to continue.' : message)
    }
    return body
}

let toastTimer
export function notice(message) {
    const toast = document.querySelector('#toast')
    if (!toast) return
    toast.textContent = message
    toast.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
        toast.hidden = true
    }, 7000)
}
