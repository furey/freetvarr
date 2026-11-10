import fs from 'fs/promises'
import { constants as fsConstants } from 'fs'
import os from 'os'
import path from 'path'

import { db, getSetting } from './db.js'
import { tvhRead, walkTuners, resolveConnection } from './tvheadend.js'
import { findOpenAdminEntries } from './tvheadend-bootstrap.js'
import { countPlexSectionItems, listPlexSections, storedPlexToken } from './plex.js'
import { hasOneOffPlaceholder, hasRecordingFiles } from './one-off-placeholder.js'
import { checkRecordingsFolder, checkMediaRoot, compareRecordingPaths, probeHardlink } from './path-check.js'
import { describeBenchmark } from './live-benchmark.js'
import { getMediaRoot, getMoviesRoot, getOneOffRoot, getRecordingsRoot, getTvhRecordingsPath } from './sync.js'
import { ROOT_EMPTY, libraryRootProblemOf } from './library-roots.js'
import { getSchedulerExpression } from './scheduler.js'
import { freeviewPictureProblem, getGuideSnapshot, guidePictureCoverage } from './epg.js'
import { guideImageHosts, hostOfSource } from './programme-images.js'
import { broadcastGuideHealthOf } from './broadcast-guide-health.js'
import { showTitleKey } from './show-artwork.js'
import { formatDiskSize } from './web/size-format.js'
import { formatClock, formatHours, formatSeconds } from './web/time-format.js'
import { currentTimeZone, isKnownTimeZone, resolveTimeZone, timeZoneFromEnv } from './time-zone.js'
import { describeSyncSchedule } from './web/sync-schedule.js'
import { detectDockerVm } from './docker-host.js'
import { measureJob } from './event-loop-lag.js'
import { activity, trackJob } from './activity.js'
import { guideFeedUrl, isGuideFeedUrl, localAddressToward, serverPort } from './guide-feed.js'
import { readAnchorFailures } from './autorec-anchor.js'

export const getDoctorReport = async ({ fresh = false, deps = {} } = {}) => {
  if (!fresh && reportCache && reportCache.expiresAt > Date.now()) return reportCache.value
  if (reportInflight) return reportInflight
  reportInflight = trackJob({ kind: 'health' }, (job) => runDoctor({ deps }).then((report) => noteDoctorRun({ job, report })))
    .then((value) => {
      reportCache = { value, expiresAt: Date.now() + REPORT_TTL_MS }
      return value
    })
    .finally(() => { reportInflight = null })
  return reportInflight
}

export const scheduleDoctorChecks = ({ firstDelayMs = DOCTOR_FIRST_RUN_MS, everyMs = DOCTOR_EVERY_MS, run = () => getDoctorReport({ fresh: true }) } = {}) => {
  const runQuietly = () => measureJob('doctor', run).catch((err) => console.warn(`[doctor] background check failed: ${err.message}`))
  const first = setTimeout(runQuietly, firstDelayMs)
  const repeat = setInterval(runQuietly, everyMs)
  activity.planEvery({ kind: 'health', every: 'every 3 hours', firstDelayMs, everyMs })
  first.unref?.()
  repeat.unref?.()
  return () => {
    clearTimeout(first)
    clearInterval(repeat)
  }
}

export const doctorOutcomeOf = (summary = {}) => {
  const parts = [
    summary.fail && `${summary.fail} failed`,
    summary.warn && `${summary.warn} warning${summary.warn === 1 ? '' : 's'}`,
    `${summary.pass ?? 0} passed`,
  ].filter(Boolean)
  return parts.join(' · ')
}

const noteDoctorRun = ({ job, report }) => {
  for (const check of report.checks) job.item({ label: check.title, state: check.status, detail: check.detail ?? null })
  job.outcome(doctorOutcomeOf(report.summary), report.summary.fail || report.summary.warn ? 'warn' : null)
  const failed = report.checks.find((check) => check.status === 'fail')
  if (failed) job.log(`${failed.title}: ${failed.detail ?? 'failed'}`, 'error')
  return report
}

export const peekDoctorReport = ({ nowMs = Date.now() } = {}) => {
  if (!reportCache) return null
  return { report: reportCache.value, ageMs: Math.max(0, nowMs - Date.parse(reportCache.value.ranAt)) }
}

export const runDoctor = async ({ now = Date.now(), timeoutMs = DEFAULT_TIMEOUT_MS, deps = {} } = {}) => {
  const startedAt = Date.now()
  const merged = { ...defaultDeps(), ...deps }
  const ctx = { deps: merged, now, timeoutMs, settings: await merged.settings() }
  ctx.read = memoiseReads({ read: merged.tvhRead, conn: () => ctx.conn })
  const reach = await runCheck({ spec: TVH_REACH, ctx })
  const auth = ctx.tvhAnswered ? await runCheck({ spec: TVH_AUTH, ctx }) : skipped(TVH_AUTH)
  ctx.tvhReady = isHealthy(reach) && isHealthy(auth)
  const rest = await Promise.all(LATER_CHECKS.map((spec) =>
    spec.needsTvh && !ctx.tvhReady ? skipped(spec) : runCheck({ spec, ctx })))
  const checks = [reach, auth, ...rest]
  return {
    ranAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    summary: summarise(checks),
    checks,
  }
}

export const classifyDiskFree = ({ free, total }) => {
  if (free < DISK_FAIL_BYTES) return 'fail'
  if (free < DISK_WARN_BYTES || (total > 0 && free / total < DISK_WARN_SHARE)) return 'warn'
  return 'pass'
}

export const classifyGuideDepth = ({ lastStopMs, now, emptyShare = 0 }) => {
  if (!lastStopMs || lastStopMs - now < GUIDE_FAIL_MS) return 'fail'
  if (lastStopMs - now < GUIDE_WARN_MS || emptyShare > GUIDE_EMPTY_SHARE) return 'warn'
  return 'pass'
}

export const plexLocationMatches = ({ locations = [], mediaRoot }) => {
  const tail = pathSegments(mediaRoot).slice(-2).join('/')
  if (!tail) return true
  return locations.some((location) =>
    pathSegments(location).slice(-tail.split('/').length).join('/') === tail)
}

export const isBridgeOnly = (interfaces = {}) => {
  const addresses = ipv4Addresses(interfaces)
  return addresses.length > 0 && addresses.every(isDockerBridgeAddress)
}

export const guideCoverage = ({ guide, now }) => {
  const channels = guide?.channels || []
  const empty = channels.filter((c) => !(guide.programsByChannel?.[String(c.epgId)] || [])
    .some((p) => p.end > now && p.start < now + DAY_MS))
  return { channels: channels.length, empty: empty.length }
}

const TVH_REACH = {
  id: 'tvh.reach',
  group: 'tvheadend',
  title: 'Connection',
  doc: 'guide/troubleshooting#setup-connection-test',
  run: async (ctx) => {
    try {
      ctx.conn = await ctx.deps.connection()
    } catch {
      return {
        status: 'fail',
        detail: 'No TVHeadend address is set.',
        fix: 'Enter the TVHeadend address in Settings, or use AUTO-DISCOVER.',
        action: SETTINGS_TVHEADEND,
      }
    }
    const info = await ctx.read('serverinfo').catch((err) => {
      if (err.code !== 'auth') throw err
      ctx.serverinfoError = err
      return null
    }).catch((err) => ({ unreachable: err }))
    if (info?.unreachable) {
      return {
        status: 'fail',
        detail: withFullStop(info.unreachable.message),
        fix: `Freetvarr can't reach TVHeadend at ${ctx.conn.url}. Check the address, or use AUTO-DISCOVER in Settings.`,
        action: SETTINGS_TVHEADEND,
      }
    }
    ctx.tvhAnswered = true
    if (!info) return { status: 'pass', detail: `TVHeadend answers at ${ctx.conn.url}.` }
    const detail = `TVHeadend ${tvhVersion(info.sw_version)} at ${ctx.conn.url}.`
    if (Number(info.api_version) < MIN_API_VERSION) {
      return { status: 'warn', detail, fix: 'This TVHeadend is older than Freetvarr expects. Update it to a current 4.3 build.' }
    }
    return { status: 'pass', detail }
  },
}

