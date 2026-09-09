function signIn() {
    cy.visit('/sign-in')
    cy.get('input[name="username"]').type('smoke')
    cy.get('input[name="password"]').type('isolated-smoke-password', { log: false })
    cy.contains('button', 'Open my shelf').click()
    cy.get('.sidebar').should('exist')
}

describe('KnowledgeShelf browser workflows', () => {
    beforeEach(signIn)

    it('keeps audio playing and its position while navigating to documents', () => {
        cy.contains('.nav-link', 'Web integration library').first().click()
        cy.contains('.item-card', 'Web playback fixture').click()
        cy.intercept('POST', '/player/start').as('start')
        cy.get('[data-play][data-mode="audio"]').first().click()
        cy.wait('@start').its('response.statusCode').should('eq', 200)
        cy.get('#player').should('be.visible')
        cy.document().should((document) => {
            expect(document.documentElement.scrollWidth).to.be.at.most(document.documentElement.clientWidth)
        })
        cy.get('#shelf-media').should((element) => {
            expect(element[0].paused).to.equal(false)
            expect(element[0].currentTime).to.be.greaterThan(0)
        })
        cy.get('#shelf-media').then((element) => {
            const media = element[0]
            const position = media.currentTime
            cy.contains('.nav-link', 'Documents').click()
            cy.get('h1').should('contain', 'Documents')
            cy.get('#shelf-media').should((current) => {
                expect(current[0]).to.equal(media)
                expect(current[0].currentTime).to.be.at.least(position)
                expect(current[0].paused).to.equal(false)
            })
        })
        cy.screenshot('desktop-documents-with-player', { capture: 'viewport' })
    })

    it('prepares a document and shows a full editable preview', () => {
        cy.contains('.nav-link', 'Documents').click()
        cy.get('input[name="title"]').type('Browser-reviewed article')
        cy.get('select[name="libraryId"] option')
            .contains('Web integration library')
            .then((option) => {
                cy.get('select[name="libraryId"]').select(option.val())
            })
        cy.get('textarea[name="text"]').type('Keep the full document intact. A natural voice will read these words.')
        cy.contains('button', 'Prepare preview').click()
        cy.get('h1').should('contain', 'Browser-reviewed article')
        cy.get('textarea[name="text"]').should('have.value', 'Keep the full document intact. A natural voice will read these words.')
        cy.contains('ElevenLabs is not configured').should('be.visible')
        cy.document().should((document) => {
            expect(document.documentElement.scrollWidth).to.be.at.most(document.documentElement.clientWidth)
        })
        cy.screenshot('desktop-document-preview', { capture: 'viewport' })
    })

    it('fits a narrow screen and opens navigation without horizontal scrolling', () => {
        cy.viewport(390, 844)
        cy.get('[data-toggle-nav]').click()
        cy.contains('.nav-link', 'Documents').click()
        cy.get('h1').should('contain', 'Documents')
        cy.document().should((document) => {
            expect(document.documentElement.scrollWidth).to.be.at.most(390)
        })
        cy.screenshot('mobile-documents', { capture: 'viewport' })
    })

    it('opens a public listen after signing out and plays its audio', () => {
        const slug = `browser-listen-${Date.now()}`
        cy.contains('.nav-link', 'Web integration library').first().click()
        cy.contains('.item-card', 'Web playback fixture').click()
        cy.contains('summary', 'Organize & share').click()
        cy.get('input[name="slug"]').type(slug)
        cy.contains('button', 'Create share link').click()
        cy.contains('.notice', 'Share created').should('be.visible')
        cy.contains('button', 'Sign out').click()
        cy.visit(`/share/${slug}`)
        cy.get('[data-share-title]').should('contain', 'Web playback fixture')
        cy.get('[data-share-media]')
            .should('be.visible')
            .then((element) => element[0].play())
        cy.get('[data-share-media]').should((element) => {
            expect(element[0].currentTime).to.be.greaterThan(0)
        })
    })
})
