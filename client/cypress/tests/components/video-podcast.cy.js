import EpisodeRow from '../../../components/tables/podcast/LazyEpisodeRow.vue'
import LocalAudioPlayer from '../../../players/LocalAudioPlayer'

const episode = { id: 'video-1', title: 'How to Dominate for Decades', description: 'Doug Leone, Sequoia Capital', duration: 4937, audioFile: null, videoSource: { watchAvailable: true, available: true }, chapters: [] }
const store = {
  state: { streamIsPlaying: false },
  getters: {
    'user/getUserMediaProgress': () => null,
    getServerSetting: () => 'dd/MM/yyyy',
    getIsMediaStreaming: () => false,
    getIsMediaQueued: () => false
  }
}
const stubs = ['widgets-podcast-type-indicator', 'ui-tooltip', 'ui-icon-btn', 'ui-read-icon-btn', 'ui-checkbox']

describe('Video podcasts', () => {
  it('shows Listen and Watch with a null audio file and opens the selected mode', () => {
    const emit = cy.stub().as('emit')
    cy.viewport(800, 350)
    cy.mount(EpisodeRow, { propsData: { episode, libraryItemId: 'podcast', index: 0, sortKey: 'audioFile.metadata.filename' }, mocks: { $store: store, $eventBus: { $emit: emit } }, stubs })
    cy.contains('Listen').should('be.visible')
    cy.contains('button', 'Watch').click()
    cy.get('@emit').should('have.been.calledWith', 'play-item', { libraryItemId: 'podcast', episodeId: 'video-1', mode: 'video' })
    cy.contains('button', 'Listen').click()
    cy.get('@emit').should('have.been.calledWith', 'play-item', { libraryItemId: 'podcast', episodeId: 'video-1', mode: 'audio' })
    cy.screenshot('video-episode-desktop')
  })

  it('disables Watch with a reason on mobile when the source is unsupported', () => {
    cy.viewport(390, 400)
    cy.mount(EpisodeRow, { propsData: { episode: { ...episode, videoSource: { watchAvailable: false, watchReason: 'Unsupported video codec' } }, libraryItemId: 'podcast', index: 0 }, mocks: { $store: store }, stubs })
    cy.contains('button', 'Watch').should('be.disabled').and('have.attr', 'title', 'Unsupported video codec')
    cy.contains('Listen').should('be.visible')
    cy.screenshot('video-episode-mobile')
  })

  it('moves the same media element between Watch and Listen without losing volume', () => {
    cy.document().then((document) => {
      // Player uses the spec window document, so give it a host there as well.
      const player = new LocalAudioPlayer({})
      const playerHost = player.player.ownerDocument.createElement('div')
      playerHost.id = 'video-player-host'
      player.player.ownerDocument.body.appendChild(playerHost)
      player.setVolume(0.35)
      const tracks = [{ relativeContentUrl: '', startOffset: 0, duration: 100 }]
      player.set({}, tracks, false, 15, false, 'video')
      expect(player.player.tagName).to.equal('VIDEO')
      expect(player.player.parentElement).to.equal(playerHost)
      expect(player.player.style.display).to.equal('block')
      player.set({}, tracks, false, 15, false, 'audio')
      expect(player.player.style.display).to.equal('none')
      expect(player.player.volume).to.equal(0.35)
      player.destroy()
      playerHost.remove()
    })
  })
})
