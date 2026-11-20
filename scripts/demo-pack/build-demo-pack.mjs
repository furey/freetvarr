import fs from 'node:fs/promises'
import path from 'node:path'

import {
  MANIFEST_FILE, REPO_ROOT, SPEC_FILE, cachePathOf, download, gateImage, readJson, sha256Of, writeJson,
} from './pack-lib.mjs'

const KEY_FILE = process.env.TMDB_KEY_FILE || path.join(REPO_ROOT, 'tmdb-key.txt')
const TMDB_API = 'https://api.themoviedb.org/3'
const TMDB_IMAGES = 'https://image.tmdb.org/t/p'
const TVMAZE_API = 'https://api.tvmaze.com'
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
const CINEMATIC_TYPES = ['Scripted', 'Animation', 'Documentary', 'Miniseries']
const EPISODES_PER_SHOW = 8
const PARALLEL = 4
const FREE_LICENCES = /cc0|public domain|pdm/i

const main = async () => {
  const spec = await readJson(SPEC_FILE)
  const key = (await fs.readFile(KEY_FILE, 'utf8')).trim()
  const tmdb = tmdbClient(key)
  const libraryShows = new Set(spec.library.shows)
  const channels = []
  for (const channel of spec.channels) channels.push(await withLogo({ channel, version: spec.version }))
  const results = await inBatches(spec.titles, (title) => resolveTitle({
    title, tmdb, version: spec.version, withEpisodes: libraryShows.has(title.key),
  }).catch((err) => ({ ...title, failure: err.message })))
  const failed = results.filter((title) => title.failure)
  for (const title of failed) console.error(`[build] FAILED ${title.title}: ${title.failure}`)
  const manifest = { ...spec, channels, titles: results.filter((title) => !title.failure), builtAt: new Date().toISOString().slice(0, 10) }
  checkReferences(manifest)
  await writeJson(MANIFEST_FILE, manifest)
  const notTextless = manifest.titles.filter((t) => t.images?.backdrop && t.images.backdrop.textless === false).map((t) => t.title)
  console.log(`[build] ${manifest.titles.length} titles, ${failed.length} failed; backdrops with text: ${notTextless.join(', ') || 'none'}`)
  if (failed.some((title) => !title.reserve)) process.exitCode = 1
}

const tmdbClient = (key) => async (route, params = {}) => {
  const url = new URL(`${TMDB_API}${route}`)
  url.searchParams.set('api_key', key)
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`TMDB ${route} answered HTTP ${response.status}`)
  return response.json()
}

const withLogo = async ({ channel, version }) => {
  const buffer = await download(channel.logo)
  const gate = await gateImage({ buffer, surface: 'logo' })
  if (!gate.ok) throw new Error(`logo for ${channel.name}: ${gate.reason}`)
  const file = `channels/${channel.id}.png`
  await saveToCache({ version, file, buffer })
  return { ...channel, logoImage: { source: 'channel', url: channel.logo, file, width: gate.width, height: gate.height, sha256: sha256Of(buffer) } }
}

const resolveTitle = async ({ title, tmdb, version, withEpisodes }) => {
  if (title.kind === 'sport') return resolveSport({ title, version })
  const id = title.tmdb.id ?? await searchTmdbId({ tmdb, query: title.tmdb })
  const type = title.tmdb.type
  const details = await tmdb(`/${type}/${id}`, {
    append_to_response: type === 'tv' ? 'images,content_ratings,external_ids' : 'images,release_dates,external_ids',
    include_image_language: 'en,null',
  })
  const facts = { ...factsOf({ details, type, kind: title.kind }), ...(title.synopsis ? { synopsis: title.synopsis } : {}) }
  const backdrop = await pickBackdrop({ title, details, type, version })
  if (!backdrop.textless) throw new Error('no textless backdrop passes the gate')
  const poster = await pickPoster({ title, details, type, version })
  const episodes = withEpisodes && title.season ? await episodesOf({ title, tmdb, id, version }) : undefined
  const tvmaze = type === 'tv' ? await tvmazeFactsOf({ title, details }) : undefined
  console.log(`[build] ${title.title}: backdrop ${backdrop.width}x${backdrop.height}${backdrop.textless ? ' textless' : ''}, poster ${poster.width}x${poster.height}${episodes ? `, ${episodes.filter((e) => e.still).length}/${episodes.length} stills` : ''}${tvmaze ? `, TVmaze ${tvmaze.type} ${tvmaze.score ?? '-'}` : ''}`)
  return { ...title, tmdb: { type, id }, facts, ...(tvmaze ? { tvmaze } : {}), images: { backdrop, poster }, ...(episodes ? { episodes } : {}) }
}