const TVH_AUTH = {
  id: 'tvh.auth',
  group: 'tvheadend',
  title: 'Login',
  doc: 'guide/troubleshooting#tvheadend-401-or-403',
  run: async (ctx) => {
    const err = ctx.serverinfoError
      || await ctx.read('channel/grid', { limit: 1 }).then(() => null, (e) => e)
    if (!err) {
      return {
        status: 'pass',
        detail: ctx.conn.username ? `Signed in as ${ctx.conn.username}.` : 'TVHeadend asks for no login.',
      }
    }
    if (err.code !== 'auth') throw err
    return { status: 'fail', action: SETTINGS_TVHEADEND, ...loginFailure({ err, username: ctx.conn.username }) }
  },
}

const LATER_CHECKS = [
  {
    id: 'tvh.rights',
    group: 'tvheadend',
    title: 'User rights',
    doc: 'guide/tvheadend#_8-make-a-user-for-freetvarr',
    needsTvh: true,
    run: async (ctx) => {
      const refused = (await Promise.all(RIGHT_PROBES.map((probe) =>
        ctx.read(probe.path, probe.params).then(() => null, (err) => {
          if (err.status === 403) return probe
          throw err
        })))).filter(Boolean)
      const entry = accessEntryName(ctx.conn)
      if (!refused.length) {
        return { status: 'pass', detail: `${capitalise(entry)} has the ${joinAnd(RIGHT_PROBES.map((p) => p.right))} rights.` }
      }
      return {
        status: 'fail',
        detail: `TVHeadend refused ${joinAnd(refused.map((p) => p.path))} (HTTP 403).`,
        fix: `In TVHeadend, open Configuration → Users → Access Entries, edit ${entry}, and tick ${joinAnd(refused.map((p) => p.right))}.`,
      }
    },
  },
  {
    id: 'tvh.open',
    group: 'tvheadend',
    title: 'Open access',
    doc: 'guide/tvheadend#_2-secure-tvheadend',
    needsTvh: true,
    run: async (ctx) => {
      const body = await ctx.read('access/entry/grid', { limit: ACCESS_ENTRY_LIMIT })
      const open = findOpenAdminEntries(body?.entries || [])
      if (!open.length) return { status: 'pass', detail: 'Every TVHeadend admin needs a login.' }
      const networks = joinAnd([...new Set(open.map((e) => e.prefix || 'any network'))])
      return {
        status: 'warn',
        detail: `TVHeadend has an access entry with username * and admin rights (${networks}): anyone on your network can change TVHeadend.`,
        fix: 'If Freetvarr installed TVHeadend for you, press RUN THE WHOLE SETUP FROM THE START under SETTINGS → SETUP, then press SECURE AND CONNECT. If you installed TVHeadend yourself, make an admin user in TVHeadend, then delete the * entry under Configuration → Users → Access Entries.',
      }
    },
  },
  {
    id: 'tvh.tuners',
    group: 'tvheadend',
    title: 'Tuners',
    doc: 'guide/troubleshooting#missing-tuner',
    needsTvh: true,
    run: async (ctx) => {
      const [walked, body] = await Promise.all([
        ctx.deps.walkTuners(ctx.conn),
        ctx.read('status/inputs'),
      ])
      const inputs = (body?.entries || []).map((i) => i.input).filter(Boolean)
      const count = walked ?? inputs.length
      if (!count) return { status: 'fail', detail: 'TVHeadend sees no tuner.', ...noTunerFix(ctx.deps) }
      if (!inputs.length) {
        return {
          status: 'warn',
          detail: `TVHeadend sees ${plural(count, 'tuner')}, but none is turned on.`,
          fix: 'Scan for channels under SETTINGS → SETUP → CHANNELS, or turn the tuner on in TVHeadend under Configuration → DVB Inputs → TV adapters.',
        }
      }
      const detail = `${plural(count, 'tuner')}: ${inputs.join('; ')}.`
      if (inputs.some((i) => LINK_LOCAL.test(i))) {
        return {
          status: 'warn',
          detail,
          fix: 'The tuner has a link-local address (169.254.x.x), so it may change if you move it.',
          doc: 'guide/hardware-requirements#direct-to-a-spare-nas-port',
        }
      }
      return { status: 'pass', detail }
    },
  },
  {
    id: 'tvh.channels',
    group: 'tvheadend',
    title: 'Channels',
    doc: 'guide/troubleshooting#no-channels',
    needsTvh: true,
    run: async (ctx) => {
      const body = await ctx.read('channel/grid', { limit: 1 })
      const total = Number(body?.total ?? body?.entries?.length ?? 0)
      if (!total) {
        return {
          status: 'fail',
          detail: 'TVHeadend has no channels.',
          fix: 'No channels yet. Scan for channels under SETTINGS → SETUP → CHANNELS, or scan and map services in TVHeadend.',
        }
      }
      return { status: 'pass', detail: `${plural(total, 'channel')} in TVHeadend.` }
    },
  },
  {
    id: 'tvh.rules',
    group: 'tvheadend',
    title: 'Series recordings',
    doc: 'guide/series#how-a-series-recording-works',
    run: async (ctx) => {
      const failed = await ctx.deps.anchorFailures()
      if (!failed.length) return { status: 'pass', detail: 'Each series recording Freetvarr made matches its whole show title.' }
      return {
        status: 'warn',
        detail: `TVHeadend did not save the whole-title change for ${joinAnd(failed.map((rule) => rule.name))}, so ${failed.length === 1 ? 'that series recording' : 'those series recordings'} can still record longer titles that contain the show title.`,
        fix: 'Freetvarr tries again after the next sync. If this stays, check the Freetvarr log for the TVHeadend error.',
      }
    },
  },
  {
    id: 'guide.depth',
    group: 'guide',
    title: 'Guide depth',
    doc: 'guide/troubleshooting#empty-guide',
    needsTvh: true,
    run: async (ctx) => {
      const [body, guide, channelGrid] = await Promise.all([
        ctx.read('epg/events/grid', { sort: 'stop', dir: 'DESC', limit: 1 }),
        settleWithin(ctx.deps.guide(), ctx.timeoutMs / 2),
        ctx.read('channel/grid', { limit: 1 }),
      ])
      const channelTotal = Number(channelGrid?.total ?? channelGrid?.entries?.length ?? 0)
      if (!channelTotal) return { status: 'skip', detail: NO_CHANNELS_YET }
      const lastStop = body?.entries?.[0]?.stop
      const lastStopMs = lastStop ? lastStop * 1000 : null
      const coverage = guide ? guideCoverage({ guide, now: ctx.now }) : null
      const emptyShare = coverage?.channels ? coverage.empty / coverage.channels : 0
      const status = classifyGuideDepth({ lastStopMs, now: ctx.now, emptyShare })
      const detail = [
        guideReach({ lastStopMs, now: ctx.now }),
        ...(coverage?.channels ? [guideListings(coverage)] : []),
      ].join(' ')
      const staleFeed = await staleGuideFeedOf(ctx)
      if (staleFeed) {
        return {
          status: status === 'pass' ? 'warn' : status,
          detail: `${staleFeed.detail} ${detail}`,
          fix: staleFeed.fix,
        }
      }
      if (status === 'pass') return { status, detail }
      const shortGuide = !lastStopMs || lastStopMs - ctx.now < GUIDE_WARN_MS
      return {
        status,
        detail,
        fix: shortGuide
          ? `The guide only runs to ${lastStopMs ? fmtStamp(lastStopMs) : 'now'}. Enable an XMLTV grabber and link its channels.`
          : 'Link the empty channels under Configuration → Channel/EPG → EPG Grabber Channels.',
      }
    },
  },
  {
    id: 'guide.logos',
    group: 'guide',
    title: 'Channel logos',
    doc: 'guide/troubleshooting#missing-channel-logos',
    needsTvh: true,
    run: async (ctx) => {
      const [config, grid] = await Promise.all([
        ctx.read('config/load'),
        ctx.read('channel/grid', { limit: CHANNEL_LIMIT }),
      ])
      const params = config?.entries?.[0]?.params || []
      const param = (id) => params.find((p) => p.id === id)?.value
      const channels = (grid?.entries || []).filter((c) => c.enabled !== false)
      if (!channels.length) return { status: 'skip', detail: NO_CHANNELS_YET }
      const withIcon = channels.filter((c) => c.icon_public_url).length
      const detail = `${share(withIcon, channels.length)} a TVHeadend icon.`
      if (param('prefer_picon') && !param('piconpath')) {
        return {
          status: 'warn',
          detail: `Prefer picons over channel icons is on, but no picon path is set. ${detail}`,
          fix: 'Untick Prefer picons over channel icons in Configuration → General → Base, or set the Picon path.',
        }
      }
      return { status: 'pass', detail }
    },
  },
  {
    id: 'guide.pictures',
    group: 'guide',
    title: 'Guide pictures',
    doc: 'guide/doctor#guide-pictures',
    needsTvh: true,
    run: async (ctx) => {
      const guide = await settleWithin(ctx.deps.guide(), ctx.timeoutMs / 2)
      const programmes = Object.values(guide?.programsByChannel ?? {}).flat()
        .filter((programme) => airsWithin({ programme, nowMs: ctx.now, windowMs: PICTURE_WINDOW_MS }))
      if (!programmes.length) return NOTHING_AIRS_SOON
      const health = await ctx.deps.guidePictureHealth()
      return guidePicturesCheck({ programmes, ...health, nowMs: ctx.now })
    },
  },
  {
    id: 'guide.sources',
    group: 'guide',
    title: 'Guide sources',
    doc: 'guide/doctor#guide-sources',
    run: async (ctx) => {
      const view = await ctx.deps.guideSources()
      if (!view?.available) {
        const guide = ctx.tvhReady ? await settleWithin(ctx.deps.guide(), ctx.timeoutMs / 2) : null
        return broadcastGuideCheck({ broadcast: guide ? broadcastGuideHealthOf({ guide, nowMs: ctx.now }) : null, suggestions: view?.suggestions })
      }
      const grabber = view?.repoint?.state === 'confirmed' && ctx.tvhReady ? await readGrabberOf(ctx).catch(() => null) : null
      return guideSourcesCheck({ view, grabber, nowMs: ctx.now })
    },
  },
  {
    id: 'paths.recordings',
    group: 'storage',
    title: 'Recordings folder',
    doc: 'guide/troubleshooting#test-path-failures',
    run: async (ctx) => {
      const result = await recordingsFolder(ctx)
      if (result.ok) return { status: 'pass', detail: `${result.path} is readable.` }
      return {
        status: 'fail',
        detail: withFullStop(result.error),
        fix: 'Mount the same folder TVHeadend writes to.',
        action: SETTINGS_STORAGE,
      }
    },
  },
  {
    id: 'paths.match',
    group: 'storage',
    title: 'TVHeadend recording path',
    doc: 'guide/troubleshooting#check-tvheadend-mismatch',
    needsTvh: true,
    run: async (ctx) => {
      const body = await ctx.read('dvr/config/grid')
      const entries = body?.entries || []
      const profile = entries.find((c) => c.name === '') || entries[0]
      const { tvhPath, configured, matches } = compareRecordingPaths({
        configured: ctx.settings.tvhRecordingsPath,
        tvhStorage: profile?.storage,
      })
      if (!tvhPath) {
        return {
          status: 'fail',
          detail: 'The default DVR profile in TVHeadend has no recording path.',
          fix: 'Set Recording system path on the default DVR profile in TVHeadend.',
        }
      }
      if (!matches) {
        return {
          status: 'fail',
          detail: `TVHeadend writes to ${tvhPath}; Freetvarr expects ${configured || 'nothing'}.`,
          fix: 'Change Recording system path in TVHeadend, or the TVHeadend recordings path in Settings, so the two match.',
          action: SETTINGS_STORAGE,
        }
      }
      return { status: 'pass', detail: `TVHeadend and Freetvarr both use ${tvhPath}.` }
    },
  },
  {
    id: 'paths.media',
    group: 'storage',
    title: 'Media folder',
    doc: 'guide/troubleshooting#permission-errors',
    run: async (ctx) => {
      const result = await ctx.deps.checkMediaRoot(ctx.settings.mediaRoot)
      if (result.ok) return { status: 'pass', detail: `${result.path} is writable.` }
      return {
        status: 'fail',
        detail: withFullStop(result.error),
        fix: mediaFolderFix({ result, mediaRoot: ctx.settings.mediaRoot, uid: ctx.deps.uid() }),
        action: SETTINGS_STORAGE,
      }
    },
  },
  {
    id: 'paths.mounted',
    group: 'storage',
    title: 'Library folders',
    doc: 'guide/troubleshooting#empty-library-folder',
    run: async (ctx) => {
      const roots = [...new Set([ctx.settings.mediaRoot, ctx.settings.oneOffRoot, ctx.settings.moviesRoot].filter(Boolean))]
      const problems = await Promise.all(roots.map(async (root) => ({ root, problem: await ctx.deps.libraryRootProblem(root) })))
      const empty = problems.filter(({ problem }) => problem === ROOT_EMPTY).map(({ root }) => root)
      if (!empty.length) return { status: 'pass', detail: 'No library folder is empty while imported recordings point into it.' }
      return {
        status: 'warn',
        detail: `${joinAnd(empty)} ${empty.length === 1 ? 'is' : 'are'} empty, but imported recordings point into ${empty.length === 1 ? 'it' : 'them'}. Syncs skip imports into ${empty.length === 1 ? 'it' : 'them'}.`,
        fix: 'Check that the media share is mounted on the host, then restart the Freetvarr container. If you emptied the folder yourself, or moved the media root, delete those recordings in Freetvarr so that syncs import into it again.',
      }
    },
  },
  {
    id: 'paths.hardlink',
    group: 'storage',
    title: 'Hardlinks',
    doc: 'guide/configuration#one-shared-mount',
    run: async (ctx) => {
      const { recordingsRoot } = ctx.settings
      const targets = [...new Set([ctx.settings.mediaRoot, ctx.settings.oneOffRoot, ctx.settings.moviesRoot].filter(Boolean))]
      const probes = await Promise.all(targets.map(async (to) => ({
        to,
        ...(await ctx.deps.probeHardlink({ from: recordingsRoot, to })),
      })))
      const known = probes.filter((p) => p.hardlinks != null)
      if (!known.length) return { status: 'skip', detail: 'Fix the recordings and media folders first.' }
      const copies = known.filter((p) => !p.hardlinks)
      if (!copies.length) {
        return { status: 'pass', detail: `Imports from ${recordingsRoot} into ${known.map((p) => p.to).join(' and ')} hardlink.` }
      }
      return {
        status: 'warn',
        detail: `Imports from ${recordingsRoot} into ${copies.map((p) => p.to).join(' and ')} copy each file.`,
        fix: copies.some((p) => p.sameDevice)
          ? 'The folders are on one disk but in separate mounts. Mount one folder that holds both, so imports hardlink and use no extra space.'
          : 'The folders are on different disks, so each import copies the file and uses twice the space.',
      }
    },
  },
  {
    id: 'disk.free',
    group: 'storage',
    title: 'Free space',
    doc: 'guide/recordings',
    run: async (ctx) => {
      const folders = [...new Set([ctx.settings.recordingsRoot, ctx.settings.mediaRoot].filter(Boolean))]
      const readings = (await Promise.all(folders.map((folder) => diskReading({ folder, statfs: ctx.deps.statfs }))))
        .filter(Boolean)
      if (!readings.length) return { status: 'skip', detail: 'Neither folder can be read.' }
      const graded = readings.map((r) => ({ ...r, status: classifyDiskFree(r) }))
      const worst = graded.reduce((a, b) => (STATUS_RANK[b.status] < STATUS_RANK[a.status] ? b : a))
      const vm = ctx.deps.dockerVm()
      const detail = `${graded.map(describeDisk).join('; ')}.${vm ? VIRTUAL_DISK_NOTE : ''}`
      if (worst.status === 'pass') return { status: 'pass', detail }
      return {
        status: worst.status,
        detail,
        fix: `${formatDiskSize(worst.free)} free on ${worst.folder}. Recordings will fail when it fills.`,
      }
    },
  },
  {
    id: 'plex.reach',
    group: 'plex',
    title: 'Plex library',
    doc: 'guide/troubleshooting#plex-not-refreshing',
    run: async (ctx) => {
      const { plexUrl, plexToken, plexSectionId, mediaRoot } = ctx.settings
      if (!plexUrl || !plexToken) {
        return { status: 'skip', detail: 'Plex is not set up.', action: SETTINGS_PLEX }
      }
      const sections = await ctx.deps.plexSections({ url: plexUrl, token: plexToken })
        .catch((err) => ({ error: err }))
      if (sections.error) {
        return {
          status: 'fail',
          detail: withFullStop(sections.error.message),
          fix: 'Check the Plex address and token in Settings.',
          action: SETTINGS_PLEX,
        }
      }
      const section = sections.find((s) => s.key === String(plexSectionId))
      if (!section) {
        return {
          status: 'fail',
          detail: plexSectionId ? `Plex has no library section ${plexSectionId}.` : 'No Plex TV section is chosen.',
          fix: 'Pick the TV section in Settings.',
          action: SETTINGS_PLEX,
        }
      }
      if (section.type !== 'show') {
        return {
          status: 'fail',
          detail: `Section ${section.title} is a ${section.type} library, not a TV library.`,
          fix: 'Pick a TV Shows section in Settings.',
          action: SETTINGS_PLEX,
        }
      }
      const detail = `Section ${section.title} reads ${section.locations?.join(', ') || 'no folder'}.`
      if (!plexLocationMatches({ locations: section.locations, mediaRoot })) {
        return {
          status: 'warn',
          detail,
          fix: `Point Plex section ${section.title} at the folder behind ${mediaRoot}.`,
          doc: 'guide/plex#the-library-folder',
        }
      }
      return { status: 'pass', detail }
    },
  },
  {
    id: 'plex.oneoffs',
    group: 'plex',
    title: 'Plex one-off library',
    doc: 'guide/troubleshooting#one-offs-that-stay-in-plex',
    run: async (ctx) => {
      const { plexUrl, plexToken, plexOneOffSectionId, oneOffRoot } = ctx.settings
      if (!plexUrl || !plexToken || !plexOneOffSectionId) {
        return { status: 'skip', detail: 'No Plex library is chosen for one-offs.', action: SETTINGS_PLEX }
      }
      const folder = await ctx.deps.oneOffFolder(oneOffRoot)
      if (folder.hasFiles) return { status: 'pass', detail: 'The one-off folder has recordings.' }
      const items = await ctx.deps.plexSectionSize({ url: plexUrl, token: plexToken, sectionId: plexOneOffSectionId }).catch(() => null)
      if (items == null) return { status: 'skip', detail: 'Plex did not answer, so the one-off library was not counted.' }
      if (!items) return { status: 'pass', detail: 'The one-off folder and the Plex one-off library are both empty.' }
      return oneOffGhosts({ items, hasPlaceholder: folder.hasPlaceholder })
    },
  },
  {
    id: 'sync.health',
    group: 'syncs',
    title: 'Syncs',
    doc: 'guide/syncs',
    run: async (ctx) => {
      const [last, expression] = await Promise.all([
        ctx.deps.latestSync(),
        ctx.deps.schedulerExpression(),
      ])
      if (ctx.settings.syncCron && expression === null) {
        return {
          status: 'fail',
          detail: `The sync schedule ${ctx.settings.syncCron} is not running.`,
          fix: 'Check the Freetvarr log for a scheduler error, then restart Freetvarr.',
          doc: 'guide/syncs#scheduled-and-manual',
          action: SETTINGS_SCHEDULE,
        }
      }
      const schedule = expression ? ` ${describeSyncSchedule(expression)}` : ''
      if (!last) return { status: 'pass', detail: `No syncs yet.${schedule}` }
      if (last.status === 'error') {
        return {
          status: 'warn',
          detail: `The last sync failed: ${withFullStop(syncError(last))}`,
          fix: 'Open Syncs to read the full error.',
          action: OPEN_SYNCS,
        }
      }
      if (last.status === 'partial') {
        return {
          status: 'warn',
          detail: `The last sync had ${plural(last.summary?.failed || 0, 'failed import')}.`,
          fix: 'Open Syncs to see which recordings failed and why.',
          action: OPEN_SYNCS,
        }
      }
      return { status: 'pass', detail: `Last sync finished ${fmtStamp(parseDbTime(last.finished_at))}.${schedule}` }
    },
  },
  {
    id: 'live.encoder',
    group: 'live',
    title: 'Live TV encoder',
    doc: 'guide/hardware-requirements#hardware-transcoding',
    run: async (ctx) => {
      const [encoder, ffmpeg] = await Promise.all([ctx.deps.liveEncoder(), ctx.deps.which('ffmpeg')])
      if (!ffmpeg) {
        return {
          status: 'fail',
          detail: 'ffmpeg is not on the PATH.',
          fix: 'Live TV needs ffmpeg. Run Freetvarr from the Docker image, which includes it.',
        }
      }
      if (!encoder) return { status: 'skip', detail: 'Only the running server knows its live TV encoder.' }
      if (encoder.kind === 'vaapi') return { status: 'pass', detail: `Hardware encoding. ${encoder.reason}.` }
      if (encoder.kind === 'copy') return { status: 'pass', detail: `Video passes through unchanged (${encoder.reason}).` }
      if (encoder.reason === 'LIVE_TV_TRANSCODE=software') {
        return { status: 'pass', detail: 'Software encoding, as LIVE_TV_TRANSCODE sets.' }
      }
      if (ctx.deps.dockerVm()) return { status: 'pass', detail: DOCKER_VM_ENCODER_DETAIL }
      return {
        status: 'warn',
        detail: `Software encoding: ${encoder.reason}.`,
        fix: 'HD live TV will use the processor. Pass /dev/dri and set RENDER_GID.',
      }
    },
  },
  {
    id: 'live.streams',
    group: 'live',
    title: 'Live streams',
    doc: 'guide/hardware-requirements#hardware-transcoding',
    run: async (ctx) => liveStreamsCheck(await ctx.deps.liveStreams()),
  },
  {
    id: 'ads.comskip',
    group: 'host',
    title: 'Ad removal tools',
    doc: 'guide/ad-removal',
    run: async (ctx) => {
      if (!ctx.settings.adRemovalEnabled) return { status: 'skip', detail: 'Ad removal is off.' }
      const found = await Promise.all(AD_TOOLS.map((tool) => ctx.deps.which(tool)))
      const missing = AD_TOOLS.filter((tool, i) => !found[i])
      if (!missing.length) return { status: 'pass', detail: `${joinAnd(AD_TOOLS)} are installed.` }
      return {
        status: 'fail',
        detail: `Not on the PATH: ${missing.join(', ')}.`,
        fix: `Ad removal is on but ${joinAnd(missing)} ${missing.length === 1 ? "isn't" : "aren't"} installed; use the Docker image.`,
      }
    },
  },
  {
    id: 'host.env',
    group: 'host',
    title: 'Time zone and network',
    doc: 'guide/troubleshooting#wrong-timestamps',
    run: async (ctx) => {
      const timeZone = resolveTimeZone({
        envTz: ctx.deps.envTimeZone(),
        stored: ctx.settings.timeZone,
        system: ctx.deps.systemTimeZone(),
      })
      const problems = [
        timeZoneProblem({ ...timeZone, stored: ctx.settings.timeZone }),
        networkProblem(ctx.deps.interfaces()),
      ].filter(Boolean)
      if (!problems.length) {
        const zone = `Time zone ${timeZone.zone} (${ZONE_SOURCES[timeZone.source]})`
        const vm = ctx.deps.dockerVm()
        const where = vm
          ? `Docker runs in a virtual machine (${vm})`
          : joinAnd(ipv4Addresses(ctx.deps.interfaces()))
        return { status: 'pass', detail: `${zone}; ${where}.` }
      }
      return {
        status: 'warn',
        detail: problems.map((p) => p.detail).join(' '),
        fix: problems.map((p) => p.fix).join(' '),
        doc: problems[0].doc,
        action: problems.find((p) => p.action)?.action,
      }
    },
  },
  {
    id: 'host.names',
    group: 'host',
    title: 'Allowed hostnames',
    doc: 'guide/troubleshooting#allowed-hostnames',
    run: async (ctx) => hostNamesCheck(await ctx.deps.hostNames()),
  },
]

