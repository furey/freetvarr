const BASE = (process.env.FREETVARR_URL || 'http://127.0.0.1:3801').replace(/\/$/, '')
const WANTED_ROWS = ['category-cooking', 'category-reality', 'category-home']
const ATTEMPTS = 60
const WAIT_MS = 2000

const sectionKeysNow = async () => {
  const reply = await fetch(`${BASE}/api/for-you`).catch(() => null)
  if (!reply?.ok) return []
  return ((await reply.json()).sections ?? []).map((section) => section.key)
}

const missingRowsOf = (keys) => WANTED_ROWS.filter((key) => !keys.includes(key))

const waitForRows = async () => {
  let keys = []
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    keys = await sectionKeysNow()
    if (!missingRowsOf(keys).length) return console.log(`[pack-server] For you rows ready: ${keys.join(', ')}`)
    await new Promise((resolve) => setTimeout(resolve, WAIT_MS))
  }
  throw new Error(`For you is missing ${missingRowsOf(keys).join(', ')}`)
}

await waitForRows()
