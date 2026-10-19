export const CONTROLS_HIDE_KEY = 'freetvarr.controlsHideAfterS'
export const CONTROLS_HIDE_CHOICES_S = [1, 2, 3, 4, 5]
export const DEFAULT_CONTROLS_HIDE_S = 3

const isChoice = (seconds) => CONTROLS_HIDE_CHOICES_S.includes(seconds)

export const loadControlsHideS = (storage) => {
  try {
    const seconds = Number(storage.getItem(CONTROLS_HIDE_KEY))
    return isChoice(seconds) ? seconds : DEFAULT_CONTROLS_HIDE_S
  } catch { return DEFAULT_CONTROLS_HIDE_S }
}

export const saveControlsHideS = (storage, seconds) => {
  if (!isChoice(seconds)) return
  try { storage.setItem(CONTROLS_HIDE_KEY, String(seconds)) } catch {}
}

export const controlsHideMsOf = (storage) => loadControlsHideS(storage) * 1000