export const guidePicturesCheck = ({
  programmes = [],
  hosts = new Map(),
  savedTitleKeys = new Set(),
  picturedTitleKeys = new Set(),
  freeviewProblem = null,
  nowMs = Date.now(),
  windowMs = PICTURE_WINDOW_MS,
  minTried = PICTURE_HOST_MIN_TRIED,
  failShare = PICTURE_HOST_FAIL_SHARE,
  minShare = PICTURE_MIN_SHARE,
}) => {
  const airings = programmes.filter((programme) => airsWithin({ programme, nowMs, windowMs }))
  const titles = pictureTitlesOf(airings)
  if (!titles.size) return NOTHING_AIRS_SOON
  const isFailing = (host) => {
    const stats = hosts.get(host)
    return Boolean(stats && stats.tried >= minTried && stats.failed / stats.tried >= failShare)
  }
  const hasPicture = (titleKey, use) => savedTitleKeys.has(titleKey)
    || picturedTitleKeys.has(titleKey)
    || [...use.hosts].some((host) => !isFailing(host))
  const pictured = [...titles].filter(([titleKey, use]) => hasPicture(titleKey, use)).length
  const failingLines = failingHostLinesOf({ titles, isFailing, hasPicture })
  const detail = [`Pictures for ${pictured} of ${plural(titles.size, 'guide title')} in the next 48 h.`, ...failingLines].join(' ')
  if (freeviewProblem) {
    return {
      status: 'warn',
      detail: `${freeviewProblem.detail} ${detail}`,
      fix: freeviewProblem.fix,
      summary: 'Freeview pictures are off.',
    }
  }
  if (pictured / titles.size >= minShare) return { status: 'pass', detail }
  return {
    status: 'warn',
    detail: `Only ${percentOf(pictured, titles.size)} of guide titles have a picture. ${detail}`,
    fix: 'Check that Freetvarr can reach the internet, and that Missing pictures is on under SETTINGS → FILM AND TV INFO. Freetvarr fills in pictures after each guide load, so run the check again after the next one.',
    action: OPEN_PICTURE_SETTINGS,
    summary: 'Many guide titles have no picture.',
  }
}

