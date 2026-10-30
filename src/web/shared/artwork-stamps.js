import { ref } from '/vendor/vue.esm-browser.prod.js'
import { artworkStamps } from '/artwork-stamps.js'
import { api } from '/shared/api.js'

export const artworkStampsVersion = ref(0)

artworkStamps.subscribe(() => { artworkStampsVersion.value += 1 })

export const stampedShowImage = (url) => {
  artworkStampsVersion.value
  return artworkStamps.stampUrl(url)
}

export const rememberArtworkStamp = ({ key, kind, stamp }) => artworkStamps.setStamp({ key, kind, stamp })

export const loadArtworkStamps = async () => {
  const { stamps } = await api('GET', '/api/library/artwork-stamps')
  artworkStamps.replaceAll(stamps)
}
