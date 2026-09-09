const { DataTypes: T, Model } = require('sequelize')

class KnowledgeDocument extends Model {
  static init(sequelize) {
    super.init({
      id: { type: T.UUID, primaryKey: true, defaultValue: T.UUIDV4 },
      ownerId: { type: T.UUID, allowNull: false },
      title: { type: T.STRING, allowNull: false },
      author: T.STRING,
      sourceUrl: T.TEXT,
      originalName: T.STRING,
      originalPath: T.TEXT,
      format: T.STRING,
      text: T.TEXT,
      sections: { type: T.JSON, defaultValue: [] },
      contentHash: T.STRING,
      state: { type: T.STRING, defaultValue: 'extracting' },
      error: T.TEXT,
      libraryId: { type: T.UUID, allowNull: false },
      libraryFolderId: { type: T.UUID, allowNull: false },
      libraryItemId: T.UUID,
      generation: T.JSON
    }, { sequelize, modelName: 'knowledgeDocument' })
  }
}
module.exports = KnowledgeDocument