export const broadcastGuideCheck = ({ broadcast, suggestions = null }) => {
  const place = suggestions?.country ?? 'this time zone'
  const pointer = suggestedFeedsPointerOf(suggestions)
  if (!broadcast) return { status: 'skip', detail: `Freetvarr has no listings source for ${place}, and could not read the TVHeadend guide.${pointer}` }
  const detail = [
    `Freetvarr has no listings source for ${place}, so the guide is the one TVHeadend has: the broadcast guide (EIT), plus any XMLTV grabber you set up.`,
    `${broadcast.listed} of ${plural(broadcast.channels, 'channel')} have listings for the next 48 h, and the guide runs a median ${broadcast.horizonDays} days ahead.`,
  ].join(' ')
  if (!broadcast.short) return { status: 'pass', detail: `${detail}${pointer}` }
  return {
    status: 'warn',
    detail,
    fix: suggestedFeedsFixOf(suggestions),
    action: OPEN_GUIDE_SETTINGS,
    summary: 'The broadcast guide is short or has gaps.',
  }
}

export const suggestedFeedsFixOf = (suggestions) => {
  const [first] = suggestions?.feeds ?? []
  if (!first) return 'Enable the XMLTV URL grabber in TVHeadend with a guide address for your country.'
  return `SETTINGS → GUIDE lists XMLTV feeds for ${suggestions.country}, such as ${first.url} (third-party, licence not checked by Freetvarr). To use one, paste it into the XMLTV URL grabber in TVHeadend.`
}

