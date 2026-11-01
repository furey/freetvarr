export const failedCheck = (err) => ({ ok: false, problem: 'request', error: err.message })

export const changedSettings = (entries) => Object.fromEntries(
  entries.filter(([, value, savedValue]) => value !== savedValue).map(([key, value]) => [key, value]),
)

export const storageSummaryText = ({ mediaRoot, recordingsRoot }) => {
  const inDataFolder = [mediaRoot, recordingsRoot].every((folder) => isInsideFolder({ folder, root: COMPOSE_DATA_ROOT }))
  if (inDataFolder) return 'Recordings and your TV library save inside the folder you installed Freetvarr to.'
  return `Freetvarr reads recordings from ${recordingsRoot} and saves your TV library to ${mediaRoot}.`
}

export const storageCheckOutcome = ({ folders, library, recordings, tvh }) => {
  const problems = [
    folderProblem({ result: library, path: folders.mediaRoot, name: 'TV library folder', access: 'save to' }),
    folderProblem({ result: recordings, path: folders.recordingsRoot, name: 'recordings folder', access: 'read' }),
    tvhFolderProblem({ result: tvh, configured: folders.tvhRecordingsPath }),
  ].filter(Boolean)
  const notes = recordings.ok && recordings.hardlinks === false ? [COPY_IMPORT_NOTE] : []
  return { problems, notes }
}

export const folderRows = ({ folders, library, recordings, tvh }) => [
  {
    key: 'library',
    title: 'TV library',
    path: folders.mediaRoot,
    ok: Boolean(library?.ok),
    value: library?.ok ? 'Writable' : 'Problem',
  },
  {
    key: 'recordings',
    title: 'Recordings, as Freetvarr sees them',
    path: folders.recordingsRoot,
    ok: Boolean(recordings?.ok),
    value: recordings?.ok ? 'Readable' : 'Problem',
  },
  {
    key: 'tvh',
    title: 'Recordings, as TVHeadend sees them',
    path: tvh?.tvhPath || folders.tvhRecordingsPath,
    ok: !tvhFolderProblem({ result: tvh || {}, configured: folders.tvhRecordingsPath }),
    value: tvhFolderValue({ result: tvh || {} }),
  },
]

export const PLEX_SECTION_ROWS = [
  { kind: 'tv', label: 'TV section', setting: 'plex_tv_section_id', type: 'show', empty: 'Pick a section' },
  { kind: 'oneoff', label: 'One-off section', setting: 'plex_oneoff_section_id', type: 'movie', empty: 'None' },
  { kind: 'movies', label: 'Movies section', setting: 'plex_movies_section_id', type: 'movie', empty: 'None' },
]

export const prefillPlexSections = ({ picks, plan }) => Object.fromEntries(
  PLEX_SECTION_ROWS.map(({ kind }) => [kind, picks[kind] || existingSectionKey({ plan, kind })]),
)

export const visiblePlexSectionRows = ({ picks, plan }) => PLEX_SECTION_ROWS
  .filter(({ kind }) => kind === 'tv' || picks[kind] || plan?.some((lib) => lib.kind === kind))

export const plexSectionOptions = ({ sections, type, pick }) => sections
  .filter((sec) => sec.type === type || String(sec.key) === String(pick))

export const plexSectionSettings = (picks) => Object.fromEntries(
  PLEX_SECTION_ROWS.map(({ kind, setting }) => [setting, picks[kind] || '']),
)

export const plexServerUrl = (server) => `http://${server.ip}:${server.port}`

export const plexNoTokenProblem = (url) => ({
  text: `Found Plex at ${url}, but Freetvarr could not find its token.`,
  fix: 'Press Connect Plex by hand and paste the token.',
})

export const plexUnreachableProblem = ({ url, error }) => ({
  text: `Freetvarr could not connect to Plex at ${url}: ${withoutFullStop(error)}.`,
  fix: 'Check that Plex is running, then press Check again. Skip Plex leaves your Plex settings as they are.',
})

export const LOCAL_PLEX_URL = 'http://127.0.0.1:32400'

const folderProblem = ({ result, path, name, access }) => {
  if (result.ok) return null
  const changeIt = `Press Change folders and correct the ${name}.`
  const problems = {
    empty: { text: `The ${name} is blank.`, fix: changeIt },
    relative: { text: `The ${name} must start with /.`, fix: changeIt },
    'not-folder': { text: `${path} is a file, not a folder.`, fix: changeIt },
    missing: {
      text: `Your ${name} ${path} does not exist.`,
      fix: `Check that docker-compose.yml shares this folder with Freetvarr, then run docker compose up -d. Or press Change folders and correct the ${name}.`,
    },
    denied: {
      text: `Freetvarr cannot ${access} your ${name} ${path}.`,
      fix: 'Set PUID and PGID in .env to the owner of the data folder, then run docker compose up -d.',
    },
    request: { text: `Freetvarr could not check your ${name}: ${withoutFullStop(result.error)}.`, fix: 'Press Check again.' },
  }
  return problems[result.problem]
    || { text: `Freetvarr cannot ${access} your ${name} ${path}: ${withoutFullStop(result.error)}.`, fix: changeIt }
}

const tvhFolderProblem = ({ result, configured }) => {
  if (!result.ok) {
    return {
      text: 'Freetvarr could not ask TVHeadend where it saves recordings.',
      fix: 'Go back to the TVHeadend step and check the connection.',
    }
  }
  if (!result.tvhPath) {
    return {
      text: 'TVHeadend has no folder set for recordings.',
      fix: 'In TVHeadend, set the recording path in the DVR profile, then press Check again.',
    }
  }
  if (result.matches || !result.configured) return null
  return {
    text: `TVHeadend saves recordings to ${result.tvhPath}, but Freetvarr expects ${configured}.`,
    fix: `Set the recording path in TVHeadend's DVR profile to ${configured}, or press Change folders.`,
  }
}

const tvhFolderValue = ({ result }) => {
  if (!result.ok || !result.tvhPath) return 'Problem'
  if (result.matches || !result.configured) return 'Matches'
  return 'Different'
}

const isInsideFolder = ({ folder, root }) => {
  const path = withoutTrailingSlash(folder)
  return path === root || path.startsWith(`${root}/`)
}

const existingSectionKey = ({ plan, kind }) => String(plan?.find((lib) => lib.kind === kind)?.existing?.key || '')

const withoutTrailingSlash = (path) => String(path || '').trim().replace(/(.)\/+$/, '$1')

const withoutFullStop = (text) => String(text || '').trim().replace(/\.+$/, '')

const COMPOSE_DATA_ROOT = '/data'
const COPY_IMPORT_NOTE = 'Recordings and your TV library are on different disks or mounts, so each import makes a full copy of the recording.'
