const express = require('express')
const ShareController = require('../controllers/ShareController')
const SessionController = require('../controllers/SessionController')

class PublicRouter {
  constructor(playbackSessionManager) {
    /** @type {import('../managers/PlaybackSessionManager')} */
    this.playbackSessionManager = playbackSessionManager

    this.router = express()
    this.router.disable('x-powered-by')
    this.init()
  }

  init() {
    this.router.get('/share/:slug', ShareController.getMediaItemShareBySlug.bind(this))
    this.router.get('/share/:slug/track/:index', ShareController.getMediaItemShareAudioTrack.bind(this))
    this.router.get('/share/:slug/cover', ShareController.getMediaItemShareCoverImage.bind(this))
    this.router.get('/share/:slug/download', ShareController.downloadMediaItemShare.bind(this))
    this.router.patch('/share/:slug/progress', ShareController.updateMediaItemShareProgress.bind(this))
    this.router.get('/session/:id/track/:index', SessionController.getTrack.bind(this))
    this.router.get('/session/:id/video', async (req, res) => {
      const session = this.playbackSessionManager.getSession(req.params.id)
      if (!session?.videoEpisode || session.playbackMedia?.mode !== 'video') return res.sendStatus(404)
      try {
        const path = await require('../managers/VideoPodcastManager').validateSource(session.videoEpisode, 'video')
        if (this.playbackSessionManager.getSession(session.id) !== session) return res.sendStatus(410)
        session.updatedAt = Date.now()
        session.videoResponses ||= new Set()
        session.videoResponses.add(res)
        res.once('close', () => session.videoResponses.delete(res))
        res.set('Cache-Control', 'private, no-store')
        res.type('video/mp4')
        if (global.XAccel) {
          const { encodeUriPath } = require('../utils/fileUtils')
          return res.status(204).header('X-Accel-Redirect', encodeUriPath(global.XAccel + path)).send()
        }
        res.sendFile(path)
      } catch (error) { if (!res.headersSent) res.status(error.status || 500).json({ error: error.message }) }
    })
  }
}
module.exports = PublicRouter
