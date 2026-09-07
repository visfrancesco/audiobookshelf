async function up({ context: { queryInterface } }) {
  const { JSON, STRING, UUID, TEXT, INTEGER, DATE } = queryInterface.sequelize.Sequelize.DataTypes
  if (await queryInterface.tableExists('podcastEpisodes')) {
    const columns = await queryInterface.describeTable('podcastEpisodes')
    if (!columns.videoSource) await queryInterface.addColumn('podcastEpisodes', 'videoSource', { type: JSON, allowNull: true })
  }
  if (!(await queryInterface.tableExists('videoImports'))) {
    await queryInterface.createTable('videoImports', {
      id: { type: STRING, primaryKey: true }, libraryItemId: { type: UUID, allowNull: false }, episodeId: UUID,
      manifest: JSON, state: { type: STRING, allowNull: false, defaultValue: 'queued' }, error: TEXT,
      attempts: { type: INTEGER, defaultValue: 0 }, retryAt: DATE,
      createdAt: { type: DATE, allowNull: false }, updatedAt: { type: DATE, allowNull: false }
    })
  }
}

async function down() {
  // Imported episodes have no audioFile and cannot safely be read by an older
  // binary. Require an explicit export/removal before downgrading this database.
  throw new Error('Video podcast databases require export and removal of video episodes before downgrading. Restore the pre-upgrade database backup instead.')
}
module.exports = { up, down }
