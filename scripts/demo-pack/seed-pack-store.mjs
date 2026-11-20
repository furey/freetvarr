import fs from 'node:fs/promises'

import { artworkUploads, prepareUpload } from '../../src/artwork-uploads.js'
import { db } from '../../src/db.js'
import { genreTagsOfTvmaze } from '../../src/genre-enrichment.js'
import { SERIES_RATINGS_PREFIX } from '../../src/top-rated.js'
import { showKeyOf } from '../../src/web/show-key.js'
import { MANIFEST_FILE, readJson, verifyCached } from './pack-lib.mjs'

const FAR_FUTURE_MS = Date.parse('2099-01-01T00:00:00Z')
const PICTURE_KINDS = [['background', 'backdrop'], ['poster', 'poster']]
const CURRENT_LOOKUP = 'lookup:2'
const ROW_GENRES = { cooking: 'Food', home: 'DIY' }
const LIFESTYLE_TYPE = 'Documentary'
const FILM_GENRES = { 'Science Fiction': 'Science-Fiction', Animation: 'Anime' }

const main = async () => {
  const manifest = await readJson(MANIFEST_FILE)
  let pictures = 0
  for (const title of manifest.titles) pictures += await seedPictures({ title, version: manifest.version })
  const ratings = seriesRatingRowsOf(manifest)
  for (const row of ratings) await db('programme_ratings').insert(row).onConflict('lookup_key').merge()
  const genres = titleGenreRowsOf(manifest)
  for (const row of genres) await db('title_genres').insert(row).onConflict('title_key').merge()
  console.log(`[pack-store] ${pictures} chosen pictures, ${ratings.length} series scores, ${genres.length} title genres for ${manifest.titles.length} titles`)
}

const seedPictures = async ({ title, version }) => {
  const key = showKeyOf(title.title)
  let seeded = 0
  for (const [kind, surface] of PICTURE_KINDS) {
    const image = title.images[surface]
    if (!image) continue
    const cached = await verifyCached({ version, image })
    if (!cached.ok) throw new Error(`${title.title} ${surface}: ${cached.reason}; run fetch-demo-pack.mjs first`)
    const body = await prepareUpload({ body: await fs.readFile(cached.file), kind })
    const saved = await artworkUploads.save({ key, kind, body })
    await db('show_artwork_choices')
      .insert({ show_key: key, kind, origin: saved.origin, source: saved.source, chosen_at: Date.now() })
      .onConflict(['show_key', 'kind'])
      .merge()
    seeded += 1
  }
  return seeded
}

const seriesRatingRowsOf = (manifest) => manifest.titles
  .filter((title) => title.tvmaze?.score)
  .map((title) => ({
    lookup_key: `${SERIES_RATINGS_PREFIX}${showKeyOf(title.title)}`,
    found_json: JSON.stringify({ score: title.tvmaze.score, weight: title.tvmaze.weight, type: title.tvmaze.type, runtime: title.tvmaze.runtime, url: title.tvmaze.url }),
    expires_at: FAR_FUTURE_MS,
  }))

const titleGenreRowsOf = (manifest) => {
  const realityKeys = new Set(manifest.rows.reality ?? [])
  const rowGenreOf = new Map(Object.entries(ROW_GENRES).flatMap(([row, genre]) => (manifest.rows[row] ?? []).map((key) => [key, genre])))
  return manifest.titles.map((title) => {
    const show = title.tvmaze
    const base = show ? show.genres : (title.facts?.genres ?? []).map((genre) => FILM_GENRES[genre] ?? genre)
    const extra = rowGenreOf.get(title.key)
    const topics = realityKeys.has(title.key) ? base.filter((genre) => !Object.values(ROW_GENRES).includes(genre)) : base
    const genres = [...new Set([...topics, ...(extra ? [extra] : [])])]
    const type = extra && show?.type === 'Reality' ? LIFESTYLE_TYPE : show?.type ?? null
    return {
      title_key: showKeyOf(title.title),
      genres_json: JSON.stringify([
        ...genres,
        ...(type ? [`type:${type}`] : []),
        ...(show?.premiered ? [`premiered:${show.premiered}`] : []),
        ...(show?.status ? [`status:${show.status}`] : []),
        CURRENT_LOOKUP,
      ]),
      categories_json: JSON.stringify(genreTagsOfTvmaze({ genres, type })),
      source: show ? `tvmaze:${show.id}` : `tmdb:${title.tmdb.id}`,
      expires_at: FAR_FUTURE_MS,
    }
  })
}

try {
  await main()
} finally {
  await db.destroy()
}
