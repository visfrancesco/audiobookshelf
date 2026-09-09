const { spawn } = require('child_process')
const { problem, checkAbort, cancelled } = require('./errors')

function run(command, args, { signal, cwd, timeout = 120000, maxBytes = 8 * 1024 ** 2, onLine } = {}) {
  if (command === 'ffmpeg') command = process.env.FFMPEG_PATH || command
  if (command === 'pdftotext') command = process.env.PDFTOTEXT_PATH || command
  checkAbort(signal)
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
    let stdout = '', stderr = '', lineBuffer = '', failure
    const kill = () => {
      try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL') } catch (_) {}
    }
    const abort = () => { failure = cancelled(); kill() }
    const timer = setTimeout(() => { failure = problem('Media operation timed out', 504, 'process_timeout'); kill() }, timeout)
    signal?.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
      if (Buffer.byteLength(stdout) > maxBytes) { failure = problem('Media operation exceeded its output limit', 413); kill(); return }
      if (onLine) {
        lineBuffer += chunk.toString()
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop()
        for (const line of lines) {
          try { onLine(line) } catch (error) { failure = error; kill(); break }
        }
      }
    })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000) })
    child.once('error', error => { failure = problem(error.code === 'ENOENT' ? `${command} is not installed` : 'Could not start media operation', 503, 'tool_unavailable') })
    child.once('close', code => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (failure) return reject(failure)
      if (code !== 0) return reject(problem(`Media operation failed: ${stderr.replace(/https?:\/\/\S+/g, '[remote URL]').slice(-1000)}`, 502, 'process_failed'))
      resolve({ stdout, stderr })
    })
    if (signal?.aborted) abort()
  })
}
module.exports = { run }
