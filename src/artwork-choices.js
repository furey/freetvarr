import { db } from './db.js'

export const ARTWORK_KINDS = ['background', 'poster']
export const PLEX_ORIGIN_PREFIX = 'plex:'
export const RECORDING_ORIGIN_PREFIX = 'recording:'

export const artworkChoiceKindFrom = (value) => (ARTWORK_KINDS.includes(value) ? value : null)

export const isShowKey = (value) => typeof value === 'string'
  && value.length <= MAX_SHOW_KEY_LENGTH
  && SHOW_KEY_PATTERN.test(value)

export const isCandidateId = (value) => typeof value === 'string' && CANDIDATE_ID_PATTERN.test(value)

export const choiceStampOf = (choice) => (choice ? Number(choice.chosenAt).toString(36) : null)

export const choiceStampsOf = (choices = {}) => ({
  background: choiceStampOf(choices.background),
  poster: choiceStampOf(choices.poster),
})

export const plexSourceOf = ({ origin, url, token }) => {
  const path = origin.slice(PLEX_ORIGIN_PREFIX.length)
  const joiner = path.includes('?') ? '&' : '?'
  return `${url}${path}${joiner}X-Plex-Token=${encodeURIComponent(token)}`
}

export const createArtworkChoices = ({ store = databaseStore, now = Date.now } = {}) => {
  let loading = null

  const all = () => {
    loading ??= store.readAll().then(choicesByKeyOf).catch((err) => {
      loading = null
      throw err
    })
    return loading
  }

  const choicesFor = async (key) => (await all()).get(key) || {}

  const chosenFor = async ({ key, kind }) => (await choicesFor(key))[kind] || null

  const stampsByKey = async () => new Map([...(await all()).entries()].map(([key, choices]) => [key, choiceStampsOf(choices)]))

  const choose = async ({ key, kind, origin, source }) => {
    const choice = { origin, source, chosenAt: Math.max(now(), lastStampOf(await choicesFor(key)) + 1) }
    await store.write({ key, kind, ...choice })
    const byKey = await all()
    byKey.set(key, { ...byKey.get(key), [kind]: choice })
    return choice
  }

  const clear = async ({ key, kind }) => {
    await store.remove({ key, kind })
    const byKey = await all()
    const { [kind]: removed, ...rest } = byKey.get(key) || {}
    if (Object.keys(rest).length) byKey.set(key, rest)
    else byKey.delete(key)
    return removed || null
  }

  return { choicesFor, chosenFor, stampsByKey, choose, clear }
}

const choicesByKeyOf = (rows) => {
  const byKey = new Map()
  for (const row of rows) {
    if (!artworkChoiceKindFrom(row.kind)) continue
    const choice = { origin: row.origin, source: row.source, chosenAt: Number(row.chosen_at) }
    byKey.set(row.show_key, { ...byKey.get(row.show_key), [row.kind]: choice })
  }
  return byKey
}

const lastStampOf = (choices) => Math.max(0, ...Object.values(choices).map((choice) => choice.chosenAt))

const databaseStore = {
  readAll: () => db('show_artwork_choices').select(),
  write: ({ key, kind, origin, source, chosenAt }) => db('show_artwork_choices')
    .insert({ show_key: key, kind, origin, source, chosen_at: chosenAt })
    .onConflict(['show_key', 'kind'])
    .merge(),
  remove: ({ key, kind }) => db('show_artwork_choices').where({ show_key: key, kind }).del(),
}

export const artworkChoices = createArtworkChoices()

const SHOW_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_SHOW_KEY_LENGTH = 200
const CANDIDATE_ID_PATTERN = /^[0-9a-f]{16}$/