const suggestedFeedsPointerOf = (suggestions) => (suggestions?.feeds?.length
  ? ` SETTINGS → GUIDE lists third-party XMLTV feeds for ${suggestions.country}.`
  : '')

export const guideSourcesCheck = ({ view, grabber = null, nowMs = Date.now(), staleMs = MERGED_STALE_MS }) => {
  if (!view?.available) return broadcastGuideCheck({ broadcast: null, suggestions: view?.suggestions })
  const detail = view.sources.map(sourceHealthLine).join(' ')
  const primary = view.sources.find((source) => source.id === view.primaryId) ?? null
  const pinnedDegraded = pinnedDegradedOf(view)
  const problems = [
    ...(view.mergedOn ? mergedFileProblems({ builtAt: view.builtAt, nowMs, staleMs }) : []),
    ...(view.mergedOn && primary?.degraded ? [`${primary.label} listings are degraded.`] : []),
    ...(pinnedDegraded.length ? [`You chose ${joinAnd(pinnedDegraded)}, so Freetvarr keeps using it while it is degraded.`] : []),
    ...(grabber && !(grabber.enabled && isGuideFeedUrl(grabber.url)) ? ['The TVHeadend guide grabber does not read the Freetvarr merged guide.'] : []),
  ]
  const waiting = !view.mergedOn && view.repoint?.state !== 'kept' ? ' The merged guide is not in use yet; turn it on under SETTINGS → GUIDE.' : ''
  if (!problems.length) return { status: 'pass', detail: `${detail}${waiting}` }
  return {
    status: 'warn',
    detail: `${problems.join(' ')} ${detail}`,
    fix: pinnedDegraded.length
      ? 'Switch to Automatic, so Freetvarr uses the next source for each channel whose listings are degraded.'
      : `Open SETTINGS → GUIDE to see each source and channel.${suggestedFeedsPointerOf(view.suggestions)}`,
    action: pinnedDegraded.length ? SWITCH_TO_AUTOMATIC : OPEN_GUIDE_SETTINGS,
    summary: problems[0],
  }
}

const sourceHealthLine = (source) => {
  if (!source.measured) return `${source.label}: not measured yet.`
  const parts = [
    source.score === null ? null : `${source.score}% of channels healthy`,
    `${plural(source.horizonDays, 'day')} ahead`,
    source.lastSuccessAt ? `last success ${fmtStamp(source.lastSuccessAt)}` : 'no successful build yet',
  ].filter(Boolean)
  return `${source.label}: ${parts.join(', ')}${source.degraded ? ' (degraded)' : ''}.`
}

const pinnedDegradedOf = (view) => {
  const labels = new Map(view.sources.map((source) => [source.id, source.label]))
  const named = view.choice?.mode && view.choice.mode !== 'auto' && view.sources.find((source) => source.id === view.choice.mode)?.degraded
    ? [labels.get(view.choice.mode)]
    : []
  const pinned = Object.entries(view.choice?.pins ?? {})
    .filter(([channel, source]) => view.degradedPairs?.has(`${source}|${channel}`))
    .map(([channel, source]) => `${labels.get(source) ?? source} for ${view.channels?.find((row) => row.id === channel)?.name ?? channel}`)
  return [...named, ...pinned]
}

const mergedFileProblems = ({ builtAt, nowMs, staleMs }) => {
  if (!builtAt) return ['Freetvarr has not built the merged guide yet.']
  if (nowMs - builtAt <= staleMs) return []
  return [`The merged guide was last built ${formatHours(Math.floor((nowMs - builtAt) / HOUR_MS))} ago.`]
}

