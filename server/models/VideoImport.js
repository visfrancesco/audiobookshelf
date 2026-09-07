const { DataTypes, Model } = require('sequelize')

class VideoImport extends Model {
  static init(sequelize) {
    super.init({
      id: { type: DataTypes.STRING, primaryKey: true },
      libraryItemId: { type: DataTypes.UUID, allowNull: false },
      episodeId: DataTypes.UUID,
      manifest: DataTypes.JSON,
      state: { type: DataTypes.STRING, allowNull: false, defaultValue: 'queued' },
      error: DataTypes.TEXT,
      attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
      retryAt: DataTypes.DATE
    }, { sequelize, modelName: 'videoImport' })
  }
}
module.exports = VideoImport
