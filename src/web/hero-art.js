import { showKeyOf } from './show-key.js'

export const EPISODE_SLIDE_TYPES = new Set(['continue', 'new', 'up-next', 'recording', 'movie'])

export const pickDistinctArt = ({
  slides = [],
  pools = {},
  candidatesFor = (slide) => candidatesOf({ slide, pools }),
  identityOf = artIdentityFrom(pools),
}) => {
  const used = new Set()
  const placed = []
  const unplaceable = []
  for (const slide of slides) {
    const blocked = new Set([identityOf(placed.at(-1)?.image)])
    const image = choose({ candidates: candidatesFor(slide), blocked, used, identityOf })
    if (!image) {
      unplaceable.push(slide)
      continue
    }
    used.add(identityOf(image))
    placed.push({ slide, image })
  }
  const closed = closeWrap({ placed, candidatesFor, used, identityOf })
  return {
    slides: closed.placed.map(({ slide, image }) => ({ ...slide, art: { ...slide.art, image } })),
    unplaceable: [...unplaceable, ...closed.dropped],
  }
}

export const slideShowKeyOf = (slide) => slide.showKey ?? showKeyOf(slide.art?.title)

export const isEpisodeSlide = (slide) => Boolean(slide.recordingId) || EPISODE_SLIDE_TYPES.has(slide.type)

export const artUrlKeyOf = (url) => {
  if (!url) return ''
  const [path, query = ''] = String(url).toLowerCase().split('?')
  const params = new URLSearchParams(query)
  params.delete('w')
  params.sort()
  const rest = params.toString()
  return rest ? `${path}?${rest}` : path
}

export const candidatesOf = ({ slide, pools }) => {
  const showImages = pools.shows?.[slideShowKeyOf(slide)] ?? []
  const recordingImages = slide.recordingId ? pools.recordings?.[slide.recordingId] ?? [] : []
  const own = slide.art?.image ? [{ url: slide.art.image }] : []
  const byKind = (images, kind) => images.filter((image) => image.kind === kind)
  const ladder = isEpisodeSlide(slide)
    ? [
      recordingImages,
      byKind(showImages, 'episode'),
      own,
      byKind(showImages, 'background'),
      byKind(recordingImages, 'background'),
      byKind(showImages, 'poster'),
    ]
    : [
      byKind(showImages, 'background'),
      own,
      byKind(showImages, 'episode'),
      recordingImages,
      byKind(showImages, 'poster'),
    ]
  const ordered = slide.art?.chosen ? [own, ...ladder] : ladder
  return uniqueByIdentity({ urls: ordered.flat().map((image) => image.url), identityOf: artIdentityFrom(pools) })
}

export const artIdentityFrom = (pools = {}) => {
  const contentKeys = new Map()
  const images = [...Object.values(pools.shows ?? {}), ...Object.values(pools.recordings ?? {})].flat()
  for (const image of images) {
    if (image?.url && image.contentKey) contentKeys.set(artUrlKeyOf(image.url), `content:${image.contentKey}`)
  }
  return (url) => contentKeys.get(artUrlKeyOf(url)) ?? artUrlKeyOf(url)
}

const closeWrap = ({ placed, candidatesFor, used, identityOf }) => {
  const result = [...placed]
  const dropped = []
  while (result.length > 1 && identityOf(result.at(-1).image) === identityOf(result[0].image)) {
    const fixed = repick({ result, index: result.length - 1, candidatesFor, used, identityOf })
      || repick({ result, index: 0, candidatesFor, used, identityOf })
    if (fixed) return { placed: fixed, dropped }
    const removed = result.pop()
    used.delete(identityOf(removed.image))
    dropped.push(removed.slide)
  }
  return { placed: result, dropped }
}

const repick = ({ result, index, candidatesFor, used, identityOf }) => {
  const neighbours = [result.at(index - 1), result[(index + 1) % result.length], result[index]]
  const blocked = new Set(neighbours.map((entry) => identityOf(entry.image)))
  const { slide } = result[index]
  const image = choose({ candidates: candidatesFor(slide), blocked, used, identityOf })
  if (!image) return null
  return result.map((entry, at) => (at === index ? { slide, image } : entry))
}

const choose = ({ candidates, blocked, used, identityOf }) => {
  const open = candidates.filter((url) => !blocked.has(identityOf(url)))
  return open.find((url) => !used.has(identityOf(url))) ?? open[0] ?? null
}

const uniqueByIdentity = ({ urls, identityOf }) => {
  const seen = new Set()
  return urls.filter((url) => {
    if (!url) return false
    const identity = identityOf(url)
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}
