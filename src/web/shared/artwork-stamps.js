import { ref, shallowReactive } from '/vendor/vue.esm-browser.prod.js'
import { artworkStamps, pictureOfShowImageUrl } from '/artwork-stamps.js'
import { showKeyOf } from '/show-key.js'
import { api } from '/shared/api.js'

export const artworkStampsVersion = ref(0)

artworkStamps.subscribe(() => { artworkStampsVersion.value += 1 })

export const stampedShowImage = (url, title = null) => {
  artworkStampsVersion.value
  return artworkStamps.stampUrl(url, title)
}

export const stampedSrcset = (srcset, title = null) => (srcset
  ? srcset.split(', ').map((part) => {
    const [url, ...descriptor] = part.split(' ')
    return [stampedShowImage(url, title), ...descriptor].join(' ')
  }).join(', ')
  : srcset)

export const rememberArtworkStamp = ({ key, kind, stamp }) => artworkStamps.setStamp({ key, kind, stamp })

export const loadArtworkStamps = async () => {
  const { stamps } = await api('GET', '/api/library/artwork-stamps')
  artworkStamps.replaceAll(stamps)
}

export const applyResolvedArt = (changes = []) => {
  artworkStamps.setStamps(changes.filter((change) => change.stamp))
  for (const { key, kind } of changes) {
    const id = pictureIdOf({ key, kind })
    forgetFinalMissesOf(id)
    resolvedTicks.set(id, (resolvedTicks.get(id) ?? 0) + 1)
  }
}

export const artResolvedTickOf = (picture) => resolvedTicks.get(pictureIdOf(pictureOf(picture))) ?? 0

export const episodePictureOf = (episode) => {
  if (episode?.image || !episode?.picture) return stampedShowImage(episode?.image || null, episode?.title)
  const picture = stampedShowImage(episode.picture, episode.title)
  const tick = artResolvedTickOf({ title: episode.title || '' })
  return tick ? `${picture}${picture.includes('?') ? '&' : '?'}r=${tick}` : picture
}

export const rememberFinalMiss = ({ url, title = '', shape = 'card' }) => {
  finalMisses.set(url, pictureIdOf(pictureOf({ url, title, shape })))
}

export const isFinalMiss = (url) => finalMisses.has(url)

export const forgetFinalMiss = (url) => finalMisses.delete(url)

export const forgetFinalMisses = () => finalMisses.clear()

const forgetFinalMissesOf = (id) => {
  for (const [url, missId] of finalMisses) if (missId === id) finalMisses.delete(url)
}

const pictureOf = ({ url = '', title = '', shape = 'card' }) =>
  pictureOfShowImageUrl(url) ?? { key: showKeyOf(title), kind: shape === 'poster' ? 'poster' : 'background' }

const pictureIdOf = ({ key, kind }) => `${kind}|${key}`

const finalMisses = new Map()

const resolvedTicks = shallowReactive(new Map())
