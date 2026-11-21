import { artKindHintOf, showImageUrlOf } from '/artwork-stamps.js'
import { rememberArtworkStamp, stampedShowImage } from '/shared/artwork-stamps.js'
import { librarySummaryOf } from '/shared/library-store.js'

export const HERO_ART_WIDTH = 768

export const heroArtUrlOf = ({ title, kind }) => stampedShowImage(showImageUrlOf({ title, width: HERO_ART_WIDTH, kind: artKindHintOf(kind) }))

export const rememberShowStamps = (show) => ['background', 'poster'].forEach((kind) =>
  rememberArtworkStamp({ key: show.key, kind, stamp: show.artworkStamps?.[kind] ?? null }))

export const preloadShowHeroArt = (showKey) => {
  const summary = librarySummaryOf(showKey)
  if (!summary) return
  rememberShowStamps(summary)
  const url = heroArtUrlOf(summary)
  if (preloaded.has(url)) return
  preloaded.add(url)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
}

const preloaded = new Set()
