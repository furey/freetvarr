import { holdAtLeast } from './pending.js'
import { failureText } from './shared/request-errors.js'

export const RETRY_MIN_MS = 800

export const loadSettingsWith = async ({ fetchSettings, fill, minMs = 0, hold = holdAtLeast }) => {
  try {
    fill(await hold({ task: fetchSettings, minMs }))
    return { loaded: true, error: '' }
  } catch (err) {
    return { loaded: false, error: failureText({ action: 'Could not load settings', err }) }
  }
}

export const settingsTvhTestBodyOf = ({ url, username, password }) => ({
  tvh_url: url,
  tvh_username: username,
  ...(password ? { tvh_password: password } : {}),
  persist: false,
})

export const settingsSnapshotOf = (body) => JSON.stringify(body)

export const hasUnsavedSettings = ({ snapshot, body }) => snapshot !== null && settingsSnapshotOf(body) !== snapshot

export const canSaveSettings = ({ loaded, saving }) => loaded && !saving
