function problem(message, status = 400, code = 'invalid_request') {
  return Object.assign(new Error(message), { status, code })
}

function cancelled() { return problem('Job cancelled', 409, 'cancelled') }

function checkAbort(signal) {
  if (signal?.aborted) throw cancelled()
}

module.exports = { problem, cancelled, checkAbort }