const searchTmdbId = async ({ tmdb, query }) => {
  const yearParam = query.type === 'tv' ? 'first_air_date_year' : 'year'
  const found = await tmdb(`/search/${query.type}`, { query: query.query, ...(query.year ? { [yearParam]: query.year } : {}) })
  const match = found.results.find((r) => !query.country || (r.origin_country ?? []).includes(query.country))
  if (!match) throw new Error(`no TMDB match for ${query.query}`)
  return match.id
}

const factsOf = ({ details, type, kind }) => {
  const seriesType = type === 'tv' ? details.type : null
  const isFilm = kind === 'film'
  return {
    year: Number((details.release_date ?? details.first_air_date ?? '').slice(0, 4)) || null,
    synopsis: details.overview || '',
    genres: (details.genres ?? []).map((g) => g.name),
    seriesType,
    classification: classificationOf({ details, type }),
    runtimeMin: details.runtime ?? details.episode_run_time?.[0] ?? null,
    imdbId: details.external_ids?.imdb_id ?? details.imdb_id ?? null,
    tvdbId: details.external_ids?.tvdb_id ?? null,
    ...(isFilm && details.vote_count >= 50 ? { score: Math.round(details.vote_average * 10) / 10, votes: details.vote_count } : {}),
  }
}

const classificationOf = ({ details, type }) => {
  const raw = type === 'tv'
    ? details.content_ratings?.results?.find((r) => r.iso_3166_1 === 'AU')?.rating
    : details.release_dates?.results?.find((r) => r.iso_3166_1 === 'AU')?.release_dates?.find((d) => d.certification)?.certification
  return raw ? raw.replace(/\s+/g, '') : null
}

const pickBackdrop = async ({ title, details, type, version }) => {
  const all = (details.images?.backdrops ?? []).filter((b) => b.width >= 1920)
  const ranked = [
    ...all.filter((b) => b.iso_639_1 === null).sort(byVotes).map((b) => ({ ...b, textless: true })),
    ...all.filter((b) => b.iso_639_1 === 'en').sort(byVotes).map((b) => ({ ...b, textless: false })),
  ]
  const preferred = title.backdrop ? ranked.filter((b) => b.file_path === title.backdrop) : ranked
  for (const candidate of preferred.slice(0, 4)) {
    const image = await tmdbImage({ candidate, size: 'original', surface: 'backdrop', file: `${title.key}/backdrop.jpg`, version })
    if (image) return { ...image, textless: candidate.textless }
  }
  if (type === 'tv') {
    const fallback = await tvmazeImage({ title, details, kind: 'background', surface: 'backdrop', version })
    if (fallback) return { ...fallback, textless: false }
  }
  throw new Error('no backdrop passes the gate (1920 px, 16:9)')
}

const pickPoster = async ({ title, details, type, version }) => {
  const ranked = (details.images?.posters ?? []).filter((p) => p.iso_639_1 === 'en' && p.width >= 500).sort(byVotes)
  for (const candidate of ranked.slice(0, 4)) {
    const size = candidate.width >= 780 ? 'w780' : 'original'
    const image = await tmdbImage({ candidate, size, surface: 'poster', file: `${title.key}/poster.jpg`, version })
    if (image) return image
  }
  if (type === 'tv') {
    const fallback = await tvmazeImage({ title, details, kind: 'poster', surface: 'poster', version })
    if (fallback) return fallback
  }
  throw new Error('no English poster passes the gate (500 px, 2:3)')
}

const episodesOf = async ({ title, tmdb, id, version }) => {
  const season = await tmdb(`/tv/${id}/season/${title.season}`)
  const episodes = []
  for (const episode of season.episodes.slice(0, EPISODES_PER_SHOW)) {
    const code = `s${pad(title.season)}e${pad(episode.episode_number)}`
    const still = episode.still_path
      ? await tmdbImage({ candidate: { file_path: episode.still_path }, size: 'original', surface: 'still', file: `${title.key}/${code}.jpg`, version })
      : null
    episodes.push({
      code, season: title.season, episode: episode.episode_number, name: episode.name, synopsis: episode.overview || '',
      ...(still ? { still } : {}),
    })
  }
  return episodes
}

const tmdbImage = async ({ candidate, size, surface, file, version }) => {
  const url = `${TMDB_IMAGES}/${size}${candidate.file_path}`
  const buffer = await download(url).catch(() => null)
  if (!buffer) return null
  const gate = await gateImage({ buffer, surface })
  if (!gate.ok) {
    console.log(`[build]   skipped ${file}: ${gate.reason}`)
    return null
  }
  await saveToCache({ version, file, buffer })
  return { source: 'tmdb', url, file, width: gate.width, height: gate.height, sha256: sha256Of(buffer) }
}

