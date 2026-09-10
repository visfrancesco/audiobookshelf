const { expect } = require('chai')
const { Sequelize } = require('sequelize')
const fs = require('fs/promises')
const Path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const Database = require('../../../server/Database')

async function rejects(action, message) {
  let caught
  try { await action() } catch (error) { caught = error }
  expect(caught, 'operation should reject').to.be.instanceOf(Error)
  if (message) expect(caught.message).to.include(message)
  return caught
}
async function fixture() {
  const previous = { database: Database.sequelize, metadata: global.MetadataPath, settings: global.ServerSettings, databaseSettings: Database.serverSettings }
  const directory = await fs.mkdtemp(Path.join(os.tmpdir(), 'knowledge-test-'))
  global.MetadataPath = directory
  global.ServerSettings = { sortingPrefixes: ['the', 'a', 'an'], storeMetadataWithItem: false, metadataFileFormat: 'json', scannerPreferAudioMetadata: true }
  Database.serverSettings = { ...global.ServerSettings, scannerFindCovers: false }
  const database = new Sequelize({ dialect: 'sqlite', storage: Path.join(directory, 'db.sqlite'), logging: false })
  database.uppercaseFirst = value => value.charAt(0).toUpperCase() + value.slice(1)
  Database.sequelize = database
  await Database.buildModels(true)
  const libraries = {}
  for (const mediaType of ['book', 'podcast']) {
    const library = await Database.models.library.create({ name: mediaType, mediaType, settings: Database.models.library.getDefaultLibrarySettingsForMediaType(mediaType) })
    const path = Path.join(directory, mediaType)
    await fs.mkdir(path)
    const folder = await Database.models.libraryFolder.create({ libraryId: library.id, path })
    libraries[mediaType] = { library, folder }
  }
  const user = await Database.models.user.create({ username: 'reader', type: 'root', isActive: true, bookmarks: [], extraData: {}, permissions: { accessAllLibraries: true, accessAllTags: true, upload: true } })
  return { directory, database, libraries, user, models: Database.models,
    async close() {
      await database.close()
      Database.sequelize = previous.database
      global.MetadataPath = previous.metadata
      global.ServerSettings = previous.settings
      Database.serverSettings = previous.databaseSettings
      await fs.rm(directory, { recursive: true, force: true })
    } }
}
function media(path, video = false) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...(video ? ['-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10'] : []),
    '-f', 'lavfi', '-i', 'sine=sample_rate=44100', '-t', '0.3', ...(video ? ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'] : []), path])
}
async function drain(queue) {
  for (let i = 0; i < 20; i++) {
    await queue.tick()
    if (!queue.active.size) return
    await Promise.all([...queue.active.values()].map(entry => entry.promise))
  }
  throw new Error('Queue did not drain')
}
module.exports = { rejects, fixture, media, drain }
