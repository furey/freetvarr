import { api } from '/shared/api.js'
import { poolRequestsOf } from '/hero-art.js'

const sessionImages = new Map()

export const heroArtPoolsFor = async (slides) => {
  const { showKeys, recordingIds } = poolRequestsOf(slides)
  const [shows, recordings] = await Promise.all([
    imagesByKey({ keys: showKeys, urlOf: (key) => `/api/library/shows/${encodeURIComponent(key)}/art-pool` }),
    imagesByKey({ keys: recordingIds, urlOf: (id) => `/api/library/recordings/${encodeURIComponent(id)}/art` }),
  ])
  return { shows, recordings }
}

const imagesByKey = async ({ keys, urlOf }) => Object.fromEntries(
  await Promise.all(keys.map(async (key) => [key, await imagesAt(urlOf(key))])),
)

const imagesAt = (url) => {
  if (!sessionImages.has(url)) {
    sessionImages.set(url, api('GET', url).then((body) => body.images ?? []).catch(() => []))
  }
  return sessionImages.get(url)
}