const readGrabberOf = async (ctx) => {
  const list = await ctx.read('epggrab/module/list')
  const entry = (list?.entries || []).find((m) => URL_GRABBER_TITLE.test(m.title || ''))
  if (!entry) return { enabled: false, url: '' }
  const node = (await ctx.read('idnode/load', { uuid: entry.uuid }))?.entries?.[0]
  const value = (id) => (node?.params || []).find((p) => p.id === id)?.value
  return { enabled: value('enabled') === true, url: value('args') || '' }
}

const airsWithin = ({ programme, nowMs, windowMs }) =>
  Number(programme.end) > nowMs && Number(programme.start) < nowMs + windowMs

const pictureTitlesOf = (airings) => {
  const titles = new Map()
  for (const airing of airings) {
    const titleKey = showTitleKey(airing.title)
    if (!titleKey) continue
    const use = titles.get(titleKey) ?? { hosts: new Set() }
    const host = hostOfSource(airing.image)
    if (host) use.hosts.add(host)
    titles.set(titleKey, use)
  }
  return titles
}

const failingHostLinesOf = ({ titles, isFailing, hasPicture }) => {
  const byHost = new Map()
  for (const [titleKey, use] of titles) {
    for (const host of [...use.hosts].filter(isFailing)) {
      const counts = byHost.get(host) ?? { titles: 0, pictured: 0 }
      counts.titles += 1
      if (hasPicture(titleKey, use)) counts.pictured += 1
      byHost.set(host, counts)
    }
  }
  return [...byHost]
    .sort(([, a], [, b]) => b.titles - a.titles)
    .map(([host, counts]) => `Pictures from ${host} fail to load; other sources cover ${counts.pictured} of its ${plural(counts.titles, 'title')}.`)
}

const percentOf = (part, whole) => `${Math.round((part / whole) * 100)}%`

const readGuidePictureHealth = async () => ({
  hosts: guideImageHosts.stats(),
  savedTitleKeys: await guidePictureCoverage().catch(() => new Set()),
  picturedTitleKeys: await readPicturedTitleKeys().catch(() => new Set()),
  freeviewProblem: freeviewPictureProblem(),
})

const readPicturedTitleKeys = async () => new Set(await db('art_resolutions')
  .where({ shape: 'landscape' })
  .whereNotNull('origin')
  .distinct('title_key')
  .pluck('title_key'))

export const hostNamesCheck = (report, { hostAllowed = true } = {}) => {
  if (!report) return { status: 'skip', detail: 'Only the running server knows the names it was opened as.' }
  if (report.anyHost) {
    return {
      status: 'warn',
      detail: 'Freetvarr answers to any name, so any website can reach it through a browser on your network.',
      fix: 'Remove * from Allowed hostnames and list the names you use.',
      action: SETTINGS_HOSTNAMES,
    }
  }
  if (!report.seen.length) return { status: 'pass', detail: answersToLine(report.added) }
  const shown = report.seen.slice(0, SHOWN_HOST_NAMES)
  const more = report.seen.length - shown.length
  const names = [...shown.map(seenHostLine), ...(more ? [plural(more, 'more name')] : [])]
  const target = mostUsedOf(report.seen.filter((entry) => entry.page_load && entry.allowable))
  const one = report.seen.length === 1
  return {
    status: 'warn',
    detail: `Freetvarr was opened as ${joinAnd(names)}. From 3.0.0 Freetvarr refuses names it does not know.`,
    fix: `${addLineOf({ one, target, hostAllowed })} ${unknownNameNote(one ? 'the name' : 'a name')}`,
    action: actionFor({ target, hostAllowed }),
  }
}

export const withHostNamesCheck = ({ report, check }) => ({
  ...report,
  checks: report.checks.map((entry) => (entry.id === 'host.names' && entry.status !== 'skip' ? { ...entry, action: undefined, ...check } : entry)),
})

const actionFor = ({ target, hostAllowed }) => {
  if (!target) return SETTINGS_HOSTNAMES
  return hostAllowed ? allowActionOf(target.name) : undefined
}

const mostUsedOf = (entries) => (entries.length ? entries.reduce((a, b) => (b.count > a.count ? b : a)) : null)

const addLineOf = ({ one, target, hostAllowed }) => {
  if (target && !hostAllowed) return `Open Freetvarr by its IP address, then press ${allowLabelOf(target.name)} here.`
  if (!one) return 'If you open Freetvarr by these names, allow each one in Allowed hostnames.'
  return target
    ? `If you open Freetvarr by this name, press ${allowLabelOf(target.name)}.`
    : 'If you open Freetvarr by this name, add it in Allowed hostnames.'
}

const allowActionOf = (name) => ({
  label: allowLabelOf(name),
  post: `/api/allowed-hosts/allow/${encodeURIComponent(name)}`,
  done: `Added ${name} to Allowed hostnames.`,
})

const allowLabelOf = (name) => `Allow ${name.length > ALLOW_LABEL_NAME_LENGTH ? `${name.slice(0, ALLOW_LABEL_NAME_LENGTH - 1)}…` : name}`

const answersToLine = (added) => (added
  ? `Freetvarr answers to IP addresses, local names, and ${plural(added, 'name')} you added.`
  : 'Freetvarr answers to IP addresses and local names.')

const seenHostLine = ({ name, count, last_seen: lastSeen, from }) =>
  `${name} (${plural(count, 'request')}, last ${fmtStamp(lastSeen)}${from ? `, from ${from}` : ''})`

export const liveStreamsCheck = (streams) => {
  const measured = describeBenchmark(streams?.benchmark)
  if (!measured) return { status: 'skip', detail: 'The live TV speed test has not run yet.' }
  const limit = `Freetvarr plays up to ${streams.max_live_streams} at once.`
  if (streams.max_live_streams > streams.benchmark.estimated) {
    return {
      status: 'warn',
      detail: `${measured}. ${limit}`,
      fix: liveStreamsFix(streams.benchmark.estimated),
      action: SETTINGS_PLAYER,
    }
  }
  return { status: 'pass', detail: `${measured}. ${limit}` }
}

const liveStreamsFix = (estimated) => estimated
  ? `Pictures may stutter. Set Live streams at once to ${estimated}.`
  : 'Pictures may stutter even with 1 live stream.'

export const oneOffGhosts = ({ items, hasPlaceholder }) => {
  const detail = `The Plex one-off library has ${plural(items, 'item')} while the one-off folder has no files.`
  if (hasPlaceholder) {
    return { status: 'warn', detail, fix: 'In Plex, scan the one-off library, then use Empty Trash on it.' }
  }
  return {
    status: 'warn',
    detail,
    fix: 'Plex reads an empty folder as a missing drive and keeps the old items. Create the placeholder file so Plex can clear them at its next scan.',
    action: CREATE_ONE_OFF_PLACEHOLDER,
  }
}

const readOneOffFolder = async (oneOffRoot) => ({
  hasFiles: await hasRecordingFiles(oneOffRoot),
  hasPlaceholder: await hasOneOffPlaceholder(oneOffRoot),
})

const runCheck = async ({ spec, ctx }) => {
  const base = { id: spec.id, group: spec.group, title: spec.title, doc: spec.doc, fix: '' }
  try {
    const outcome = await withTimeout(spec.run(ctx), ctx.timeoutMs)
    if (outcome === TIMED_OUT) {
      return { ...base, status: 'fail', detail: `No answer within ${fmtSeconds(ctx.timeoutMs)}.` }
    }
    return { ...base, ...outcome }
  } catch (err) {
    return { ...base, ...failureFrom(err) }
  }
}

const failureFrom = (err) => {
  if (err?.code === 'auth' && err.status === 403) {
    return {
      status: 'skip',
      detail: `TVHeadend refused ${err.stage} (HTTP 403). Fix the user rights first.`,
      doc: RIGHTS_DOC,
    }
  }
  return { status: 'fail', detail: withFullStop(String(err?.message || err)) }
}

