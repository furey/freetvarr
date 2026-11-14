import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { createCategoryIndex, mostSpecificCategoryOf, tagsForTitles, titleFactsOf } from '../src/for-you-categories.js'
import { hasStrongDocumentaryEvidence } from '../src/for-you-label-rules.js'
import { genreTagsLookupOf } from '../src/for-you.js'
import { genreTagsOfTvmaze } from '../src/genre-enrichment.js'
import { createDisplayKinds } from '../src/display-kind.js'
import { showKeyOf } from '../src/web/show-key.js'

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/category-audit.json', import.meta.url), 'utf8'))
const NOW = Date.UTC(2026, 10, 14, 0, 0)
const HOUR = 60 * 60 * 1000
const FORMATS = new Set(['reality', 'quiz', 'comedy', 'drama', 'crime-drama', 'documentaries', 'talk-shows', 'kids', 'news'])
const KIND_BUG_TITLES = ['aria-awards-2026', 'eurovision-song-contest-asia', 'interview-with-the-vampire']

const recordOf = (entry) => {
  if (entry.tvmaze) {
    return {
      genreTags: genreTagsOfTvmaze({ genres: entry.tvmaze.genres ?? [], type: entry.tvmaze.type ?? null }),
      genres: [
        ...(entry.tvmaze.genres ?? []),
        ...(entry.tvmaze.type ? [`type:${entry.tvmaze.type}`] : []),
        ...(entry.wikidata?.genres ?? []).map((genre) => `wd:${genre}`),
        ...countryTokensOf(entry),
      ],
      source: 'tvmaze:1',
    }
  }
  if (entry.filmGenres.length) return { genreTags: ['movie', ...entry.filmGenres], genres: [], source: 'wikidata:Q1' }
  if (entry.wikidata) return { genreTags: [], genres: [...entry.wikidata.genres.map((genre) => `wd:${genre}`), ...countryTokensOf(entry)], source: 'wikidata:Q1' }
  return null
}

const countryTokensOf = (entry) => {
  const country = entry.tvmaze?.country ?? entry.wikidata?.countries?.[0]
  return country ? [`country:${country}`] : []
}

const tagFixture = ({ knownShows }) => {
  const channelIds = new Map()
  const channelIdOf = (name) => {
    if (!channelIds.has(name)) channelIds.set(name, String(channelIds.size + 1))
    return channelIds.get(name)
  }
  const programmes = fixture.titles.flatMap((entry) => entry.airings.map((airing, i) => ({
    program_id: `${entry.key}-${i}`,
    title: entry.title,
    channel_id: channelIdOf(airing.channel),
    start: NOW + i * 6 * HOUR,
    end: NOW + i * 6 * HOUR + airing.minutes * 60_000,
    genre: airing.genre,
    episode_title: airing.episode ? 'An episode' : null,
  })))
  const records = new Map(fixture.titles.map((entry) => [showKeyOf(entry.title), recordOf(entry)]).filter(([, record]) => record))
  const kindOf = createDisplayKinds({ programmes, recordsByKey: records })
  const shown = programmes.map((programme) => ({ ...programme, kind: kindOf(programme) }))
  const airings = new Map()
  for (const programme of shown) airings.set(showKeyOf(programme.title), (airings.get(showKeyOf(programme.title)) || 0) + 1)
  const genreTagsOf = genreTagsLookupOf({ records, airings })
  const guide = new Map(fixture.titles.map((entry) => [entry.title, entry.guide]))
  const titles = titleFactsOf({
    programmes: shown,
    keyOf: showKeyOf,
    genreTagsOf,
    recordOf: (key) => records.get(key),
    channelNames: new Map([...channelIds].map(([name, id]) => [id, name])),
    guideGenresOf: (title) => guide.get(title) ?? [],
    isFilm: (programme) => programme.kind === 'movie' || genreTagsOf(programme).includes('movie'),
    hourOf: () => 20,
  })
  const index = createCategoryIndex({ country: fixture.country, ...(knownShows === false && { knownShows: { shows: {} } }) })
  const tags = tagsForTitles({ index, titles, vectorsByHash: null })
  return { titles, tags: new Map(fixture.titles.map((entry) => [entry.key, tags.get(showKeyOf(entry.title))])) }
}

const shareOf = (hits, total) => Math.round((hits / total) * 1000) / 10

