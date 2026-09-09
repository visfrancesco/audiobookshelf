const { expect } = require('chai')
const { WebTickets } = require('../../../server/knowledge/WebTickets')
describe('KnowledgeShelf scoped browser delivery', () => {
  it('binds links to one GET path, user, signature and expiry', () => {
    let now = 1
    const tickets = new WebTickets(Buffer.from('test-secret'), () => now)
    const path = '/items/item-id/cover'
    const token = tickets.issue('user-id', path)
    expect(tickets.verify(token, path)).to.equal('user-id')
    expect(() => tickets.verify(token, '/items/other-id/cover')).to.throw()
    expect(() => tickets.verify(token + 'tampered', path)).to.throw()
    expect(() => tickets.issue('user-id', '/backups/backup-id/apply')).to.throw()
    expect(() => tickets.issue('user-id', '/users')).to.throw()
    now += 600001
    expect(() => tickets.verify(token, path)).to.throw('expired')
  })
})
