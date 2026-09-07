//
// node-ffprobe modified for audiobookshelf
// SOURCE: https://github.com/ListenerApproved/node-ffprobe
//

const spawn = require('child_process').spawn

module.exports = (function () {
  function doProbe(file, options = {}) {
    return new Promise((resolve, reject) => {
      let proc = spawn(module.exports.FFPROBE_PATH || 'ffprobe', ['-hide_banner', '-loglevel', 'fatal', '-show_error', '-show_format', '-show_streams', '-show_programs', '-show_chapters', '-show_private_data', '-print_format', 'json', file])
      let probeData = []
      let errData = []
      let outputBytes = 0
      const timeout = options.timeout && setTimeout(() => {
        proc.kill('SIGKILL')
        reject(new Error('Media probing timed out'))
      }, options.timeout)

      proc.stdout.setEncoding('utf8')
      proc.stderr.setEncoding('utf8')

      proc.stdout.on('data', function (data) {
        outputBytes += Buffer.byteLength(data)
        if (options.maxOutputBytes && outputBytes > options.maxOutputBytes) {
          proc.kill('SIGKILL')
          reject(new Error('Media probe output is too large'))
        } else probeData.push(data)
      })
      proc.stderr.on('data', function (data) { errData.push(data) })

      proc.on('error', err => reject(err))
      proc.on('close', () => {
        clearTimeout(timeout)
        try {
            resolve(JSON.parse(probeData.join('')))
        } catch (err) {
            reject(err);
        }
      })
    })
  }

  return doProbe
})()
