export const arrStatusOf = ({ app, result }) => {
  const name = APP_NAMES[app]
  if (!result?.ok) {
    return { kind: 'err', title: 'Not connected', detail: result?.error || `${name} did not answer.` }
  }
  return {
    kind: 'ok',
    title: 'Connected',
    detail: [
      result.version ? `${name} ${result.version}` : name,
      countText({ app, count: result.count }),
      recycleText(result.recycleBin),
    ].filter(Boolean).join(' · '),
  }
}

export const keyPlaceholderOf = ({ app, saved }) => {
  if (saved?.hasKey) return saved.keySource === 'config.xml' ? '•••••' : '••••• (stored)'
  return `Paste the key from ${APP_NAMES[app]} → Settings → General`
}

export const findResultText = (found = {}) => {
  const lines = Object.entries(APP_NAMES).map(([app, name]) => {
    const entry = found[app]
    if (!entry?.url) return `${name} not found`
    return entry.keyFound ? `${name} found` : `${name} found; paste its API key`
  })
  return `${lines.join('. ')}.`
}

const countText = ({ app, count }) => {
  if (count == null) return ''
  const noun = app === 'sonarr' ? 'series' : count === 1 ? 'film' : 'films'
  return `${count} ${noun}`
}

const recycleText = (recycleBin) => {
  if (!recycleBin) return ''
  if (!recycleBin.on) return 'recycle bin off'
  return recycleBin.days ? `recycle bin on, ${recycleBin.days}\u00a0${recycleBin.days === 1 ? 'day' : 'days'}` : 'recycle bin on'
}

const APP_NAMES = { sonarr: 'Sonarr', radarr: 'Radarr' }
