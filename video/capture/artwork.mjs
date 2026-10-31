import { readFile } from 'node:fs/promises'
const BASE = 'http://127.0.0.1:3857'
const HD = new URL('../stack/host/hd/', import.meta.url).pathname
const PICK = {
  'big-wave-season': 'surf-b', 'kitchen-heat': '1666', 'wild-neighbours': '4276', 'the-weekend-garden': '1891',
  'mountain-rangers': '4115', 'road-trip-rules': '4368', 'lighthouse-at-dusk': '1567',
}
const t = await fetch(`${BASE}/api/csrf-token`)
const cookie = (t.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')
const { token } = await t.json()
for (const [key, img] of Object.entries(PICK)) {
  for (const kind of ['background', 'poster']) {
    const r = await fetch(`${BASE}/api/library/shows/${key}/artwork/${kind}/uploads`, {
      method: 'POST', headers: { 'content-type': 'image/jpeg', 'x-csrf-token': token, cookie }, body: await readFile(`${HD}${img}.jpg`),
    })
    console.log(key, kind, r.status, (await r.text()).slice(0, 120))
  }
}
