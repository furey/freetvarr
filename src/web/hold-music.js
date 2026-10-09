export const HOLD_MUSIC_SRC = '/audio/local-forecast-elevator.mp3'
export const HOLD_MUSIC_MUTED_KEY = 'freetvarr.holdMusicMuted'
export const HOLD_MUSIC_VOLUME = 0.3
export const FADE_IN_MS = 2000
export const FADE_OUT_MS = 3000
const FADE_TICK_MS = 50

export const fadeVolume = ({ from, to, elapsedMs, durationMs }) => {
  if (durationMs <= 0 || elapsedMs >= durationMs) return to
  return from + (to - from) * (Math.max(0, elapsedMs) / durationMs)
}

export const holdMusicToggleLabel = (audible) => (audible ? 'Mute the music' : 'Play the music')

export const loadHoldMusicMuted = (storage) => {
  try { return storage.getItem(HOLD_MUSIC_MUTED_KEY) === '1' } catch { return false }
}

export const saveHoldMusicMuted = (storage, muted) => {
  try { storage.setItem(HOLD_MUSIC_MUTED_KEY, muted ? '1' : '0') } catch {}
}

export const audioContextOnce = (scope = globalThis) => {
  let context = null
  return () => {
    const AudioContextClass = scope.AudioContext || scope.webkitAudioContext
    if (!AudioContextClass) return null
    context ??= new AudioContextClass()
    return context
  }
}

export const elementVolume = (audio) => ({
  read: () => audio.volume,
  write: (volume) => { audio.volume = volume },
  resume: () => {},
})

export const gainVolume = ({ audio, context }) => {
  const gain = context.createGain()
  context.createMediaElementSource(audio).connect(gain).connect(context.destination)
  return {
    read: () => gain.gain.value,
    write: (volume) => { gain.gain.value = volume },
    resume: () => context.resume().catch(() => {}),
  }
}

export const holdMusicVolume = ({ audio, getContext }) => {
  const context = getContext()
  return context ? gainVolume({ audio, context }) : elementVolume(audio)
}

export const createHoldMusic = ({
  makeAudio,
  onAudibleChange,
  makeVolume = elementVolume,
  schedule = setInterval,
  cancel = clearInterval,
  now = Date.now,
}) => {
  let audio = null
  let volume = null
  let fadeTimer = null
  let wanted = false

  const fadeTo = (to, durationMs, done) => {
    cancel(fadeTimer)
    const from = volume.read()
    const startedAt = now()
    fadeTimer = schedule(() => {
      const elapsedMs = now() - startedAt
      volume.write(fadeVolume({ from, to, elapsedMs, durationMs }))
      if (elapsedMs < durationMs) return
      cancel(fadeTimer)
      done?.()
    }, FADE_TICK_MS)
  }

  const silence = () => {
    cancel(fadeTimer)
    volume.write(0)
    audio.pause()
  }

  const start = async () => {
    wanted = true
    if (!audio) {
      audio = makeAudio()
      volume = makeVolume(audio)
    }
    volume.resume()
    audio.loop = true
    if (audio.paused) volume.write(0)
    try {
      await audio.play()
    } catch {
      wanted = false
      onAudibleChange(false)
      return false
    }
    if (!wanted) {
      silence()
      return false
    }
    onAudibleChange(true)
    fadeTo(HOLD_MUSIC_VOLUME, FADE_IN_MS)
    return true
  }

  const stop = () => {
    wanted = false
    if (!audio || audio.paused) return
    onAudibleChange(false)
    fadeTo(0, FADE_OUT_MS, () => audio.pause())
  }

  return { start, stop }
}
