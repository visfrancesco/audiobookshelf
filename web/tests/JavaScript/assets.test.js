import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

test('the initial app assets stay small and optional readers are loaded separately', () => {
    const root = new URL('../../public/build/', import.meta.url)
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'))
    const entry = manifest['resources/js/app.js']
    const script = readFileSync(new URL(entry.file, root))
    const style = readFileSync(new URL(manifest['resources/css/app.css'].file, root))
    const livewire = readFileSync(new URL('../../vendor/livewire/livewire/dist/livewire.min.js', import.meta.url))
    assert.ok(gzipSync(script).length < 25000, 'Initial application JS must stay below 25 KB compressed')
    assert.ok(gzipSync(style).length < 12000, 'Initial CSS must stay below 12 KB compressed')
    assert.ok(gzipSync(script).length + gzipSync(style).length + gzipSync(livewire).length < 120000, 'Initial assets including Livewire must stay below 120 KB compressed')
    assert.ok((entry.dynamicImports || []).length >= 2, 'Streaming and reading libraries must be optional imports')
})
