const { DataTypes: T, Model } = require('sequelize')

class KnowledgeSource extends Model {
  static init(sequelize) {
    super.init({
      id: { type: T.STRING, primaryKey: true },
      name: { type: T.STRING, allowNull: false },
      url: { type: T.TEXT, allowNull: false },
      mode: { type: T.STRING, allowNull: false },
      libraryId: { type: T.UUID, allowNull: false },
      libraryFolderId: { type: T.UUID, allowNull: false },
      libraryItemId: T.UUID,
      enabled: { type: T.BOOLEAN, defaultValue: true },
      intervalMinutes: { type: T.INTEGER, defaultValue: 360 },
      retentionDays: { type: T.INTEGER, defaultValue: 0 },
      maxItems: { type: T.INTEGER, defaultValue: 20 },
      startDate: T.STRING,
      nextCheckAt: T.DATE,
      lastCheckedAt: T.DATE,
      lastError: T.TEXT,
      options: { type: T.JSON, defaultValue: {} }
    }, { sequelize, modelName: 'knowledgeSource' })
  }
}
module.exports = KnowledgeSource
