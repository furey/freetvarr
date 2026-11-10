import { db } from './db.js'
import { VARIANT_CANDIDATE } from './title-aliases.js'
import { isSameShowTitle } from './autorec-match.js'
import { showKeyOf } from './web/show-key.js'
import { countryTitleWordsOf, excludedEditionTagsOf, installCountry } from './title-countries.js'
import { titlesAgree } from './freeview-au.js'
import { showTitleKey } from './show-artwork.js'

export const variantTitlesOf = ({ title, titleIndex = new Map(), chosen = [], inScope = () => true, candidates = new Set() }) => {
  const byKey = new Map()
  const entryOf = (text) => {
    const key = text.toLowerCase()
    if (!byKey.has(key)) byKey.set(key, { title: text, upcoming: 0, enabled: false })
    return byKey.get(key)
  }
  for (const variant of chosen) entryOf(variant).enabled = true
  for (const [key, listed] of titleIndex) {
    const isChosen = byKey.has(key)
    if (!isChosen && !isOfferedTitle({ title, candidate: listed.title, candidates })) continue
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

export const isVariantTitle = ({ title, candidate, country = installCountry() }) => {
  const series = String(title ?? '').trim()
  const other = String(candidate ?? '').trim()
  if (!series || !other || series.toLowerCase() === other.toLowerCase()) return false
  if (isSameShowTitle({ title: other, show: series, excludedTags: excludedEditionTagsOf(country) })) return false
  const isVariantWord = variantWordTestOf(country)
  return endsWithVariantWord({ longer: other, shorter: series, isVariantWord })
    || endsWithVariantWord({ longer: series, shorter: other, isVariantWord })
}

export const isOfferedTitle = ({ title, candidate, candidates = new Set(), country = installCountry() }) =>
  isVariantTitle({ title, candidate, country }) || isCandidateVariant({ title, candidate, candidates, country })

export const isCandidateVariant = ({ title, candidate, candidates = new Set(), country = installCountry() }) => {
  const series = String(title ?? '').trim()
  const other = String(candidate ?? '').trim()
  if (!series || !other || series.toLowerCase() === other.toLowerCase() || !candidates.has(other.toLowerCase())) return false
  if (isSameShowTitle({ title: other, show: series, excludedTags: excludedEditionTagsOf(country) })) return false
  return titlesAgree(showTitleKey(other), showTitleKey(series))
}

export const loadVariantCandidates = async ({ database = db } = {}) => new Set(
  (await database('title_aliases').where({ kind: VARIANT_CANDIDATE }).pluck('source_title')).map((title) => String(title).trim().toLowerCase()),
)

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

const endsWithVariantWord = ({ longer, shorter, isVariantWord }) =>
  longer.toLowerCase().startsWith(`${shorter.toLowerCase()} `) && isVariantWord(longer.slice(shorter.length + 1))

const variantWordTestOf = (country) => {
  if (!variantWords.has(country)) variantWords.set(country, newVariantWordTest(country))
  return variantWords.get(country)
}

const newVariantWordTest = (country) => {
  const words = countryTitleWordsOf(country)
  const codes = new Set(words.filter(isCountryCode))
  const names = [...words.filter((word) => !isCountryCode(word)).map(escapedWordOf), 'encore', '(19|20)\\d{2}']
  const namePattern = new RegExp(`^(${names.join('|')})$`, 'i')
  return (word) => codes.has(word) || namePattern.test(word)
}

const isCountryCode = (word) => /^[A-Z]{2,3}$/.test(word)

const escapedWordOf = (word) => word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const variantWords = new Map()