const skipped = (spec) => ({
  id: spec.id,
  group: spec.group,
  title: spec.title,
  doc: spec.doc,
  status: 'skip',
  detail: 'Fix the TVHeadend connection first.',
  fix: '',
})

const loginFailure = ({ err, username }) => {
  if (err.status === 403) {
    return {
      detail: `TVHeadend refused the login${username ? ` for ${username}` : ''} (HTTP 403).`,
      fix: 'Wrong password, a network outside the allowed range, or a missing right. Check each under Configuration → Users in TVHeadend.',
    }
  }
  if (!username) {
    return {
      detail: 'TVHeadend asked for a login (HTTP 401).',
      fix: 'No username was sent; enter the freetvarr user in Settings.',
    }
  }
  return {
    detail: `TVHeadend did not accept the login for ${username} (HTTP 401).`,
    fix: 'Check the username and password in Settings.',
  }
}

const mediaFolderFix = ({ result, mediaRoot, uid }) => {
  if (result.ownerUid == null) return 'Mount your TV library at this path, or change the media folder in Settings.'
  if (uid != null && result.ownerUid !== uid) {
    return `${mediaRoot} is owned by uid ${result.ownerUid}; Freetvarr runs as ${uid}. Set the same PUID and PGID on both services.`
  }
  return 'Make the folder writable by the user Freetvarr runs as.'
}

const recordingsFolder = (ctx) => {
  ctx.recordingsCheck ??= ctx.deps.checkRecordingsFolder({
    recordingsPath: ctx.settings.recordingsRoot,
    mediaRoot: ctx.settings.mediaRoot,
  })
  return ctx.recordingsCheck
}

const diskReading = async ({ folder, statfs }) => {
  try {
    const st = await statfs(folder)
    return { folder, free: st.bavail * st.bsize, total: st.blocks * st.bsize }
  } catch {
    return null
  }
}

const describeDisk = ({ folder, free, total }) => total > 0
  ? `${formatDiskSize(free)} free on ${folder} (${Math.round((free / total) * 100)}% of the disk)`
  : `${formatDiskSize(free)} free on ${folder}`

const VIRTUAL_DISK_NOTE = " This is Docker's virtual disk. Real space is limited by the disk of your Mac or PC."

const DOCKER_VM_ENCODER_DETAIL = 'Live TV uses the processor. Docker on a Mac or Windows PC cannot use the graphics chip.'

const tvhVersion = (swVersion) => String(swVersion || '').match(/^\d+\.\d+/)?.[0] || swVersion || '(unknown version)'

const guideListings = ({ empty, channels }) => empty === 0
  ? `Every channel has listings for the next ${formatHours(24)}.`
  : `${empty} of ${plural(channels, 'channel')} ${empty === 1 ? 'has' : 'have'} no listings in the next ${formatHours(24)}.`

const guideReach = ({ lastStopMs, now }) => {
  if (!lastStopMs) return 'The guide has no programmes.'
  if (lastStopMs <= now) return `The guide ended at ${fmtStamp(lastStopMs)}.`
  return `The guide runs ${formatHours(Math.round((lastStopMs - now) / HOUR_MS))} ahead, to ${fmtStamp(lastStopMs)}.`
}

const withFullStop = (message) => (/[.!?]$/.test(String(message).trim()) ? message : `${message}.`)

const syncError = (sync) => sync.summary?.errors?.[0] || sync.summary?.message || 'no reason recorded'

const timeZoneProblem = ({ zone, source, stored }) => {
  const doc = 'guide/troubleshooting#wrong-timestamps'
  if (stored && !isKnownTimeZone(stored)) {
    return { detail: `The time zone setting is ${stored}, which is not a known time zone.`, fix: TZ_SETTINGS_FIX, doc, action: SETTINGS_SCHEDULE }
  }
  if (source === 'env' && !isKnownTimeZone(zone)) {
    return { detail: `TZ is ${zone}, which is not a known time zone.`, fix: TZ_ENV_FIX, doc }
  }
  if (source === 'env') return null
  if (source === 'system' && UTC_ZONES.includes(zone)) {
    return { detail: 'No time zone is chosen, so Freetvarr runs on UTC.', fix: TZ_SETTINGS_FIX, doc, action: SETTINGS_SCHEDULE }
  }
  return null
}

const noTunerFix = ({ dockerVm, interfaces }) => {
  const vm = dockerVm()
  if (vm) {
    return {
      fix: `Docker on a Mac or Windows PC (${vm}) cannot find a network tuner by itself. Enter the tuner's address under SETTINGS → SETUP → CHANNELS, or run Freetvarr on Linux (a NAS, mini PC, or Raspberry Pi).`,
      action: OPEN_SETUP_CHANNELS,
    }
  }
  const network = isBridgeOnly(interfaces())
    ? 'Set network_mode: host on the tvheadend and freetvarr services.'
    : 'Check that the tuner is on and connected to your network.'
  return {
    fix: `${network} Or enter the tuner's address under SETTINGS → SETUP → CHANNELS. For a USB or PCIe tuner, pass /dev/dvb into the tvheadend service.`,
    action: OPEN_SETUP_CHANNELS,
  }
}

const networkProblem = (interfaces) => {
  if (!isBridgeOnly(interfaces)) return null
  return {
    detail: `Freetvarr has only Docker bridge addresses (${ipv4Addresses(interfaces).join(', ')}).`,
    fix: 'Use network_mode: host on freetvarr.',
    doc: 'guide/troubleshooting#container-name-lookups',
  }
}

const readSettings = async () => {
  const [mediaRoot, recordingsRoot, tvhRecordingsPath, plexUrl, plexToken, plexSectionId, plexOneOffSectionId, syncCron, adRemoval, oneOffRoot, moviesRoot] =
    await Promise.all([
      getMediaRoot(),
      getRecordingsRoot(),
      getTvhRecordingsPath(),
      getSetting('plex_url'),
      storedPlexToken(),
      getSetting('plex_tv_section_id'),
      getSetting('plex_oneoff_section_id'),
      getSetting('sync_cron'),
      getSetting('ad_removal_enabled'),
      getOneOffRoot(),
      getMoviesRoot(),
    ])
  return {
    mediaRoot,
    oneOffRoot,
    moviesRoot,
    recordingsRoot,
    tvhRecordingsPath,
    plexUrl: plexUrl || '',
    plexToken: plexToken || '',
    plexSectionId: plexSectionId || '',
    plexOneOffSectionId: plexOneOffSectionId || '',
    syncCron: syncCron || '',
    adRemovalEnabled: adRemoval === 'true',
    timeZone: (await getSetting('time_zone')) || '',
  }
}

const readLatestSync = async () => {
  const row = await db('syncs').whereNot({ status: 'running' }).orderBy('started_at', 'desc').first()
  return row ? { ...row, summary: parseJson(row.summary_json) } : null
}

const findOnPath = async (tool) => {
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const found = await fs.access(path.join(dir, tool), fsConstants.X_OK).then(() => true, () => false)
    if (found) return path.join(dir, tool)
  }
  return null
}

const defaultDeps = () => ({
  settings: readSettings,
  connection: () => resolveConnection(),
  tvhRead,
  walkTuners,
  guide: getGuideSnapshot,
  plexSections: listPlexSections,
  plexSectionSize: countPlexSectionItems,
  oneOffFolder: readOneOffFolder,
  checkRecordingsFolder,
  checkMediaRoot,
  libraryRootProblem: (root) => libraryRootProblemOf(root),
  probeHardlink,
  statfs: (folder) => fs.statfs(folder),
  latestSync: readLatestSync,
  anchorFailures: readAnchorFailures,
  schedulerExpression: getSchedulerExpression,
  liveEncoder: async () => null,
  liveStreams: async () => null,
  currentGuideFeedUrl,
  which: findOnPath,
  envTimeZone: timeZoneFromEnv,
  systemTimeZone: currentTimeZone,
  interfaces: () => os.networkInterfaces(),
  dockerVm: () => detectDockerVm(),
  uid: () => process.getuid?.() ?? null,
  hostNames: async () => null,
  guidePictureHealth: readGuidePictureHealth,
  guideSources: async () => null,
})

