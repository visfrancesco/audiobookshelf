const { DataTypes: T, Model } = require('sequelize')

class KnowledgeJob extends Model {
  static init(sequelize) {
    super.init({
      id: { type: T.UUID, primaryKey: true, defaultValue: T.UUIDV4 },
      key: { type: T.STRING, allowNull: false, unique: true },
      kind: { type: T.STRING, allowNull: false },
      ownerId: T.UUID,
      sourceId: T.STRING,
      state: { type: T.STRING, allowNull: false, defaultValue: 'queued' },
      payload: { type: T.JSON, defaultValue: {} },
      checkpoint: { type: T.JSON, defaultValue: {} },
      result: T.JSON,
      progress: { type: T.FLOAT, defaultValue: 0 },
      attempts: { type: T.INTEGER, defaultValue: 0 },
      error: T.TEXT,
      errorCode: T.STRING,
      retryAt: T.DATE,
      startedAt: T.DATE,
      finishedAt: T.DATE
    }, { sequelize, modelName: 'knowledgeJob', indexes: [{ fields: ['state', 'retryAt'] }] })
  }
}
module.exports = KnowledgeJob
