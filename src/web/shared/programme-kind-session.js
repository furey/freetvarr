import { onUnmounted, ref } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { toast } from '/shared/toast.js'
import { createMovieKindChanges } from '/movie-kind-changes.js'
import { movieKindToastOf, undoneMovieKindToastOf } from '/for-you.js'

export const kindPendingKeys = ref(new Set())

export const setProgrammeKind = ({ showKey, kind, title }) => api('PUT', `/api/programme-kind/${encodeURIComponent(showKey)}`, { kind, title })

export const clearProgrammeKind = (showKey) => api('DELETE', `/api/programme-kind/${encodeURIComponent(showKey)}`)

export const listProgrammeKinds = async () => (await api('GET', '/api/programme-kind')).overrides ?? []

export const reloadOnProgrammeKindChange = (reload) => {
  reloaders.add(reload)
  onUnmounted(() => reloaders.delete(reload))
}

export const changeProgrammeKind = async ({ showKey, title, kind }) => {
  try {
    await movieKindChanges.change({ showKey, kind, title, reload: reloadAll })
  } catch {
    toast({ text: `Could not change ${title}`, kind: 'error' })
    return
  }
  toast({ text: movieKindToastOf({ title, kind }), action: { label: 'Undo', run: () => undoProgrammeKind({ showKey, title, kind }) } })
}

export const undoProgrammeKind = ({ showKey, title, kind }) => {
  toast({ text: undoneMovieKindToastOf({ title, kind }) })
  return movieKindChanges.undo({ showKey, reload: reloadAll })
}

const reloaders = new Set()

const reloadAll = () => Promise.all([...reloaders].map((reload) => Promise.resolve(reload()).catch(() => {})))

const movieKindChanges = createMovieKindChanges({
  save: setProgrammeKind,
  clear: clearProgrammeKind,
  onPendingChange: (keys) => { kindPendingKeys.value = keys },
})
