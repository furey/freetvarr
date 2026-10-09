import http from 'node:http'

export const startLoopback = ({ target }) => new Promise((resolve) => {
  const upstream = new URL(target)
  const server = http.createServer((request, response) => {
    if (!READ_METHODS.has(request.method)) return refuseWrite({ request, response })
    forwardRead({ upstream, request, response })
  })
  server.on('connection', (socket) => socket.unref())
  server.listen(0, '127.0.0.1', () => {
    server.unref()
    resolve(`http://127.0.0.1:${server.address().port}`)
  })
})

const READ_METHODS = new Set(['GET', 'HEAD'])

const forwardRead = ({ upstream, request, response }) => {
  const forwarded = http.request({
    host: upstream.hostname,
    port: upstream.port || 80,
    path: request.url,
    method: request.method,
    headers: { ...request.headers, host: upstream.host },
  }, (reply) => {
    response.writeHead(reply.statusCode, reply.headers)
    reply.pipe(response)
  })
  forwarded.on('error', () => {
    if (!response.headersSent) response.writeHead(502)
    response.end()
  })
  forwarded.end()
}

const refuseWrite = ({ request, response }) => {
  console.log(`  SERVER WRITE refused at loopback: ${request.method} ${request.url}`)
  response.writeHead(405)
  response.end()
}
