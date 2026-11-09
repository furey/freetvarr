import { ref, shallowReactive } from '/vendor/vue.esm-browser.prod.js'
import { artworkStamps, pictureOfShowImageUrl } from '/artwork-stamps.js'
import { showKeyOf } from '/show-key.js'
import { api } from '/shared/api.js'

export const artworkStampsVersion = ref(0)

artworkStamps.subscribe(() => { artworkStampsVersion.value += 1 })

export const stampedShowImage = (url) => {
  artworkStampsVersion.value
  return artworkStamps.stampUrl(url)
}

export const stampedSrcset = (srcset) => (srcset
  ? srcset.split(', ').map((part) => {
    const [url, ...descriptor] = part.split(' ')
    return [stampedShowImage(url), ...descriptor].join(' ')
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
    resolvedTicks.set(id, (resolvedTicks.get(id) ?? 0) + 1)
  }
}

export const artResolvedTickOf = ({ url = '', title = '', shape = 'card' }) => {
  const picture = pictureOfShowImageUrl(url) ?? { key: showKeyOf(title), kind: shape === 'poster' ? 'poster' : 'background' }
  return resolvedTicks.get(pictureIdOf(picture)) ?? 0
}

const pictureIdOf = ({ key, kind }) => `${kind}|${key}`

const resolvedTicks = shallowReactive(new Map())
