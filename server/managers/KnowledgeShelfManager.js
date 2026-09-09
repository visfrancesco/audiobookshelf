const Path = require('path')
const fs = require('fs/promises')
const Database = require('../Database')
const Logger = require('../Logger')
const JobQueue = require('../knowledge/JobQueue')
const YouTube = require('../knowledge/YouTube')
const ElevenLabs = require('../knowledge/ElevenLabs')
const { problem } = require('../knowledge/errors')

class KnowledgeShelfManager {
  constructor({ youtube = new YouTube(), speech = new ElevenLabs(), root, importBook } = {}) {
    this.youtube = youtube
    this.speech = speech
    this.root = root
    this.importBook = importBook
    this.ready = false
    this.locks = new Map()
  }
  get models() { return Database.models }
  async init({ start = true } = {}) {
    this.root ||= Path.join(global.MetadataPath, 'knowledge')
    await fs.mkdir(this.root, { recursive: true })
    this.root = await fs.realpath(this.root)
    this.queue = new JobQueue(this.models.knowledgeJob, {
      handlers: { 'youtube.check': this.checkSource.bind(this), 'youtube.download': this.downloadVideo.bind(this),
        'document.extract': this.extractDocument.bind(this), 'document.narrate': this.narrateDocument.bind(this) },
      onChange: this.syncDocumentState.bind(this),
      onError: error => Logger.error('[KnowledgeShelf] Queue error', error.message)
    })
    await this.queue.recover()
    for (const job of await this.models.knowledgeJob.findAll({ where: { kind: ['document.extract', 'document.narrate'], state: ['queued', 'needs_review', 'cancelled'] } })) await this.syncDocumentState(job)
    this.ready = true
    if (start) {
      this.queue.start()
      this.timer = setInterval(() => this.schedule().catch(error => Logger.error('[KnowledgeShelf] Scheduler error', error.message)), 60000)
      this.timer.unref()
      await this.schedule()
    }
  }
  async stop() {
    clearInterval(this.timer)
    this.ready = false
    while (this.scheduling) await new Promise(resolve => setTimeout(resolve, 20))
    await this.queue?.stop()
  }
  async locked(key, action) {
    const previous = this.locks.get(key) || Promise.resolve()
    const pending = previous.catch(() => {}).then(action)
    this.locks.set(key, pending)
    try { return await pending } finally { if (this.locks.get(key) === pending) this.locks.delete(key) }
  }
  async destination(libraryId, folderId, mediaType, user) {
    if (typeof libraryId !== 'string' || typeof folderId !== 'string' || libraryId.length > 100 || folderId.length > 100) throw problem('Library and folder IDs are required')
    const library = await this.models.library.findByIdWithFolders(libraryId)
    const folder = library?.libraryFolders.find(folder => folder.id === folderId)
    if (!library || !folder || library.mediaType !== mediaType) throw problem(`Select a folder in a ${mediaType === 'book' ? 'book' : 'podcast'} library`)
    if (user && !user.checkCanAccessLibrary(libraryId)) throw problem('Library access denied', 403)
    return { library, folder, root: await fs.realpath(folder.path) }
  }
  async capacity() {
    if (await this.models.knowledgeJob.count({ where: { state: ['queued', 'retry', 'running', 'cancelling'] } }) >= 500) throw problem('The queue is full. Wait for existing jobs to finish.', 429)
  }
  capabilities() {
    return { product: 'KnowledgeShelf', knowledgeShelfV1: this.ready, youtubeSources: this.ready,
      documents: this.ready, elevenLabs: this.ready && this.speech.configured, documentFormats: ['txt', 'md', 'html', 'pdf', 'epub', 'docx'], maxDocumentBytes: 20 * 1024 ** 2 }
  }
}
Object.assign(KnowledgeShelfManager.prototype, require('../knowledge/sources'), require('../knowledge/narration'))
module.exports = new KnowledgeShelfManager()
module.exports.KnowledgeShelfManager = KnowledgeShelfManager
