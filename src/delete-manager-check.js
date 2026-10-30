import { appsForKind, managerFieldsOf } from './arr-files.js'

export const recheckManagers = async ({ targets, recordingRows, lookup, kindOfTarget, kindOfRow, activeIds = new Set() }) => {
  try {
    const checkedTargets = []
    for (const target of targets) checkedTargets.push(await recheckTarget({ target, lookup, kind: kindOfTarget(target) }))
    const recordingTargets = []
    for (const row of recordingRows.filter((entry) => entry.file_path && !activeIds.has(entry.recording_id))) {
      const { found } = await lookup.managerOf({ filePath: row.file_path, apps: appsForKind(kindOfRow(row)) })
      if (found) recordingTargets.push(recordingTargetOf({ row, found }))
    }
    return {
      targets: [...checkedTargets, ...recordingTargets],
      managedRecordingIds: new Set(recordingTargets.map((target) => target.recordingId)),
      blocked: null,
    }
  } catch (err) {
    return { targets, managedRecordingIds: new Set(), blocked: blockedTextOf(err) }
  }
}

export const blockedTextOf = (err) => {
  const name = APP_NAMES[err?.app] || 'Sonarr or Radarr'
  return `Freetvarr could not check whether ${name} manages these files, so nothing was deleted. ${sentenceOf(err?.message || `${name} did not answer`)} Try again when ${name} answers.`
}

const recheckTarget = async ({ target, lookup, kind }) => {
  const { found, checked } = await lookup.managerOf({ filePath: target.filePath, apps: appsForKind(kind) })
  if (found) return { ...target, ...managerFieldsOf(found) }
  if (target.manager && !checked.includes(target.manager)) return target
  return { ...target, ...managerFieldsOf(null) }
}

const recordingTargetOf = ({ row, found }) => ({
  recordingId: row.recording_id,
  filePath: row.file_path,
  sizeBytes: null,
  sectionId: null,
  recording: true,
  ...managerFieldsOf(found),
})

const sentenceOf = (text) => {
  const trimmed = String(text).trim()
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

const APP_NAMES = { sonarr: 'Sonarr', radarr: 'Radarr' }