const tvmazeShowOf = async ({ title, details }) => {
  const lookup = details.external_ids?.imdb_id
    ? `${TVMAZE_API}/lookup/shows?imdb=${details.external_ids.imdb_id}`
    : `${TVMAZE_API}/singlesearch/shows?q=${encodeURIComponent(title.title)}`
  return JSON.parse((await download(lookup).catch(() => Buffer.from('null'))).toString())
}

const tvmazeFactsOf = async ({ title, details }) => {
  const show = await tvmazeShowOf({ title, details })
  if (!show?.id) return undefined
  const cinematic = CINEMATIC_TYPES.includes(show.type)
  return {
    id: show.id,
    url: show.url,
    type: show.type ?? null,
    genres: show.genres ?? [],
    weight: show.weight ?? 0,
    runtime: show.runtime ?? show.averageRuntime ?? null,
    premiered: show.premiered ?? null,
    status: show.status ?? null,
    ...(cinematic && show.rating?.average ? { score: show.rating.average } : {}),
  }
}

const tvmazeImage = async ({ title, details, kind, surface, version }) => {
  const show = await tvmazeShowOf({ title, details })
  if (!show?.id) return null
  const images = JSON.parse((await download(`${TVMAZE_API}/shows/${show.id}/images`)).toString())
  const candidates = images.filter((image) => image.type === kind && image.resolutions?.original)
    .sort((a, b) => (b.resolutions.original.width ?? 0) - (a.resolutions.original.width ?? 0))
  for (const candidate of candidates.slice(0, 3)) {
    const url = candidate.resolutions.original.url
    const buffer = await download(url).catch(() => null)
    if (!buffer) continue
    const gate = await gateImage({ buffer, surface })
    if (!gate.ok) continue
    const file = `${title.key}/${surface}.jpg`
    await saveToCache({ version, file, buffer })
    return { source: 'tvmaze', url, file, width: gate.width, height: gate.height, sha256: sha256Of(buffer) }
  }
  return null
}

const resolveSport = async ({ title, version }) => {
  const params = new URLSearchParams({
    action: 'query', titles: `File:${title.photo.file}`, prop: 'imageinfo', iiprop: 'url|size|extmetadata', format: 'json',
  })
  const answer = JSON.parse((await download(`${COMMONS_API}?${params}`)).toString())
  const info = Object.values(answer.query.pages)[0]?.imageinfo?.[0]
  if (!info) throw new Error(`no Commons file ${title.photo.file}`)
  const licence = info.extmetadata?.LicenseShortName?.value ?? ''
  if (!FREE_LICENCES.test(licence)) throw new Error(`licence is ${licence}, not CC0 or public domain`)
  const buffer = await download(info.url)
  const gate = await gateImage({ buffer, surface: 'photo' })
  if (!gate.ok) throw new Error(`photo: ${gate.reason}`)
  const file = `${title.key}/backdrop${path.extname(info.url).toLowerCase() || '.jpg'}`
  await saveToCache({ version, file, buffer })
  const backdrop = {
    source: 'wikimedia', url: info.url, page: info.descriptionurl, licence, file,
    width: gate.width, height: gate.height, sha256: sha256Of(buffer), textless: true,
  }
  console.log(`[build] ${title.title}: photo ${gate.width}x${gate.height} (${licence})`)
  return { ...title, facts: { genres: ['Sport'] }, images: { backdrop } }
}

const checkReferences = (manifest) => {
  const keys = new Set(manifest.titles.map((title) => title.key))
  const used = [
    ...Object.values(manifest.schedule.channels).flatMap((c) => [...c.daytime, ...c.evenings.flat(), ...c.overnight].map(([, key]) => key)),
    ...manifest.schedule.specials.map((s) => s.title),
    ...Object.values(manifest.library).flat(),
    ...Object.values(manifest.rows).flat(),
    ...manifest.tours.hero,
  ]
  const missing = [...new Set(used.filter((key) => !keys.has(key)))]
  if (missing.length) console.error(`[build] used but not in the pack: ${missing.join(', ')}`)
}

const saveToCache = async ({ version, file, buffer }) => {
  const target = cachePathOf({ version, file })
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, buffer)
}

const inBatches = async (items, task) => {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await task(items[index])
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  return results
}

const byVotes = (a, b) => (b.vote_average * Math.log10(b.vote_count + 2)) - (a.vote_average * Math.log10(a.vote_count + 2)) || b.width - a.width

const pad = (n) => String(n).padStart(2, '0')

await main()
