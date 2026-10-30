import { fileNameOf, scanMinutesOf } from './recording-confirm.js'
import { shortDayOf } from './show-page.js'

export const EPISODE_MENU = 'in this episode\'s menu'
export const SHOW_PAGE_MENU = 'in the episode\'s menu on its show page'

export const RESTORE_ORIGINAL_LABEL = 'Put the original back'
export const RESTORE_PREVIOUS_LABEL = 'Put the previous version back'

export const adModeOf = (ads = NO_ADS) => (ads.showMode === 'cut' ? 'cut' : 'detect')

export const adActionLabelOf = (ads = NO_ADS) => {
  if (adModeOf(ads) === 'detect') return 'Find ads'
  return ads.cut ? 'Remove ads again' : 'Remove ads'
}

export const isAdJobRunning = (ads = NO_ADS) => ads.status === 'scanning'

export const adMenuItemOf = (episode) => {
  const ads = episode.ads || NO_ADS
  if (!isAdJobRunning(ads)) return { key: 'remove-ads', label: adActionLabelOf(ads), icon: 'ads' }
  const percent = ads.progress?.percent
  return {
    key: 'remove-ads',
    label: adModeOf(ads) === 'cut' ? 'Removing ads…' : 'Finding ads…',
    icon: 'ads',
    detail: percent == null ? '' : `${percent}%`,
    disabled: true,
  }
}

export const restoreLabelOf = (backup) => (backup?.uncut ? RESTORE_ORIGINAL_LABEL : RESTORE_PREVIOUS_LABEL)

export const restoreMenuItemOf = (episode) => {
  const ads = episode.ads || NO_ADS
  if (!ads.backup || isAdJobRunning(ads)) return null
  return { key: 'restore-original', label: restoreLabelOf(ads.backup), icon: 'restart' }
}

export const adConfirmOf = ({ episode, retentionDays, timeZone, nowMs, menuPlace = EPISODE_MENU }) => (adModeOf(episode.ads) === 'cut'
  ? removeAdsConfirmOf({ episode, retentionDays, timeZone, nowMs, menuPlace })
  : findAdsConfirmOf({ episode }))

export const restoreConfirmOf = ({ episode }) => {
  const backup = episode.ads?.backup || { uncut: true }
  const label = restoreLabelOf(backup)
  const file = fileNameOf(episode.filePath)
  return {
    title: `${label}?`,
    changes: [{
      icon: 'restart',
      title: 'This episode',
      detail: backup.uncut
        ? `Goes back to the original recording, with the ads. ${file}.orig becomes the episode file again`
        : `Goes back to the version kept before the last ad removal. ${file}.orig becomes the episode file again`,
    }],
    stays: [{ icon: 'check', title: 'The episode in your library', detail: 'Same name and folder. Freetvarr asks Plex to check it again' }],
    note: '',
    undo: backup.uncut ? 'To remove the ads again later, choose Remove ads in this episode\'s menu.' : '',
    goLabel: label,
    busyLabel: 'Putting it back…',
    danger: false,
  }
}

export const adsOfRecording = (recording) => ({
  status: recording.ad_status ?? null,
  breakCount: 0,
  showMode: recording.show_ad_removal || 'off',
  cut: Boolean(recording.ad_cut_at),
  backup: recording.ad_backup_saved_at
    ? { keptUntil: recording.ad_backup_kept_until ?? null, uncut: Boolean(recording.ad_backup_uncut) }
    : null,
  progress: recording.progress ? { phase: recording.progress.phase, percent: recording.progress.percent ?? null } : null,
})

export const episodeOfRecording = (recording) => ({
  recordingId: recording.recording_id,
  filePath: recording.file_path,
  durationS: recording.duration_s ?? null,
  ads: adsOfRecording(recording),
})

export const adStartedToastOf = ({ mode, heading }) => (mode === 'cut'
  ? { title: `Removing ads from ${heading}`, detail: 'The episode menu shows the progress.' }
  : { title: `Finding ads in ${heading}`, detail: 'The episode menu shows the progress.' })

export const restoredToastOf = ({ uncut, heading }) => (uncut
  ? { title: `${heading} is the original again`, detail: 'The ads are back in the episode.' }
  : { title: `${heading} is the previous version again`, detail: '' })

const removeAdsConfirmOf = ({ episode, retentionDays, timeZone, nowMs, menuPlace }) => {
  const ads = episode.ads || NO_ADS
  const backup = ads.backup
  const file = fileNameOf(episode.filePath)
  const keptUntilMs = backup?.keptUntil ? Date.parse(backup.keptUntil) : nowMs + retentionDaysOf(retentionDays) * DAY_MS
  const date = shortDayOf({ ms: keptUntilMs, timeZone })
  const willBeUncut = backup ? backup.uncut : !ads.cut
  const label = adActionLabelOf(ads)
  return {
    title: `${label}?`,
    changes: [{ icon: 'ads', title: 'This episode', detail: [SAVED_AGAIN, restartTextOf(backup)].filter(Boolean).join('. ') }],
    stays: [keptLineOf({ backup, cut: ads.cut, file, date })],
    note: timeNoteOf({ durationS: episode.durationS, cut: true }),
    undo: `To undo, choose ${restoreLabelOf({ uncut: willBeUncut })} ${menuPlace} before ${date}.`,
    goLabel: label,
    busyLabel: 'Starting…',
    danger: false,
  }
}

const findAdsConfirmOf = ({ episode }) => ({
  title: 'Find ads?',
  changes: [{ icon: 'ads', title: edlNameOf(episode.filePath), detail: 'Freetvarr saves the ad break times in this file. Media players that read it skip the ads' }],
  stays: [{ icon: 'check', title: 'This episode', detail: 'The episode file stays as it is' }],
  note: timeNoteOf({ durationS: episode.durationS, cut: false }),
  undo: '',
  goLabel: 'Find ads',
  busyLabel: 'Starting…',
  danger: false,
})

const restartTextOf = (backup) => {
  if (!backup) return ''
  return backup.uncut ? 'Freetvarr starts again from the original' : 'Freetvarr starts again from the earlier version'
}

const keptLineOf = ({ backup, cut, file, date }) => {
  const kept = `Kept until ${date} as ${file}.orig`
  if (backup) return { icon: 'check', title: backup.uncut ? 'The original with ads' : 'The earlier version', detail: kept }
  if (cut) return { icon: 'check', title: 'This episode as it is now', detail: `${kept}. The original with ads is already gone` }
  return { icon: 'check', title: 'The original with ads', detail: kept }
}

const timeNoteOf = ({ durationS, cut }) => {
  const minutes = scanMinutesOf(durationS)
  if (minutes == null) return 'This can take a while and uses a lot of processor time.'
  return `Takes about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}${cut ? ' or more' : ''} and uses a lot of processor time.`
}

const edlNameOf = (filePath) => {
  const name = fileNameOf(filePath)
  const dot = name.lastIndexOf('.')
  return `${dot > 0 ? name.slice(0, dot) : name}.edl`
}

const retentionDaysOf = (days) => {
  const count = Number.parseInt(days, 10)
  return count > 0 ? count : DEFAULT_RETENTION_DAYS
}

const SAVED_AGAIN = 'Saved again without the ad breaks the scan finds, at the same picture quality'
const DEFAULT_RETENTION_DAYS = 7
const DAY_MS = 86_400_000
const NO_ADS = { status: null, breakCount: 0, showMode: 'off', cut: false, backup: null, progress: null }
