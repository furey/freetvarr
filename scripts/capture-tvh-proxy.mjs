import http from 'node:http'

const upstream = new URL(process.env.TVH_UPSTREAM || 'http://127.0.0.1:9981')
const port = Number(process.env.TVH_PROXY_PORT || 9982)
const READ_PATH = /^\/(imagecache\/\d+|api\/serverinfo|api\/status\/[a-z]+|api\/[a-z_/]*\/(grid[a-z_]*|list|load|tree|class))$/

const isRead = (path) => READ_PATH.test(path)

const refuse = ({ req, res }) => {
  console.log(`[tvh-proxy] BLOCKED ${req.method} ${req.url}`)
  res.writeHead(403, { 'content-type': 'text/plain' })
  res.end('blocked by the read-only capture proxy')
}

const forward = ({ req, res }) => {
  const request = http.request({
    host: upstream.hostname,
    port: upstream.port || 80,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: upstream.host },
  }, (reply) => {
    res.writeHead(reply.statusCode, reply.headers)
    reply.pipe(res)
  })
  request.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'text/plain' })
    res.end(err.message)
  })
  req.pipe(request)
}

http.createServer((req, res) => (isRead(req.url.split('?')[0]) ? forward({ req, res }) : refuse({ req, res })))
  .listen(port, '127.0.0.1', () => console.log(`[tvh-proxy] read-only TVHeadend at http://127.0.0.1:${port} -> ${upstream.origin}`))