const accuracyOf = (tagged) => {
  const scored = fixture.titles.filter((entry) => !entry.film && entry.truth && entry.airings.length)
  const right = scored.filter((entry) => entry.truth.includes(mostSpecificCategoryOf(tagged.tags.get(entry.key))))
  return { right: right.length, total: scored.length, share: shareOf(right.length, scored.length) }
}

const formatAccuracyOf = (tagged) => {
  const pairs = fixture.titles
    .filter((entry) => !entry.film && entry.truth?.some((key) => FORMATS.has(key)))
    .map((entry) => ({ entry, format: tagged.tags.get(entry.key)?.entries.find((tag) => tag.slot === 'format')?.group }))
    .filter(({ format }) => format)
  const right = pairs.filter(({ entry, format }) => entry.truth.includes(format))
  return { right: right.length, total: pairs.length, share: shareOf(right.length, pairs.length) }
}

const listOn = tagFixture({ knownShows: true })
const listOff = tagFixture({ knownShows: false })

test('audit: the most specific category is in the truth set for at least 97% of titles with the known-shows list', (t) => {
  const { right, total, share } = accuracyOf(listOn)
  t.diagnostic(`list on: ${right} of ${total} (${share}%)`)
  assert.ok(share >= 97, `${share}% is under 97%`)
})

test('audit: the most specific category is in the truth set for at least 75% of titles with rules and genres only', (t) => {
  const { right, total, share } = accuracyOf(listOff)
  t.diagnostic(`list off: ${right} of ${total} (${share}%)`)
  assert.ok(share >= 75, `${share}% is under 75%`)
})

test('audit: the format matches the truth for at least 85% of titles where both have one, with rules and genres only', (t) => {
  const { right, total, share } = formatAccuracyOf(listOff)
  t.diagnostic(`format, list off: ${right} of ${total} (${share}%)`)
  assert.ok(share >= 85, `${share}% is under 85%`)
})

test('audit: no sitcom is Crime drama, Shark Tank is not Fishing, and no game show is Shopping', () => {
  for (const tagged of [listOn, listOff]) {
    const groupsOf = (key) => tagged.tags.get(key)?.entries.map((entry) => entry.group) ?? []
    const sitcoms = fixture.titles.filter((entry) => entry.truth?.includes('comedy') && entry.truth.filter((key) => FORMATS.has(key)).length === 1)
    assert.deepEqual(sitcoms.filter((entry) => groupsOf(entry.key).includes('crime-drama')).map((entry) => entry.title), [])
    assert.ok(!groupsOf('shark-tank').includes('fishing'))
    const gameShows = fixture.titles.filter((entry) => entry.truth?.includes('quiz'))
    assert.deepEqual(gameShows.filter((entry) => groupsOf(entry.key).includes('shopping')).map((entry) => entry.title), [])
  }
})

test('audit: ARIA Awards, Eurovision Song Contest Asia and Interview with the Vampire are not films', () => {
  for (const key of KIND_BUG_TITLES) assert.notEqual(listOff.tags.get(key).kind, 'film', key)
  assert.ok(listOff.tags.get('aria-awards-2026').entries.some((entry) => entry.group === 'music-arts'))
})

test('audit: Documentaries never comes from the TVmaze type alone', () => {
  const documentaries = fixture.titles.filter((entry) => listOff.tags.get(entry.key)?.entries.some((tag) => tag.group === 'documentaries'))
  const weak = documentaries.filter((entry) => !hasStrongDocumentaryEvidence({ wikidataGenres: entry.wikidata?.genres ?? [], guideGenres: entry.guide, genre: entry.genre, country: fixture.country }))
  assert.deepEqual(weak.map((entry) => entry.title), [])
})

test('audit: Life in Australia is at most 5% of tagged titles', (t) => {
  for (const [name, tagged] of [['list on', listOn], ['list off', listOff]]) {
    const labelled = [...tagged.tags.values()].filter((tags) => tags?.entries.length)
    const local = labelled.filter((tags) => tags.entries.some((entry) => entry.group === 'local-life'))
    t.diagnostic(`${name}: ${local.length} of ${labelled.length} (${shareOf(local.length, labelled.length)}%)`)
    assert.ok(local.length / labelled.length <= 0.05, name)
  }
})
