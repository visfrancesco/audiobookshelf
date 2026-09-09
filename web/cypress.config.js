export default {
    e2e: {
        baseUrl: process.env.KNOWLEDGESHELF_BROWSER_URL || 'http://127.0.0.1:18937',
        specPattern: 'tests/Browser/**/*.cy.js',
        supportFile: false,
        setupNodeEvents(on) {
            on('before:browser:launch', (_browser, options) => {
                options.args.push('--autoplay-policy=no-user-gesture-required')
                return options
            })
        }
    },
    video: false,
    screenshotOnRunFailure: true,
    screenshotsFolder: 'tests/Browser/screenshots',
    defaultCommandTimeout: 15000,
    viewportWidth: 1280,
    viewportHeight: 720
}
