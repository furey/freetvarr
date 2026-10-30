import http from 'node:http'
import { readFile } from 'node:fs/promises'

export const startLoopback = ({ target }) => new Promise((resolve) => {
  const upstream = new URL(target)
  const routes = []
  const server = http.createServer(async (request, response) => {
    const base = `http://127.0.0.1:${server.address().port}`
    const handled = routes.length > 0 && await dispatch({ routes, upstream, base, request, response })
    if (handled) return
    if (!isReadOnly(request)) return refuseWrite({ request, response })
    forwardRead({ upstream, request, response })
  })
  server.on('connection', (socket) => socket.unref())
  server.listen(0, '127.0.0.1', () => {
    server.unref()
    const base = `http://127.0.0.1:${server.address().port}`
    ROUTERS.set(base, {
      route: (pattern, handler) => { routes.push({ matches: matcherOf(pattern), handler }) },
      reset: () => { routes.length = 0 },
    })
    resolve(base)
  })
})

export const loopbackRouterOf = (base) => ROUTERS.get(base) ?? null

const ROUTERS = new Map()
const READ_METHODS = new Set(['GET', 'HEAD'])
const READ_ONLY_POSTS = new Set(['/api/library/delete/preview'])
const UNSENDABLE_HEADERS = ['content-length', 'content-encoding', 'transfer-encoding', 'connection']

const isReadOnly = (request) => READ_METHODS.has(request.method) || READ_ONLY_POSTS.has(request.url.split('?')[0])

const matcherOf = (pattern) => {
  if (pattern instanceof RegExp) return (url) => pattern.test(url)
  const source = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
  const regex = new RegExp(`^${source}$`)
  return (url) => regex.test(url)
}

const dispatch = async ({ routes, upstream, base, request, response }) => {
  const url = `${base}${request.url}`
  const body = await bodyOf(request)
  for (const { matches, handler } of [...routes].reverse()) {
    if (!matches(url)) continue
    const route = routeOf({ upstream, url, request, body, response })
    await handler(route)
    if (!['fallback', null].includes(route.outcome())) return true
  }
  return false
}

const bodyOf = (request) => new Promise((resolve) => {
  const chunks = []
  request.on('data', (chunk) => chunks.push(chunk))
  request.on('end', () => resolve(Buffer.concat(chunks)))
})

const routeOf = ({ upstream, url, request, body, response }) => {
  let outcome = null
  const settle = (value) => { outcome = value }
  const requestView = {
    url: () => url,
    method: () => request.method,
    headers: () => request.headers,
    postData: () => (body.length ? body.toString() : null),
    postDataJSON: () => (body.length ? JSON.parse(body.toString()) : null),
  }
  return {
    request: () => requestView,
    outcome: () => outcome,
    fallback: async () => settle('fallback'),
    abort: async () => {
      response.destroy()
      settle('abort')
    },
    continue: async () => {
      if (!isReadOnly(request)) refuseWrite({ request, response })
      else await sendUpstream({ upstream, request, body, response })
      settle('continue')
    },
    fetch: async ({ url: fetchUrl } = {}) => fetchUpstream({ upstream, url: fetchUrl ?? url, request, body }),
    fulfill: async (options) => {
      await sendReply({ res: response, ...options })
      settle('fulfill')
    },
  }
}

const fetchUpstream = async ({ upstream, url, request, body }) => {
  if (!isReadOnly(request)) throw new Error(`refused upstream ${request.method} ${request.url}`)
  const path = new URL(url).pathname + new URL(url).search
  const headers = { ...request.headers, host: upstream.host }
  delete headers['accept-encoding']
  const reply = await fetch(new URL(path, upstream), {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : body,
    redirect: 'manual',
  })
  const buffer = Buffer.from(await reply.arrayBuffer())
  const replyHeaders = Object.fromEntries(reply.headers.entries())
  return {
    status: () => reply.status,
    ok: () => reply.ok,
    headers: () => replyHeaders,
    body: async () => buffer,
    text: async () => buffer.toString(),
    json: async () => JSON.parse(buffer.toString()),
  }
}

const sendUpstream = async ({ upstream, request, body, response }) => {
  const reply = await fetchUpstream({ upstream, url: `http://x${request.url}`, request, body })
  await sendReply({ res: response, status: reply.status(), headers: reply.headers(), body: await reply.body() })
}

const sendReply = async ({ res, response = null, status, headers, contentType, body, path }) => {
  const finalBody = body ?? (path ? await readFile(path) : response ? await response.body() : '')
  const finalHeaders = { ...(headers ?? response?.headers() ?? {}) }
  for (const name of Object.keys(finalHeaders)) if (UNSENDABLE_HEADERS.includes(name.toLowerCase())) delete finalHeaders[name]
  if (contentType) finalHeaders['content-type'] = contentType
  res.writeHead(status ?? response?.status() ?? 200, finalHeaders)
  res.end(finalBody)
}

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
  request.pipe(forwarded)
}

const refuseWrite = ({ request, response }) => {
  console.log(`  SERVER WRITE refused at loopback: ${request.method} ${request.url}`)
  response.writeHead(405)
  response.end()
}
