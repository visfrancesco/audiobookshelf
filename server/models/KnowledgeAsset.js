const { DataTypes: T, Model } = require('sequelize')

class KnowledgeAsset extends Model {
  static init(sequelize) {
    super.init({
      id: { type: T.STRING, primaryKey: true },
      sourceId: T.STRING,
      documentId: T.UUID,
      externalId: { type: T.STRING, allowNull: false },
      libraryItemId: { type: T.UUID, allowNull: false },
      episodeId: T.UUID,
      root: { type: T.TEXT, allowNull: false },
      relativePath: { type: T.TEXT, allowNull: false },
      owned: { type: T.BOOLEAN, defaultValue: true },
      available: { type: T.BOOLEAN, defaultValue: true },
      excluded: { type: T.BOOLEAN, defaultValue: false },
      revision: T.STRING,
      metadata: { type: T.JSON, defaultValue: {} }
    }, { sequelize, modelName: 'knowledgeAsset', indexes: [{ unique: true, fields: ['sourceId', 'externalId'] }] })
  }
}
module.exports = KnowledgeAsset