const URL_GRABBER_TITLE = /XMLTV URL grabber/i

const staleGuideFeedOf = async (ctx) => {
  try {
    return await readStaleGuideFeed(ctx)
  } catch {
    return null
  }
}

const readStaleGuideFeed = async (ctx) => {
  const list = await ctx.read('epggrab/module/list')
  const entry = (list?.entries || []).find((m) => URL_GRABBER_TITLE.test(m.title || ''))
  if (!entry) return null
  const node = (await ctx.read('idnode/load', { uuid: entry.uuid }))?.entries?.[0]
  const value = (id) => (node?.params || []).find((p) => p.id === id)?.value
  const grabberUrl = value('args') || ''
  if (value('enabled') !== true || !isGuideFeedUrl(grabberUrl)) return null
  const currentUrl = await ctx.deps.currentGuideFeedUrl(ctx.conn)
  if (!currentUrl || new URL(currentUrl).host === new URL(grabberUrl).host) return null
  return {
    detail: `The TVHeadend guide grabber reads ${grabberUrl}, but the Freetvarr guide feed is now at ${currentUrl}.`,
    fix: 'Open Settings → SYSTEM → Setup and press Guide to point the grabber at the new address.',
  }
}

const currentGuideFeedUrl = async (conn) => {
  try {
    return guideFeedUrl({ address: await localAddressToward(conn.url), port: serverPort() })
  } catch {
    return null
  }
}

const memoiseReads = ({ read, conn }) => {
  const seen = new Map()
  return (apiPath, params = {}) => {
    const key = `${apiPath}?${new URLSearchParams(params)}`
    if (!seen.has(key)) seen.set(key, read(apiPath, params, conn()))
    return seen.get(key)
  }
}

const withTimeout = (promise, ms) => {
  let timer
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const settleWithin = async (promise, ms) => {
  const value = await withTimeout(Promise.resolve(promise).catch(() => null), ms)
  return value === TIMED_OUT ? null : value
}

const summarise = (checks) => Object.fromEntries(STATUSES.map((status) =>
  [status, checks.filter((c) => c.status === status).length]))

const isHealthy = (result) => result.status === 'pass' || result.status === 'warn'

const accessEntryName = (conn) => (conn?.username ? `the ${conn.username} entry` : 'the anonymous entry')

const ipv4Addresses = (interfaces) => Object.values(interfaces || {})
  .flat()
  .filter((i) => i && (i.family === 'IPv4' || i.family === 4) && !i.internal)
  .map((i) => i.address)

const isDockerBridgeAddress = (address) => /^172\.(1[6-9]|2\d|3[01])\./.test(address)


const pathSegments = (value) => String(value || '').split(/[/\\]+/).filter(Boolean)

const parseJson = (raw) => {
  try { return JSON.parse(raw) } catch { return null }
}

const parseDbTime = (value) => {
  const text = String(value || '')
  return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text)
}

const fmtStamp = (ms) => {
  if (!Number.isFinite(ms)) return 'at an unknown time'
  const timeZone = currentTimeZone()
  const dateParts = (at) => Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', { timeZone, day: 'numeric', month: 'short', year: 'numeric' })
      .formatToParts(new Date(at)).map((p) => [p.type, p.value]),
  )
  const { day, month, year } = dateParts(ms)
  const date = year === dateParts(Date.now()).year ? `${day} ${month}` : `${day} ${month} ${year}`
  return `${date} ${formatClock(ms, timeZone)}`
}


const fmtSeconds = (ms) => formatSeconds(ms / 1000)

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const share = (part, whole) => `${part} of ${plural(whole, 'channel')} ${part === 1 ? 'has' : 'have'}`

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1)

const joinAnd = (items) => {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')}${items.length > 2 ? ',' : ''} and ${items.at(-1)}`
}

let reportCache = null
let reportInflight = null

const TIMED_OUT = Symbol('timed out')
const STATUSES = ['pass', 'warn', 'fail', 'skip']
const STATUS_RANK = { fail: 0, warn: 1, pass: 2, skip: 3 }
const DEFAULT_TIMEOUT_MS = 8000
const REPORT_TTL_MS = 15_000
const DOCTOR_FIRST_RUN_MS = 2 * 60 * 1000
const DOCTOR_EVERY_MS = 3 * 60 * 60 * 1000
const MIN_API_VERSION = 19
const CHANNEL_LIMIT = 1000
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const GUIDE_FAIL_MS = 12 * HOUR_MS
const GUIDE_WARN_MS = 48 * HOUR_MS
const GUIDE_EMPTY_SHARE = 0.25
const PICTURE_HOST_MIN_TRIED = 10
const PICTURE_HOST_FAIL_SHARE = 0.5
const PICTURE_MIN_SHARE = 0.8
const PICTURE_WINDOW_MS = 48 * HOUR_MS
const NOTHING_AIRS_SOON = { status: 'skip', detail: 'The guide has no programmes in the next 48 h yet.' }
const GB = 1e9
const NO_CHANNELS_YET = 'No channels yet.'
const DISK_FAIL_BYTES = 10 * GB
const DISK_WARN_BYTES = 20 * GB
const DISK_WARN_SHARE = 0.1
const LINK_LOCAL = /\b169\.254\.\d+\.\d+/
const UTC_ZONES = ['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT', 'Etc/Universal', 'Universal', 'Zulu']
const AD_TOOLS = ['comskip', 'ffmpeg', 'ffprobe']
const TZ_ENV_FIX = 'Correct TZ in .env (for example Australia/Sydney), or choose the zone in Settings.'
const TZ_SETTINGS_FIX = 'Choose your time zone in Settings.'
const ZONE_SOURCES = { env: 'from TZ in .env', setting: 'from Settings', system: 'from the system' }
const RIGHTS_DOC = 'guide/tvheadend#_8-make-a-user-for-freetvarr'
const ACCESS_ENTRY_LIMIT = 100
const RIGHT_PROBES = [
  { right: 'Admin', path: 'status/inputs', params: {} },
  { right: 'Video recorder', path: 'dvr/entry/grid_upcoming', params: { limit: 1 } },
]
const SETTINGS_TVHEADEND = { label: 'Open settings', href: '#/settings/system/tvheadend' }
const SETTINGS_STORAGE = { label: 'Open settings', href: '#/settings/storage' }
const SETTINGS_PLEX = { label: 'Open settings', href: '#/settings/plex' }
const SETTINGS_SCHEDULE = { label: 'Open settings', href: '#/settings/schedule' }
const SETTINGS_PLAYER = { label: 'Open settings', href: '#/settings/player' }
const OPEN_SYNCS = { label: 'Open syncs', href: '#/settings/system/activity/syncs' }
const CREATE_ONE_OFF_PLACEHOLDER = { label: 'Create placeholder file', post: '/api/doctor/one-off-placeholder', done: 'Created the placeholder file.' }
const OPEN_SETUP_CHANNELS = { label: 'Open setup', href: '#/settings/system/setup/channels' }
const OPEN_GUIDE_SETTINGS = { label: 'Open settings', href: '#/settings/guide' }
const OPEN_PICTURE_SETTINGS = { label: 'Open settings', href: '#/settings/film-tv-info' }
const SWITCH_TO_AUTOMATIC = { label: 'Switch to Automatic', post: '/api/guide-sources/automatic', done: 'Switched the listings source to Automatic.' }
const MERGED_STALE_MS = 12 * 60 * 60 * 1000
const SETTINGS_HOSTNAMES = { label: 'Open setup', href: '#/settings/system/setup/hostnames' }
const SHOWN_HOST_NAMES = 3
const ALLOW_LABEL_NAME_LENGTH = 40
const unknownNameNote = (which) => `If you do not know ${which}, leave it out: a website may have tried to reach Freetvarr through a browser on your network.`
