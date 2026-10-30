import { createPathIndex, findInPathIndex, isSameFileByTail } from './plex-library.js'

export const ARR_APPS_BY_KIND = {
  episode: ['sonarr'],
  tv: ['sonarr'],
  movie: ['radarr'],
  film: ['radarr'],
}

export const appsForKind = (kind) => ARR_APPS_BY_KIND[kind] ?? ['sonarr', 'radarr']

export const sonarrEntryOf = ({ series, file }) => {
  const filePath = file?.path || joinPath(series?.path, file?.relativePath)
  return filePath ? { manager: 'sonarr', path: filePath, fileId: file.id, itemId: null, seriesId: series.id } : null
}

export const radarrEntryOf = (movie) => {
  const file = movie?.movieFile
  if (!file?.id) return null
  const filePath = file.path || joinPath(movie.path, file.relativePath)
  return filePath ? { manager: 'radarr', path: filePath, fileId: file.id, itemId: movie.id, seriesId: null } : null
}

export const createArrLookup = ({ clientFor }) => {
  const remembered = new Map()
  const remember = (key, load) => {
    if (!remembered.has(key)) remembered.set(key, Promise.resolve().then(load))
    return remembered.get(key)
  }

  const clientOf = (app) => remember(`client:${app}`, () => clientFor(app))

  const findInSonarr = async ({ client, filePath }) => {
    const allSeries = listOf(await remember('series', () => client.series()))
    const folders = new Set(segmentsOf(filePath).slice(0, -1))
    for (const series of allSeries.filter((entry) => folders.has(fileNameOf(entry.path)))) {
      const files = listOf(await remember(`files:${series.id}`, () => client.episodeFiles(series.id)))
      const found = files.map((file) => sonarrEntryOf({ series, file })).find((entry) => entry && isSameFileByTail(entry.path, filePath))
      if (found) return found
    }
    return null
  }

  const findInRadarr = async ({ client, filePath }) => {
    const index = await remember('movies', async () => createPathIndex(listOf(await client.movies()).map(radarrEntryOf)))
    return findInPathIndex({ index, filePath })
  }

  const finders = { sonarr: findInSonarr, radarr: findInRadarr }

  const managerOf = async ({ filePath, apps = ['sonarr', 'radarr'] }) => {
    const checked = []
    for (const app of apps) {
      const client = await clientOf(app)
      if (!client) continue
      checked.push(app)
      const found = await finders[app]({ client, filePath })
      if (found) return { found, checked }
    }
    return { found: null, checked }
  }

  const anyConnected = async () => (await Promise.all(['sonarr', 'radarr'].map(clientOf))).some(Boolean)

  return { managerOf, anyConnected }
}

export const managerFieldsOf = (entry) => ({
  manager: entry?.manager ?? null,
  managerFileId: entry?.fileId ?? null,
  managerItemId: entry?.itemId ?? null,
  managerSeriesId: entry?.seriesId ?? null,
})

const listOf = (value) => (Array.isArray(value) ? value : [])

const segmentsOf = (filePath) => String(filePath ?? '').split(/[\\/]+/).filter(Boolean)

const fileNameOf = (filePath) => segmentsOf(filePath).at(-1) ?? ''

const joinPath = (folder, relative) => (folder && relative ? `${String(folder).replace(/\/+$/, '')}/${relative}` : null)
