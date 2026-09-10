const Path = require('path')
const fs = require('fs/promises')
const crypto = require('crypto')
const { Op } = require('sequelize')
const documents = require('./documents')
const { text, hash, integer } = require('./validation')
const { problem, checkAbort } = require('./errors')
const { run } = require('./process')
const { containedFile, revisionFor } = require('../utils/videoPodcastUtils')
const { rawProbe } = require('../utils/prober')

const activeStates = ['queued', 'running', 'retry', 'cancelling', 'needs_review']
const safeMetadata = value => String(value || '').replace(/[\\=;#\n\r]/g, ch => ch === '\r' ? '' : `\\${ch}`)
const chunkName = index => `${String(index).padStart(6, '0')}.mp3`

module.exports = {
  async retryJob(job, acknowledgeUncertain) {
    await this.capacity()
    if (!job.payload?.documentId) return this.queue.retry(job, acknowledgeUncertain)
    return this.locked(`document:${job.payload.documentId}`, async () => {
      const doc = await this.models.knowledgeDocument.findByPk(job.payload.documentId)
      if (!doc) throw problem('Document was removed', 404)
      if (job.kind === 'document.extract' && doc.text) throw problem('This document already has editable text; create a new document to extract the original again', 409)
      if (job.kind === 'document.narrate' && doc.contentHash !== job.payload.contentHash) throw problem('Document changed; generate a new narration', 409)
      if (await this.models.knowledgeJob.count({ where: { id: { [Op.ne]: job.id }, kind: ['document.extract', 'document.narrate'], state: activeStates, 'payload.documentId': doc.id } })) throw problem('Another document job is active; resolve it before retrying', 409)
      const result = await this.queue.retry(job, acknowledgeUncertain)
      if (job.kind === 'document.narrate') await doc.update({ generation: { ...job.payload.settings, jobId: job.id, characters: doc.text.length }, state: 'generating', error: null })
      return result
    })
  },
  async documentAccess(doc, job) {
    const user = await this.models.user.findByPk(job.ownerId || doc.ownerId)
    if (!user?.isActive || (!user.isAdminOrUp && !user.canUpload)) throw problem('The submitting user no longer has upload permission', 403)
    return this.destination(doc.libraryId, doc.libraryFolderId, 'book', user)
  },
  async syncDocumentState(job) {
    if (!job.payload?.documentId) return
    const doc = await this.models.knowledgeDocument.findByPk(job.payload.documentId)
    if (!doc || (doc.generation?.jobId && doc.generation.jobId !== job.id)) return
    if (job.kind === 'document.extract' && doc.text) return
    const pending = ['queued', 'running', 'retry'].includes(job.state)
    const state = pending ? (job.kind === 'document.extract' ? 'extracting' : 'generating') : job.state === 'completed' && job.kind === 'document.extract' ? 'ready' : job.state
    await doc.update({ state, error: job.error })
  },
  async createDocument(body, upload, user) {
    await this.capacity()
    await this.destination(body.libraryId, body.libraryFolderId, 'book', user)
    if ([!!upload, typeof body.text === 'string', !!body.url].filter(Boolean).length !== 1) throw problem('Provide one document file, article URL or text')
    const id = crypto.randomUUID()
    const directory = Path.join(this.root, 'documents', id)
    let format, originalPath, originalName, preview
    if (upload) {
      if (Array.isArray(upload) || upload.truncated || upload.size > documents.MAX_FILE) throw problem('Upload one document up to 20 MiB', 413)
      originalName = Path.basename(upload.name).slice(0, 250)
      format = Path.extname(originalName).slice(1).toLowerCase()
      if (!['txt', 'md', 'html', 'htm', 'pdf', 'epub', 'docx'].includes(format)) throw problem('Supported formats: TXT, Markdown, HTML, PDF, EPUB and DOCX', 415)
      await fs.mkdir(directory, { recursive: true })
      originalPath = Path.join(directory, `original.${format}`)
      await upload.mv(originalPath)
    } else if (body.url) { documents.publicURL(body.url); format = 'url' }
    else { format = 'text'; preview = documents.preview(body.text) }
    const doc = await this.models.knowledgeDocument.create({ id, ownerId: user.id, title: text(body.title || originalName || 'Untitled document', 'title'), author: text(body.author || '', 'author', 300, false),
      sourceUrl: body.url || null, libraryId: body.libraryId, libraryFolderId: body.libraryFolderId, format, originalPath, originalName,
      state: preview ? 'ready' : 'extracting', ...(preview ? { text: preview.text, contentHash: preview.contentHash, sections: preview.sections } : {}) })
    if (!preview) await this.queue.enqueue('document.extract', `extract:${id}`, { documentId: id }, { ownerId: user.id })
    return doc
  },
  async extractDocument(job, { signal }) {
    const doc = await this.models.knowledgeDocument.findByPk(job.payload.documentId)
    if (!doc) throw problem('Document was removed', 404)
    try {
      await this.documentAccess(doc, job)
      let extracted
      if (doc.format === 'url') extracted = await documents.fetchArticle(doc.sourceUrl, signal)
      else {
        const file = await containedFile(this.root, Path.relative(this.root, doc.originalPath))
        extracted = await documents.extract(file.path, doc.format, signal)
      }
      const preview = documents.preview(extracted.text)
      checkAbort(signal)
      await doc.update({ text: preview.text, contentHash: preview.contentHash, sections: extracted.sections || preview.sections,
        title: doc.title === 'Untitled document' && extracted.title ? extracted.title.slice(0, 300) : doc.title, state: 'ready', error: null })
      return { documentId: doc.id, characters: preview.characters }
    } catch (error) { await doc.update({ state: 'failed', error: error.message }); throw error }
  },
  async editDocument(doc, body) {
    return this.locked(`document:${doc.id}`, async () => {
      if (await this.models.knowledgeJob.count({ where: { kind: ['document.extract', 'document.narrate'], state: activeStates, 'payload.documentId': doc.id } })) throw problem('Stop the active document job before editing', 409)
      const values = {}
      if (body.title !== undefined) values.title = text(body.title, 'title')
      if (body.author !== undefined) values.author = text(body.author, 'author', 300, false)
      if (body.text !== undefined) {
        const preview = documents.preview(body.text, values.title || doc.title)
        Object.assign(values, { text: preview.text, contentHash: preview.contentHash, sections: preview.sections, state: 'ready', error: null })
      }
      return doc.update(values)
    })
  },
  async generateDocument(doc, body, user) {
    return this.locked(`document:${doc.id}`, async () => {
      await doc.reload()
      if (!doc.text || body.contentHash !== doc.contentHash) throw problem('Review the latest document preview before generating narration', 409, 'preview_changed')
      const maxCharacters = integer(body.maxCharacters, 'Character budget', 100000, 1, documents.MAX_TEXT)
      if (doc.text.length > maxCharacters) throw problem(`This document has ${doc.text.length} characters, exceeding the ${maxCharacters} character budget`, 422, 'character_budget_exceeded')
      const voiceId = text(body.voiceId, 'voice ID', 100)
      if (!/^[\w-]+$/.test(voiceId)) throw problem('Invalid voice ID')
      const modelId = body.modelId || 'eleven_multilingual_v2'
      if (!['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'].includes(modelId)) throw problem('Unsupported narration model')
      await this.destination(doc.libraryId, doc.libraryFolderId, 'book', user)
      if (!(await this.speech.voices()).some(voice => voice.id === voiceId)) throw problem('Voice is not available on this ElevenLabs account', 422)
      const settings = { voiceId, modelId, voiceSettings: { stability: 0.5, similarity_boost: 0.75 } }
      const key = `narrate:${doc.id}:${hash(JSON.stringify([doc.contentHash, doc.title, doc.author, settings]))}`
      const existing = await this.models.knowledgeJob.findOne({ where: { key } })
      if (existing) return existing
      if (await this.models.knowledgeJob.count({ where: { kind: 'document.narrate', state: activeStates, 'payload.documentId': doc.id } })) throw problem('This document already has an active narration job', 409)
      await this.capacity()
      const job = await this.queue.enqueue('document.narrate', key, { documentId: doc.id, contentHash: doc.contentHash, settings }, { ownerId: user.id })
      await doc.update({ state: 'generating', error: null, generation: { ...settings, characters: doc.text.length, jobId: job.id } })
      return job
    })
  },
  async narrateDocument(job, { signal, checkpoint }) {
    const doc = await this.models.knowledgeDocument.findByPk(job.payload.documentId)
    if (!doc) throw problem('Document was removed', 404)
    if (doc.contentHash !== job.payload.contentHash) throw problem('Document text changed; create a new narration job', 409)
    const directory = Path.join(this.root, 'jobs', job.id)
    await fs.mkdir(directory, { recursive: true })
    const parts = documents.chunks(doc.text, doc.sections)
    const state = { ...job.checkpoint, chunks: [...(job.checkpoint.chunks || [])] }
    try {
      await this.documentAccess(doc, job)
      await doc.update({ state: 'generating', error: null })
      for (let index = 0; index < parts.length; index++) {
        checkAbort(signal)
        const path = Path.join(directory, chunkName(index))
        let cached = await fs.readFile(path).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
        if (state.chunks[index] && (!cached || hash(cached) !== state.chunks[index].hash)) throw problem('A saved speech chunk is missing or changed. Restore it before retrying to avoid paying for it again.', 409, 'speech_cache_missing')
        if (!cached) {
          await this.documentAccess(doc, job)
          state.pendingSpeech = { index, characters: parts[index].text.length, sentAt: new Date().toISOString() }
          await checkpoint(state, index / parts.length * 0.85)
          try {
            cached = await this.speech.speak(parts[index].text, job.payload.settings, { signal, previousText: parts[index - 1]?.text, nextText: parts[index + 1]?.text })
          } catch (error) {
            if (error.code === 'speech_rejected' || error.code === 'speech_not_configured') {
              delete state.pendingSpeech
              // A known rejection is safe even when cancellation happened meanwhile.
              await job.update({ checkpoint: JSON.parse(JSON.stringify(state)) })
            }
            throw error
          }
          await fs.writeFile(`${path}.tmp`, cached, { mode: 0o600 })
          await fs.rename(`${path}.tmp`, path)
        }
        // Decode encoder delay before measuring chapters. MP3 container durations
        // include padding that otherwise accumulates across a long document.
        await run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', path, '-map', '0:a:0', '-ac', '1', '-ar', '44100', '-c:a', 'flac', `${path}.flac`], { signal, timeout: 180000 })
        const raw = await rawProbe(`${path}.flac`, { timeout: 30000, maxOutputBytes: 1024 ** 2 })
        const duration = Number(raw.format?.duration)
        if (!Number.isFinite(duration) || duration <= 0) throw problem('Provider returned invalid audio; saved response retained for review', 502, 'speech_request_uncertain')
        state.chunks[index] = { hash: hash(cached), duration }
        delete state.pendingSpeech
        await checkpoint(state, (index + 1) / parts.length * 0.85)
      }
      checkAbort(signal)
      const metadata = [';FFMETADATA1', `title=${safeMetadata(doc.title)}`, `artist=${safeMetadata(doc.author || 'KnowledgeShelf')}`, `album=${safeMetadata(doc.title)}`, `comment=${safeMetadata(doc.sourceUrl || 'Document narration')}`]
      let elapsed = 0
      const chapters = []
      for (let index = 0; index < parts.length; index++) {
        const duration = state.chunks[index].duration
        if (chapters.length && chapters[chapters.length - 1].title === parts[index].title) chapters[chapters.length - 1].end += duration
        else chapters.push({ title: parts[index].title, start: elapsed, end: elapsed + duration })
        elapsed += duration
      }
      for (const chapter of chapters) metadata.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(chapter.start * 1000)}`, `END=${Math.round(chapter.end * 1000)}`, `title=${safeMetadata(chapter.title)}`)
      await fs.writeFile(Path.join(directory, 'chapters.txt'), metadata.join('\n'))
      await fs.writeFile(Path.join(directory, 'concat.txt'), parts.map((_, index) => `file '${chunkName(index)}.flac'`).join('\n'))
      await run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', 'concat.txt', '-f', 'ffmetadata', '-i', 'chapters.txt',
        '-map', '0:a:0', '-map_metadata', '1', '-map_chapters', '1', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'narration.m4b'], { signal, cwd: directory, timeout: 3600000 })
      checkAbort(signal)
      const { library, folder, root } = await this.destination(doc.libraryId, doc.libraryFolderId, 'book')
      const target = Path.join(root, `KnowledgeShelf-${doc.id}`)
      await fs.mkdir(target, { recursive: true })
      if (await fs.realpath(target) !== target) throw problem('Narration destination must not be a symlink', 409)
      // Copy within destination filesystem and rename atomically; scanners never see partial audio.
      const finalPath = Path.join(target, 'Narration.m4b')
      await fs.copyFile(Path.join(directory, 'narration.m4b'), Path.join(target, '.narration.tmp'))
      await fs.rename(Path.join(target, '.narration.tmp'), finalPath)
      await fs.writeFile(Path.join(target, '.metadata.tmp'), JSON.stringify({ title: doc.title, authors: doc.author ? [doc.author] : ['KnowledgeShelf'], description: doc.sourceUrl || 'Document narration' }))
      await fs.rename(Path.join(target, '.metadata.tmp'), Path.join(target, 'metadata.json'))
      await checkpoint(state, 0.95)
      let item = await this.models.libraryItem.findOne({ where: { path: target, libraryId: library.id } })
      if (this.importBook) item = await this.importBook({ target, library, folder, item, doc })
      else {
        const scanner = require('../scanner/LibraryItemScanner')
        if (item) { await scanner.scanLibraryItem(item.id); item = await this.models.libraryItem.findByPk(item.id) }
        else {
          await require('../utils/queries/libraryFilters').getFilterData(library.mediaType, library.id)
          item = await scanner.scanPotentialNewLibraryItem(target, library, folder, false)
        }
      }
      if (!item) throw problem('Narration was saved but library import failed. Retry to import the saved audio.', 500)
      const stat = await fs.stat(finalPath)
      await this.models.knowledgeAsset.upsert({ id: `document:${doc.id}`, documentId: doc.id, externalId: doc.id, libraryItemId: item.id, root, relativePath: Path.relative(root, finalPath), revision: revisionFor(stat), owned: true, available: true })
      await doc.update({ state: 'completed', libraryItemId: item.id, error: null })
      // Paid chunks remain available for retry/review. Document deletion removes the cache.
      return { documentId: doc.id, libraryItemId: item.id, characters: doc.text.length, duration: elapsed }
    } catch (error) { await doc.update({ state: error.code === 'speech_request_uncertain' || state.pendingSpeech ? 'needs_review' : 'failed', error: error.message }); throw error }
  },
  async deleteDocument(doc) {
    return this.locked(`document:${doc.id}`, async () => {
      const jobs = await this.models.knowledgeJob.findAll({ where: { kind: ['document.extract', 'document.narrate'], 'payload.documentId': doc.id } })
      if (jobs.some(job => activeStates.includes(job.state))) throw problem('Resolve or cancel document jobs before deleting', 409)
      for (const job of jobs) await fs.rm(Path.join(this.root, 'jobs', job.id), { recursive: true, force: true })
      await fs.rm(Path.join(this.root, 'documents', doc.id), { recursive: true, force: true })
      await doc.destroy()
      // The generated audiobook belongs to the library and remains playable.
    })
  }
}
