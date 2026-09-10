// Schema snapshot: do not depend on the current model implementations here.
async function up({ context: { queryInterface: qi } }) {
  const { STRING, TEXT, UUID, BOOLEAN, INTEGER, FLOAT, DATE, JSON } = qi.sequelize.Sequelize.DataTypes
  const required = type => ({ type, allowNull: false })
  const tables = {
    knowledgeSources: {
      id: { type: STRING, primaryKey: true }, name: required(STRING), url: required(TEXT), mode: required(STRING),
      libraryId: required(UUID), libraryFolderId: required(UUID), libraryItemId: UUID,
      enabled: { type: BOOLEAN, defaultValue: true }, intervalMinutes: { type: INTEGER, defaultValue: 360 },
      retentionDays: { type: INTEGER, defaultValue: 0 }, maxItems: { type: INTEGER, defaultValue: 20 },
      startDate: STRING, nextCheckAt: DATE, lastCheckedAt: DATE, lastError: TEXT, options: { type: JSON, defaultValue: {} }
    },
    knowledgeJobs: {
      id: { type: UUID, primaryKey: true }, key: { ...required(STRING), unique: true }, kind: required(STRING),
      ownerId: UUID, sourceId: STRING, state: { ...required(STRING), defaultValue: 'queued' },
      payload: { type: JSON, defaultValue: {} }, checkpoint: { type: JSON, defaultValue: {} }, result: JSON,
      progress: { type: FLOAT, defaultValue: 0 }, attempts: { type: INTEGER, defaultValue: 0 },
      error: TEXT, errorCode: STRING, retryAt: DATE, startedAt: DATE, finishedAt: DATE
    },
    knowledgeDocuments: {
      id: { type: UUID, primaryKey: true }, ownerId: required(UUID), title: required(STRING), author: STRING,
      sourceUrl: TEXT, originalName: STRING, originalPath: TEXT, format: STRING, text: TEXT,
      sections: { type: JSON, defaultValue: [] }, contentHash: STRING,
      state: { type: STRING, defaultValue: 'extracting' }, error: TEXT,
      libraryId: required(UUID), libraryFolderId: required(UUID), libraryItemId: UUID, generation: JSON
    },
    knowledgeAssets: {
      id: { type: STRING, primaryKey: true }, sourceId: STRING, documentId: UUID, externalId: required(STRING),
      libraryItemId: required(UUID), episodeId: UUID, root: required(TEXT), relativePath: required(TEXT),
      owned: { type: BOOLEAN, defaultValue: true }, available: { type: BOOLEAN, defaultValue: true },
      excluded: { type: BOOLEAN, defaultValue: false }, revision: STRING, metadata: { type: JSON, defaultValue: {} }
    }
  }
  for (const [table, columns] of Object.entries(tables)) {
    if (!(await qi.tableExists(table))) await qi.createTable(table, { ...columns, createdAt: required(DATE), updatedAt: required(DATE) })
  }
  for (const [table, fields, name, unique] of [
    ['knowledgeJobs', ['state', 'retryAt'], 'knowledge_jobs_state_retry_at', false],
    ['knowledgeAssets', ['sourceId', 'externalId'], 'knowledge_assets_source_id_external_id', true]
  ]) {
    if (!(await qi.showIndex(table)).some(index => index.name === name)) await qi.addIndex(table, fields, { name, unique })
  }
}
async function down() {
  throw new Error('Restore a pre-KnowledgeShelf backup to downgrade; removing job checkpoints can repeat paid narration requests.')
}
module.exports = { up, down }
