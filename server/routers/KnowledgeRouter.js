const express = require('express')
const { Op, fn, col } = require('sequelize')
const { problem } = require('../knowledge/errors')

const documentJSON = (doc, full = false) => {
  const { originalPath, text, sections, ...data } = doc.toJSON()
  return { ...data, characters: data.characters ?? text?.length ?? 0, ...(full ? { text, sections } : {}) }
}
const jobJSON = job => {
  const { payload, checkpoint, ...data } = job.toJSON()
  return { ...data, documentId: payload?.documentId, completedChunks: checkpoint?.chunks?.length || 0, uncertainRequest: !!checkpoint?.pendingSpeech }
}
function router(manager = require('../managers/KnowledgeShelfManager')) {
  const router = express.Router()
  const route = handler => async (req, res) => {
    try {
      if (!manager.ready) throw problem('KnowledgeShelf is starting', 503)
      await handler(req, res)
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'KnowledgeShelf could not complete this operation', code: error.code || 'internal_error' }) }
    finally {
      for (const file of Object.values(req.files || {}).flat()) {
        if (file.tempFilePath) await require('fs/promises').unlink(file.tempFilePath).catch(() => {})
      }
    }
  }
  const admin = req => { if (!req.user.isAdminOrUp) throw problem('Administrator access required', 403) }
  const upload = req => { if (!req.user.isAdminOrUp && !req.user.canUpload) throw problem('Upload permission required', 403) }
  const doc = async req => {
    const value = await manager.models.knowledgeDocument.findByPk(req.params.id)
    if (!value || (!req.user.isAdminOrUp && value.ownerId !== req.user.id) || !req.user.checkCanAccessLibrary(value.libraryId)) throw problem('Document not found', 404)
    return value
  }
  const source = async req => {
    admin(req)
    const value = await manager.models.knowledgeSource.findByPk(req.params.id)
    if (!value || !req.user.checkCanAccessLibrary(value.libraryId)) throw problem('Source not found', 404)
    return value
  }
  const authorizedJob = async (req, job) => {
    if (!job || (!req.user.isAdminOrUp && job.ownerId !== req.user.id)) return false
    const parent = job.sourceId ? await manager.models.knowledgeSource.findByPk(job.sourceId) : await manager.models.knowledgeDocument.findByPk(job.payload?.documentId)
    return !!parent && req.user.checkCanAccessLibrary(parent.libraryId)
  }
  const job = async req => {
    const value = await manager.models.knowledgeJob.findByPk(req.params.id)
    if (!(await authorizedJob(req, value))) throw problem('Job not found', 404)
    if (value.sourceId) admin(req)
    else upload(req)
    return value
  }
  const page = req => ({ limit: Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 30)), offset: Math.max(0, Math.min(100000, Number.parseInt(req.query.offset, 10) || 0)) })
  const libraryIds = async req => (await manager.models.library.findAll({ attributes: ['id'] })).filter(library => req.user.checkCanAccessLibrary(library.id)).map(l => l.id)
  router.get('/status', route(async (req, res) => res.json(manager.capabilities())))
  router.get('/voices', route(async (req, res) => { upload(req); res.json({ voices: await manager.speech.voices() }) }))
  router.get('/sources', route(async (req, res) => {
    admin(req)
    const result = await manager.models.knowledgeSource.findAndCountAll({ where: { libraryId: await libraryIds(req) }, ...page(req), order: [['createdAt', 'DESC']] })
    res.json({ total: result.count, sources: result.rows })
  }))
  router.post('/sources', route(async (req, res) => { admin(req); res.status(201).json(await manager.createSource(req.body, req.user)) }))
  router.get('/sources/:id', route(async (req, res) => res.json(await source(req))))
  router.patch('/sources/:id', route(async (req, res) => res.json(await manager.updateSource(await source(req), req.body))))
  router.post('/sources/:id/check', route(async (req, res) => res.status(202).json(jobJSON(await manager.enqueueSource(await source(req), req.user.id)))))
  router.delete('/sources/:id', route(async (req, res) => {
    const value = await source(req)
    const pending = await manager.models.knowledgeJob.findAll({ where: { sourceId: value.id, state: ['queued', 'retry', 'running', 'cancelling'] } })
    await value.update({ enabled: false })
    for (const job of pending) await manager.queue.cancel(job)
    if (pending.some(job => job.state === 'cancelling')) throw problem('Downloads are stopping. Retry removal once they finish.', 409)
    await value.destroy()
    res.sendStatus(204)
  }))
  router.post('/pinchflat/preview', route(async (req, res) => { admin(req); res.json(await manager.adoptPinchflat(req.body, req.user)) }))
  router.post('/pinchflat/adopt', route(async (req, res) => { admin(req); res.json(await manager.adoptPinchflat(req.body, req.user, true)) }))
  router.get('/sources/:id/assets', route(async (req, res) => {
    const value = await source(req)
    const result = await manager.models.knowledgeAsset.findAndCountAll({ where: { sourceId: value.id }, ...page(req), order: [['createdAt', 'DESC']], attributes: ['id', 'externalId', 'episodeId', 'libraryItemId', 'available', 'owned', 'excluded', 'revision', 'createdAt'] })
    res.json({ total: result.count, assets: result.rows })
  }))
  router.post('/assets/:id/refresh', route(async (req, res) => {
    admin(req)
    const asset = await manager.models.knowledgeAsset.findByPk(req.params.id)
    if (!asset || !req.user.checkCanAccessLibrary((await manager.models.libraryItem.findByPk(asset.libraryItemId))?.libraryId)) throw problem('Asset not found', 404)
    const refreshed = await manager.refreshAsset(asset)
    res.json({ id: refreshed.id, episodeId: refreshed.episodeId, available: refreshed.available })
  }))
  router.get('/documents', route(async (req, res) => {
    const result = await manager.models.knowledgeDocument.findAndCountAll({ where: { ...(req.user.isAdminOrUp ? {} : { ownerId: req.user.id }), libraryId: await libraryIds(req) },
      ...page(req), order: [['createdAt', 'DESC']], attributes: { exclude: ['originalPath', 'sections', 'text'], include: [[fn('length', col('text')), 'characters']] } })
    res.json({ total: result.count, documents: result.rows.map(row => documentJSON(row)) })
  }))
  router.post('/documents', route(async (req, res) => { upload(req); res.status(201).json(documentJSON(await manager.createDocument(req.body, req.files?.file, req.user), true)) }))
  router.get('/documents/:id', route(async (req, res) => res.json(documentJSON(await doc(req), true))))
  router.patch('/documents/:id', route(async (req, res) => { upload(req); res.json(documentJSON(await manager.editDocument(await doc(req), req.body), true)) }))
  router.post('/documents/:id/generate', route(async (req, res) => { upload(req); res.status(202).json(jobJSON(await manager.generateDocument(await doc(req), req.body, req.user))) }))
  router.delete('/documents/:id', route(async (req, res) => { upload(req); await manager.deleteDocument(await doc(req)); res.sendStatus(204) }))
  router.get('/jobs', route(async (req, res) => {
    const libraries = await libraryIds(req)
    const sources = req.user.isAdminOrUp ? await manager.models.knowledgeSource.findAll({ where: { libraryId: libraries }, attributes: ['id'] }) : []
    const documents = await manager.models.knowledgeDocument.findAll({ where: { libraryId: libraries, ...(req.user.isAdminOrUp ? {} : { ownerId: req.user.id }) }, attributes: ['id'] })
    const where = { [Op.or]: [{ sourceId: sources.map(s => s.id) }, { 'payload.documentId': { [Op.in]: documents.map(d => d.id) } }] }
    if (req.query.state) where.state = req.query.state
    if (typeof req.query.documentId === 'string') where['payload.documentId'] = req.query.documentId
    const result = await manager.models.knowledgeJob.findAndCountAll({ where, ...page(req), order: [['createdAt', 'DESC']] })
    res.json({ total: result.count, jobs: result.rows.map(jobJSON) })
  }))
  router.get('/jobs/:id', route(async (req, res) => res.json(jobJSON(await job(req)))))
  router.post('/jobs/:id/cancel', route(async (req, res) => res.json(jobJSON(await manager.queue.cancel(await job(req))))))
  router.post('/jobs/:id/retry', route(async (req, res) => {
    const value = await job(req)
    res.status(202).json(jobJSON(await manager.retryJob(value, req.body.acknowledgeUncertain === true)))
  }))
  return router
}
module.exports = router
module.exports.documentJSON = documentJSON
module.exports.jobJSON = jobJSON
