import { db } from './db.js'
import { isSameShowTitle } from './autorec-match.js'
import { showKeyOf } from './web/show-key.js'

export const variantTitlesOf = ({ title, titleIndex = new Map(), chosen = [], inScope = () => true }) => {
  const byKey = new Map()
  const entryOf = (text) => {
    const key = text.toLowerCase()
    if (!byKey.has(key)) byKey.set(key, { title: text, upcoming: 0, enabled: false })
    return byKey.get(key)
  }
  for (const variant of chosen) entryOf(variant).enabled = true
  for (const [key, listed] of titleIndex) {
    const isChosen = byKey.has(key)
    if (!isChosen && !isVariantTitle({ title, candidate: listed.title })) continue
    const upcoming = listed.airings.filter(inScope).length
    if (upcoming || isChosen) entryOf(listed.title).upcoming += upcoming
  }
  return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title))
}

export const guideTitleIndexOf = ({ airings = [], nowMs = Date.now() }) => {
  const index = new Map()
  for (const airing of airings) {
    const text = String(airing.title ?? '').trim()
    if (!text || airing.end <= nowMs) continue
    const key = text.toLowerCase()
    if (!index.has(key)) index.set(key, { title: text, airings: [] })
    index.get(key).airings.push(airing)
  }
  return index
}

export const isVariantTitle = ({ title, candidate }) => {
  const series = String(title ?? '').trim().toLowerCase()
  const other = String(candidate ?? '').trim().toLowerCase()
  if (!series || !other || series === other || isSameShowTitle({ title: other, show: series })) return false
  return endsWithVariantWord({ longer: other, shorter: series }) || endsWithVariantWord({ longer: series, shorter: other })
}

export const loadTitleVariants = async () => {
  const variants = new Map()
  for (const row of await db('series_title_variants').orderBy('id')) {
    if (!variants.has(row.series_key)) variants.set(row.series_key, [])
    variants.get(row.series_key).push(row.title)
  }
  return variants
}

export const chosenVariantsOf = ({ variants = new Map(), title }) => variants.get(showKeyOf(title)) ?? []

export const variantsForTitle = async (title) => chosenVariantsOf({ variants: await loadTitleVariants(), title })

export const withTitleVariants = ({ shows = [], variants = new Map() }) =>
  shows.map((show) => ({ ...show, title_variants: chosenVariantsOf({ variants, title: show.show_pattern }) }))

export const nextVariantsOf = ({ current = [], variant, enabled }) => {
  const others = current.filter((title) => title.toLowerCase() !== variant.toLowerCase())
  return enabled ? [...others, variant] : others
}

export const saveTitleVariants = async ({ title, variants }) => {
  const seriesKey = showKeyOf(title)
  await db.transaction(async (trx) => {
    await trx('series_title_variants').where({ series_key: seriesKey }).delete()
    if (variants.length) {
      await trx('series_title_variants').insert(variants.map((variant) => ({ series_key: seriesKey, title: variant })))
    }
  })
  return variants
}

const endsWithVariantWord = ({ longer, shorter }) =>
  longer.startsWith(`${shorter} `) && VARIANT_WORD.test(longer.slice(shorter.length + 1))

const VARIANT_WORD = /^(australia|au|aus|nz|new zealand|aotearoa|encore|(19|20)\d{2})$/
