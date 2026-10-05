import fs from 'fs/promises'
import { constants as fsConstants } from 'fs'
import os from 'os'
import path from 'path'

import { db, getSetting } from './db.js'
import { tvhRead, walkTuners, resolveConnection } from './tvheadend.js'
import { findOpenAdminEntries } from './tvheadend-bootstrap.js'
import { listPlexSections } from './plex.js'
import { checkRecordingsFolder, checkMediaRoot, compareRecordingPaths, probeHardlink } from './path-check.js'
import { getMediaRoot, getMoviesRoot, getOneOffRoot, getRecordingsRoot, getTvhRecordingsPath } from './sync.js'
import { getSchedulerExpression } from './scheduler.js'
import { getGuideSnapshot } from './epg.js'
import { currentTimeZone, isKnownTimeZone, resolveTimeZone, timeZoneFromEnv } from './time-zone.js'

export const getDoctorReport = async ({ fresh = false, deps = {} } = {}) => {
  if (!fresh && reportCache && reportCache.expiresAt > Date.now()) return reportCache.value
  if (reportInflight) return reportInflight
  reportInflight = runDoctor({ deps })
    .then((value) => {
      reportCache = { value, expiresAt: Date.now() + REPORT_TTL_MS }
      return value
    })
    .finally(() => { reportInflight = null })
  return reportInflight
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
  doc: 'guide/troubleshooting#wizard-connection-test',
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
        detail: `${info.unreachable.message}.`,
        fix: `Freetvarr can't reach TVHeadend at ${ctx.conn.url}. Check the address, or use AUTO-DISCOVER in Settings.`,
        action: SETTINGS_TVHEADEND,
      }
    }
    ctx.tvhAnswered = true
    if (!info) return { status: 'pass', detail: `TVHeadend answers at ${ctx.conn.url}.` }
    const detail = `TVHeadend ${info.sw_version || '(unknown version)'} at ${ctx.conn.url}, API version ${info.api_version ?? 'unknown'}.`
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
        fix: 'On a fresh TVHeadend, run the setup wizard and choose SECURE TVHEADEND. Otherwise make an admin user in TVHeadend, then delete the * entry under Configuration → Users → Access Entries.',
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
      if (!count) {
        return {
          status: 'fail',
          detail: 'TVHeadend sees no tuner.',
          fix: 'No tuner visible. Set network_mode: host on the tvheadend service for a network tuner, or pass /dev/dvb into it for a USB or PCIe tuner.',
        }
      }
      const detail = `${plural(count, 'tuner')}: ${inputs.join('; ') || 'no input names reported'}.`
      if (inputs.some((i) => LINK_LOCAL.test(i))) {
        return {
          status: 'warn',
          detail,
          fix: 'The tuner has a link-local address (169.254.x.x), so it may change if you move it.',
          doc: 'guide/hardware#direct-to-a-spare-nas-port',
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
          fix: 'No channels yet. Scan your muxes and map services in TVHeadend.',
        }
      }
      return { status: 'pass', detail: `${plural(total, 'channel')} in TVHeadend.` }
    },
  },
  {
    id: 'guide.depth',
    group: 'guide',
    title: 'Guide depth',
    doc: 'guide/troubleshooting#empty-guide',
    needsTvh: true,
    run: async (ctx) => {
      const [body, guide] = await Promise.all([
        ctx.read('epg/events/grid', { sort: 'stop', dir: 'DESC', limit: 1 }),
        settleWithin(ctx.deps.guide(), ctx.timeoutMs / 2),
      ])
      const lastStop = body?.entries?.[0]?.stop
      const lastStopMs = lastStop ? lastStop * 1000 : null
      const coverage = guide ? guideCoverage({ guide, now: ctx.now }) : null
      const emptyShare = coverage?.channels ? coverage.empty / coverage.channels : 0
      const status = classifyGuideDepth({ lastStopMs, now: ctx.now, emptyShare })
      const detail = [
        guideReach({ lastStopMs, now: ctx.now }),
        ...(coverage?.channels ? [`${share(coverage.empty, coverage.channels)} nothing in the next 24 h.`] : []),
      ].join(' ')
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
    id: 'paths.recordings',
    group: 'storage',
    title: 'Recordings folder',
    doc: 'guide/troubleshooting#test-path-failures',
    run: async (ctx) => {
      const result = await recordingsFolder(ctx)
      if (result.ok) return { status: 'pass', detail: `${result.path} is readable.` }
      return {
        status: 'fail',
        detail: `${result.error}.`,
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
        detail: `${result.error}.`,
        fix: mediaFolderFix({ result, mediaRoot: ctx.settings.mediaRoot, uid: ctx.deps.uid() }),
        action: SETTINGS_STORAGE,
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
      const detail = graded.map(describeDisk).join('; ')
      if (worst.status === 'pass') return { status: 'pass', detail: `${detail}.` }
      return {
        status: worst.status,
        detail: `${detail}.`,
        fix: `${fmtGb(worst.free)} free on ${worst.folder}. Recordings will fail when it fills.`,
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
          detail: `${sections.error.message}.`,
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
    id: 'sync.health',
    group: 'plex',
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
      const schedule = expression ? ` Schedule: ${expression}.` : ''
      if (!last) return { status: 'pass', detail: `No syncs yet.${schedule}` }
      if (last.status === 'error') {
        return {
          status: 'warn',
          detail: `The last sync failed: ${syncError(last)}.`,
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
      return { status: 'pass', detail: `Sync #${last.id} finished ${fmtStamp(parseDbTime(last.finished_at))}.${schedule}` }
    },
  },
  {
    id: 'live.encoder',
    group: 'live',
    title: 'Live TV encoder',
    doc: 'guide/hardware#hardware-transcoding',
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
      return {
        status: 'warn',
        detail: `Software encoding: ${encoder.reason}.`,
        fix: 'HD live TV will use the processor. Pass /dev/dri and set RENDER_GID.',
      }
    },
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
        const addresses = joinAnd(ipv4Addresses(ctx.deps.interfaces()))
        return { status: 'pass', detail: `Time zone ${timeZone.zone} (${ZONE_SOURCES[timeZone.source]}); ${addresses}.` }
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
]

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
  return { status: 'fail', detail: `${err?.message || err}.` }
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
  ? `${fmtGb(free)} free on ${folder} (${Math.round((free / total) * 100)}%)`
  : `${fmtGb(free)} free on ${folder}`

const guideReach = ({ lastStopMs, now }) => {
  if (!lastStopMs) return 'The guide has no programmes.'
  if (lastStopMs <= now) return `The guide ended at ${fmtStamp(lastStopMs)}.`
  return `The guide runs ${Math.round((lastStopMs - now) / HOUR_MS)} h ahead, to ${fmtStamp(lastStopMs)}.`
}

const syncError = (sync) => sync.summary?.errors?.[0] || sync.summary?.message || 'no reason recorded'

const timeZoneProblem = ({ zone, source, stored }) => {
  const doc = 'guide/troubleshooting#wrong-timestamps'
  if (source === 'env' && !isKnownTimeZone(zone)) {
    return { detail: `TZ is ${zone}, which is not a known time zone.`, fix: TZ_ENV_FIX, doc }
  }
  if (source === 'env') return null
  if (stored && !isKnownTimeZone(stored)) {
    return { detail: `The time zone setting is ${stored}, which is not a known time zone.`, fix: TZ_SETTINGS_FIX, doc, action: SETTINGS_SCHEDULE }
  }
  if (source === 'system' && UTC_ZONES.includes(zone)) {
    return { detail: 'No time zone is chosen, so Freetvarr runs on UTC.', fix: TZ_SETTINGS_FIX, doc, action: SETTINGS_SCHEDULE }
  }
  return null
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
  const [mediaRoot, recordingsRoot, tvhRecordingsPath, plexUrl, plexToken, plexSectionId, syncCron, adRemoval, oneOffRoot, moviesRoot] =
    await Promise.all([
      getMediaRoot(),
      getRecordingsRoot(),
      getTvhRecordingsPath(),
      getSetting('plex_url'),
      getSetting('plex_token'),
      getSetting('plex_tv_section_id'),
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
  checkRecordingsFolder,
  checkMediaRoot,
  probeHardlink,
  statfs: (folder) => fs.statfs(folder),
  latestSync: readLatestSync,
  schedulerExpression: getSchedulerExpression,
  liveEncoder: async () => null,
  which: findOnPath,
  envTimeZone: timeZoneFromEnv,
  systemTimeZone: currentTimeZone,
  interfaces: () => os.networkInterfaces(),
  uid: () => process.getuid?.() ?? null,
})

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
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fmtGb = (bytes) => `${(bytes / GB).toFixed(bytes < 10 * GB ? 1 : 0)} GB`

const fmtSeconds = (ms) => `${Number((ms / 1000).toFixed(2))} s`

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
const MIN_API_VERSION = 19
const CHANNEL_LIMIT = 1000
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const GUIDE_FAIL_MS = 12 * HOUR_MS
const GUIDE_WARN_MS = 48 * HOUR_MS
const GUIDE_EMPTY_SHARE = 0.25
const GB = 1e9
const DISK_FAIL_BYTES = 2 * GB
const DISK_WARN_BYTES = 20 * GB
const DISK_WARN_SHARE = 0.1
const LINK_LOCAL = /\b169\.254\.\d+\.\d+/
const UTC_ZONES = ['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT', 'Etc/Universal', 'Universal', 'Zulu']
const AD_TOOLS = ['comskip', 'ffmpeg', 'ffprobe']
const TZ_ENV_FIX = 'Correct TZ in .env (for example Australia/Sydney), or remove it and choose the zone in Settings.'
const TZ_SETTINGS_FIX = 'Choose your time zone in Settings.'
const ZONE_SOURCES = { env: 'from TZ in .env', setting: 'from Settings', system: 'from the system' }
const RIGHTS_DOC = 'guide/tvheadend#_8-make-a-user-for-freetvarr'
const ACCESS_ENTRY_LIMIT = 100
const RIGHT_PROBES = [
  { right: 'Admin', path: 'status/inputs', params: {} },
  { right: 'Video recorder', path: 'dvr/entry/grid_upcoming', params: { limit: 1 } },
]
const SETTINGS_TVHEADEND = { label: 'Open settings', href: '#/settings/tvheadend' }
const SETTINGS_STORAGE = { label: 'Open settings', href: '#/settings/storage' }
const SETTINGS_PLEX = { label: 'Open settings', href: '#/settings/plex' }
const SETTINGS_SCHEDULE = { label: 'Open settings', href: '#/settings/schedule' }
const OPEN_SYNCS = { label: 'Open syncs', href: '#/syncs' }
