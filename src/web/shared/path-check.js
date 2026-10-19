import { ref, reactive } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { FLASH_DEFAULT_MS } from '/shared/composables.js'

export const makeStatus = () => {
  const text = ref('')
  const kind = ref('ok')
  const set = (msg, k = 'ok', ms = FLASH_DEFAULT_MS) => {
    text.value = msg
    kind.value = k
    if (ms > 0) setTimeout(() => (text.value = ''), ms)
  }
  const clear = () => (text.value = '')
  return [text, kind, set, clear]
}

export const usePathCheck = (request) => {
  const checking = ref(false)
  const [text, kind, set] = makeStatus()
  const run = async () => {
    checking.value = true
    set('Checking…', 'busy', 0)
    try {
      const result = await request()
      set(result.text, result.kind, 0)
    } catch (err) {
      set(`Check failed: ${err.message}`, 'err', 0)
    } finally {
      checking.value = false
    }
  }
  const begin = () => {
    checking.value = true
    set('Checking…', 'busy', 0)
  }
  const show = (result) => {
    set(result.text, result.kind, 0)
    checking.value = false
  }
  const clear = () => (text.value = '')
  return reactive({ checking, text, kind, run, begin, show, clear })
}

export const recordingsFolderStatus = async ({ path, mediaRoot }) =>
  describeRecordingsFolder(await api('POST', '/api/recordings-root-test', { path, media_root: mediaRoot }))

export const describeRecordingsFolder = (r) => {
  if (!r.ok) return { text: r.error, kind: 'err' }
  if (r.hardlinks === false) {
    const where = r.sameDevice
      ? 'is on the same disk as the media root but in a separate mount'
      : 'is on a different disk from the media root'
    return {
      text: `${r.path} is readable, but it ${where}, so imports copy each file instead of hardlinking it.`,
      kind: 'info',
    }
  }
  const hardlinks = r.hardlinks ? '. Recordings can move into the TV library folder instantly, without copying' : ''
  return { text: `${r.path} is readable${hardlinks}.`, kind: 'ok' }
}

export const tvhRecordingsPathStatus = async ({ path, fill }) =>
  describeTvhRecordingsPath({ r: await api('POST', '/api/tvh-recordings-path-check', { path }), fill })

export const describeTvhRecordingsPath = ({ r, fill }) => {
  if (r.ok === false) return { text: r.error, kind: 'err' }
  if (!r.tvhPath) {
    return { text: 'TVHeadend has no recording path. Set one in its DVR profile.', kind: 'err' }
  }
  if (!r.configured) {
    fill(r.tvhPath)
    return { text: `Filled in from TVHeadend: ${r.tvhPath}. Save to keep it.`, kind: 'ok' }
  }
  if (r.matches) return { text: `TVHeadend records to ${r.tvhPath}.`, kind: 'ok' }
  return { text: `TVHeadend records to ${r.tvhPath}, not ${r.configured}.`, kind: 'err' }
}
