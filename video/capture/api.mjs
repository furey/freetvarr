const BASE = process.env.FTV_URL || 'http://127.0.0.1:3857'
export const call = async (method, path, body) => {
  const t = await fetch(`${BASE}/api/csrf-token`)
  const cookie = (t.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')
  const { token } = await t.json()
  const r = await fetch(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', 'x-csrf-token': token, cookie }, body: body ? JSON.stringify(body) : undefined,
  })
  return { status: r.status, body: await r.text() }
}
if (process.argv[2]) console.log(await call(process.argv[2], process.argv[3], process.argv[4] ? JSON.parse(process.argv[4]) : undefined))
