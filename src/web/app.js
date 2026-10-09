import {
  createApp,
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
} from '/vendor/vue.esm-browser.prod.js'
import { isStaleBuild, shouldReloadOnPull } from '/stale-build.js'
import { isNewerRelease, latestReleaseTag } from '/version-check.js'
import {
  localDayNumber,
  weekdayOfDayNumber,
  localClockMs,
  dayLengthMin,
  spillLengthMin,
  rulerTickMinutes,
} from '/guide-time.js'
import { findSeriesLink } from '/series-link.js'
import { seekPlan, adBreakAt, fmtPlayTime, RESUME_END_MARGIN_S, SEEK_EDGE_MARGIN_S } from '/playback.js'
import {
  DOUBLE_TAP_MS, emptyTapState, zoneOf, isTap, registerTap, clampSkip, skipLabel, skipSpoken,
  nativeClickPlan,
} from '/double-tap.js'
import { findHdSimulcast } from '/simulcast.js'
import { liveRecordButton, nowProgramFor } from '/live-record.js'
import { filterOptions, optionLabel, nextChoosableIndex, isChoosable } from '/typeahead.js'
import { transmitterLabel } from '/transmitter-label.js'
import { revealStepMs, isStepResolved, pacedSteps, SECURE_REVEAL_PACING } from '/paced-reveal.js'
import {
  dateFormat as cachedDateFormat,
  formatClock,
  formatClockSeconds,
  formatDate,
  formatHours,
  formatMinutes,
  formatSeconds,
  formatUptime,
} from '/time-format.js'
import {
  CUSTOM_SYNC_SCHEDULE,
  DEFAULT_SYNC_CRON,
  SYNC_SCHEDULE_PRESETS,
  describeSyncFrequency,
  normaliseCron,
  syncSchedulePreset,
} from '/sync-schedule.js'
import { withBrowserNetwork } from '/lan-network.js'
import { tvAppsAddresses, tvAppsHost } from '/tv-apps.js'
import { wizardSkipPrompt } from '/wizard-skip.js'
import { clearListPrompt, clearedListMessage, restoredListMessage } from '/clear-list.js'
import { adScanTitle, canAdScan as canAdScanRecording, isAdScanBlocked } from '/ad-scan.js'

let csrfToken = null

const BUILD_HEADER = 'X-Freetvarr-Build'
const loadedBuild = document.querySelector('meta[name="freetvarr-build"]')?.content || null
const latestBuild = ref(null)

const noteBuild = (res) => {
  const build = res.headers.get(BUILD_HEADER)
  if (build) latestBuild.value = build
  return res
}

const serverAbout = ref({})

const fetchServerAbout = async (query = '') => {
  const res = noteBuild(await fetch(`/api/version${query}`, { cache: 'no-store' }))
  const about = await res.json()
  serverAbout.value = { ...serverAbout.value, ...about }
  return about
}

const checkForNewBuild = () => fetchServerAbout().catch(() => {})

const REPO_URL = 'https://github.com/furey/freetvarr'
const releaseUrl = (version) => `${REPO_URL}/tree/${encodeURIComponent(version)}`

const staleBuild = computed(() => isStaleBuild({
  loaded: loadedBuild,
  latest: latestBuild.value,
}))

const getCsrf = async ({ force = false } = {}) => {
  if (csrfToken && !force) return csrfToken
  const res = noteBuild(await fetch('/api/csrf-token'))
  if (!res.ok) throw new Error(`csrf-token HTTP ${res.status}`)
  const data = await res.json().catch(() => {
    throw new Error(`csrf-token returned non-JSON (HTTP ${res.status})`)
  })
  csrfToken = data.token
  return csrfToken
}

const apiCall = async (method, url, body, headersExtra = {}) => {
  const headers = { 'Content-Type': 'application/json', ...headersExtra }
  const res = noteBuild(await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }))
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || data.reason || `HTTP ${res.status}`)
    err.code = data.code || null
    err.stage = data.stage || null
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

const api = async (method, url, body) => {
  if (method === 'GET') return apiCall(method, url, body)
  try {
    return await apiCall(method, url, body, { 'x-csrf-token': await getCsrf() })
  } catch (err) {
    if (!/HTTP 403/.test(err.message)) throw err
    csrfToken = null
    return apiCall(method, url, body, { 'x-csrf-token': await getCsrf({ force: true }) })
  }
}

const fmtBytes = (n) => {
  if (!n || n <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = Number(n)
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)}${units[i]}`
}

const tvhDetectSummary = (c) => {
  const auth = c.needsAuth ? ' (asks for a login)' : ''
  const loop = c.loopback ? '. Only loopback answered. Use a LAN IP so logos and live TV load in the browser' : ''
  return `Found TVHeadend at ${c.url}${auth}${loop}.`
}

const tvhTestSummary = (r) => {
  const bits = []
  if (r.channels) bits.push(`${r.channels} channel${r.channels === 1 ? '' : 's'}`)
  if (r.tuners) bits.push(`${r.tuners} tuner${r.tuners === 1 ? '' : 's'}`)
  return bits.length ? `Connected to TVHeadend · ${bits.join(' · ')}.` : 'Connected to TVHeadend.'
}

const tz = ref('UTC')

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || ''

const dateFormat = (options, timeZone = tz.value) => cachedDateFormat(options, timeZone)

const toIso = (s) => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s)

const fmtTime = (s) => {
  if (!s) return ''
  const date = new Date(toIso(s))
  const parts = Object.fromEntries(dateFormat({
    day: 'numeric', month: 'short', year: 'numeric',
  }).formatToParts(date).map((p) => [p.type, p.value]))
  const thisYear = dateFormat({ year: 'numeric' }).format(new Date())
  const day = parts.year === thisYear ? `${parts.day}\u00a0${parts.month}` : `${parts.day}\u00a0${parts.month}\u00a0${parts.year}`
  return `${day} ${formatClock(date.getTime(), tz.value)}`
}

const fmtAgo = ({ at, nowMs }) => {
  const mins = Math.floor((nowMs - Date.parse(toIso(at))) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${formatMinutes(mins)} ago`
  if (mins < 1440) return `${formatHours(Math.floor(mins / 60))} ago`
  return fmtTime(at)
}

const fmtElapsed = ({ at, nowMs }) => {
  const secs = Math.max(0, Math.floor((nowMs - Date.parse(toIso(at))) / 1000))
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

const plexSummary = (p) => {
  if (p.triggered) return { kind: 'mark', label: 'plex', mark: 'done', text: `(${p.status})` }
  if (p.skipped) return { kind: 'text', text: 'plex: skipped' }
  if (p.error) return { kind: 'mark', label: 'plex', mark: 'failed', text: p.error }
  return { kind: 'text', text: 'plex ?' }
}

const deleteSummary = (d) => {
  if (d.triggered) return { kind: 'mark', label: 'rm', mark: 'done', text: String(d.removed?.length ?? '?') }
  if (d.skipped) return { kind: 'text', text: `rm: ${d.reason || ''}`.trim() }
  if (d.error) return { kind: 'mark', label: 'rm', mark: 'failed', text: d.error }
  return { kind: 'text', text: 'rm ?' }
}

const adsSummary = (a) => {
  const bits = []
  if (a.detected) bits.push(`${a.detected} detected`)
  if (a.cut) bits.push(`${a.cut} cut`)
  if (a.failed) bits.push(`${a.failed} failed`)
  return `ads ${bits.length ? bits.join(' · ') : `${a.scanned} scanned`}`
}

const triggerMeta = (t) => {
  if (t === 'cron') return { kind: 'trigger-cron', title: 'Cron-scheduled sync' }
  if (t === 'manual-single') return { kind: 'trigger-manual', title: 'Manual single-show sync' }
  if (t === 'manual') return { kind: 'trigger-manual', title: 'Manual full sync' }
  return { kind: 'text', text: t }
}

const summaryParts = (s) => {
  if (!s) return []
  const parts = []
  if (s.trigger) parts.push(triggerMeta(s.trigger))
  if (s.imported !== undefined) parts.push({ kind: 'import', text: String(s.imported) })
  if (s.skipped !== undefined) parts.push({ kind: 'text', text: `skip ${s.skipped}` })
  if (s.failed) parts.push({ kind: 'text', text: `fail ${s.failed}` })
  if (s.plex) parts.push(plexSummary(s.plex))
  if (s.delete) parts.push(deleteSummary(s.delete))
  if (s.ads) parts.push({ kind: 'text', text: adsSummary(s.ads) })
  if (s.message) parts.push({ kind: 'text', text: s.message })
  if (s.errors?.length) {
    const tail = s.errors.length > 2 ? '…' : ''
    parts.push({ kind: 'text', text: `errors: ${s.errors.slice(0, 2).join('; ')}${tail}` })
  }
  return parts
}

const noAutofillAttrs = {
  'data-1p-ignore': '',
  'data-lpignore': 'true',
  'data-bwignore': '',
  'data-form-type': 'other'
}

const noAutofill = {
  mounted: (el, { modifiers }) => {
    el.setAttribute('autocomplete', modifiers['new-password'] ? 'new-password' : 'off')
    Object.entries(noAutofillAttrs).forEach(([name, value]) => el.setAttribute(name, value))
  }
}

const COMBOBOX_LIST_MAX_PX = 256
const COMBOBOX_LIST_MIN_PX = 140
const COMBOBOX_VIEWPORT_GAP_PX = 8
let comboboxCount = 0

const GuideCombobox = {
  props: {
    modelValue: { type: String, default: '' },
    options: { type: Array, default: () => [] },
    noneLabel: { type: String, required: true },
    inputId: { type: String, default: '' },
    label: { type: String, default: '' },
    autofocus: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'confirm'],
  template: `
    <div class="combobox">
      <input v-no-autofill ref="input" :id="inputId || null" type="text" class="field-input combobox-input"
        role="combobox" aria-autocomplete="list" aria-haspopup="listbox"
        :aria-label="label || null" :aria-expanded="open ? 'true' : 'false'" :aria-controls="listId"
        :aria-activedescendant="open && active >= 0 ? optionId(active) : null"
        spellcheck="false" autocapitalize="off" :value="text"
        @input="onInput" @keydown="onKeydown" @click="show" @focus="$event.target.select()" @blur="close" />
      <teleport to="body">
        <ul v-show="open" ref="list" :id="listId" role="listbox" class="combobox-list" :style="listStyle"
          :aria-label="label || null" @mousedown.prevent>
          <li v-for="(o, i) in shown" :key="o.id" :id="optionId(i)" role="option"
            :aria-selected="o.id === modelValue ? 'true' : 'false'" :aria-disabled="o.empty ? 'true' : null"
            :class="['combobox-option', { active: i === active, selected: o.id === modelValue, none: o.id === '', empty: o.empty }]"
            @mousemove="active = i" @click="choose(o)">
            <span class="combobox-option-name">{{ o.name }}<span v-if="o.empty" class="combobox-option-note"> (no shows in this guide)</span></span>
            <span v-if="o.number" class="combobox-option-number">{{ o.number }}</span>
          </li>
          <li v-if="typed && shown.length === 1" class="combobox-empty" role="presentation">No channel matches</li>
        </ul>
      </teleport>
    </div>
  `,
  setup(props, { emit }) {
    comboboxCount += 1
    const listId = `combobox-list-${comboboxCount}`
    const input = ref(null)
    const list = ref(null)
    const open = ref(false)
    const typed = ref(false)
    const active = ref(-1)
    const listStyle = ref({})
    const currentLabel = computed(() =>
      optionLabel({ options: props.options, value: props.modelValue, noneLabel: props.noneLabel }))
    const text = ref(currentLabel.value)
    const noneOption = computed(() => ({ id: '', name: props.noneLabel }))
    const shown = computed(() => [
      noneOption.value,
      ...(typed.value ? filterOptions({ options: props.options, query: text.value }) : props.options),
    ])

    const optionId = (i) => `${listId}-option-${i}`

    const placeList = () => {
      const box = input.value?.getBoundingClientRect()
      if (!box) return
      const below = window.innerHeight - box.bottom - COMBOBOX_VIEWPORT_GAP_PX
      const above = box.top - COMBOBOX_VIEWPORT_GAP_PX
      const goesBelow = below >= COMBOBOX_LIST_MIN_PX || below >= above
      const room = goesBelow ? below : above
      listStyle.value = {
        left: `${box.left}px`,
        width: `${box.width}px`,
        maxHeight: `${Math.max(80, Math.min(COMBOBOX_LIST_MAX_PX, room))}px`,
        ...(goesBelow
          ? { top: `${box.bottom + 2}px` }
          : { bottom: `${window.innerHeight - box.top + 2}px` }),
      }
    }

    const scrollActiveIntoView = async () => {
      await nextTick()
      document.getElementById(optionId(active.value))?.scrollIntoView({ block: 'nearest' })
    }

    const setActive = (index) => {
      active.value = index
      scrollActiveIntoView()
    }

    const currentIndex = () => Math.max(0, shown.value.findIndex((o) => o.id === props.modelValue))

    const show = () => {
      if (open.value) return
      open.value = true
      placeList()
      setActive(currentIndex())
    }

    const close = () => {
      open.value = false
      typed.value = false
      text.value = currentLabel.value
      active.value = -1
    }

    const choose = (option) => {
      if (!isChoosable(option)) return
      emit('update:modelValue', option.id)
      open.value = false
      typed.value = false
      text.value = option.id === '' ? props.noneLabel : option.name
      active.value = -1
    }

    const onInput = (e) => {
      text.value = e.target.value
      typed.value = true
      if (!open.value) {
        open.value = true
        placeList()
      }
      setActive(shown.value.length > 1 ? 1 : 0)
    }

    const move = (delta) => {
      if (!open.value) return show()
      setActive(nextChoosableIndex({ options: shown.value, current: active.value, delta }))
    }

    const onEnter = (e) => {
      e.preventDefault()
      if (!open.value) return emit('confirm')
      const option = shown.value[active.value]
      if (option) choose(option)
    }

    const onEscape = (e) => {
      if (!open.value) return
      e.preventDefault()
      e.stopPropagation()
      close()
    }

    const keyHandlers = {
      ArrowDown: (e) => { e.preventDefault(); move(1) },
      ArrowUp: (e) => { e.preventDefault(); move(-1) },
      Enter: onEnter,
      Escape: onEscape,
      Tab: close,
    }

    const onKeydown = (e) => keyHandlers[e.key]?.(e)

    watch(currentLabel, (label) => {
      if (!typed.value) text.value = label
    })

    watch(open, (isOpen) => {
      const method = isOpen ? 'addEventListener' : 'removeEventListener'
      window[method]('scroll', placeList, true)
      window[method]('resize', placeList)
    })

    onMounted(() => {
      if (!props.autofocus) return
      input.value?.focus()
    })
    onUnmounted(() => {
      window.removeEventListener('scroll', placeList, true)
      window.removeEventListener('resize', placeList)
    })

    return {
      input, list, listId, open, typed, active, text, shown, listStyle,
      optionId, show, close, choose, onInput, onKeydown,
    }
  },
}

const SummaryLine = {
  props: ['summary'],
  computed: {
    parts() { return summaryParts(this.summary) }
  },
  template: `
    <code v-if="parts.length" class="inline-flex items-center gap-1.5 flex-wrap align-middle">
      <template v-for="(p, i) in parts" :key="i">
        <span v-if="i > 0" class="text-ink-mute">·</span>
        <span v-if="p.kind === 'trigger-cron'" class="inline-flex items-center align-middle text-ink-dim" :title="p.title" :aria-label="p.title">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 align-middle" aria-hidden="true">
            <circle cx="8" cy="8" r="5.75"/>
            <path d="M8 5v3.25l2.25 1.5"/>
          </svg>
        </span>
        <span v-else-if="p.kind === 'trigger-manual'" class="inline-flex items-center align-middle text-ink-dim" :title="p.title" :aria-label="p.title">
          <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 align-middle" aria-hidden="true">
            <path d="M5 3.5v9a0.5 0.5 0 0 0 0.78 0.42l6.8-4.5a0.5 0.5 0 0 0 0-0.84l-6.8-4.5A0.5 0.5 0 0 0 5 3.5z"/>
          </svg>
        </span>
        <span v-else class="inline-flex items-center gap-1 align-middle">
          <svg v-if="p.kind === 'import'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 align-middle text-ink-dim" aria-hidden="true">
            <path d="M8 2.5v7.5M5 7l3 3 3-3M3 13.5h10"/>
          </svg>
          <template v-if="p.kind === 'mark'">
            <span>{{ p.label }}</span>
            <step-mark-icon :state="p.mark" :class="['w-3.5', 'h-3.5', 'align-middle', p.mark === 'done' ? 'text-plex-yellow' : 'text-signal-orange-hi']" />
          </template>
          <span>{{ p.text }}</span>
        </span>
      </template>
    </code>
  `,
}

const ProgressBlock = {
  props: ['progress', 'caption', 'bar'],
  template: `
    <div class="progress">
      <div v-if="bar" class="progress-track">
        <div class="progress-fill" :class="{ indeterminate: progress.percent == null }"
          :style="progress.percent == null ? {} : { width: (progress.percent || 0) + '%' }"></div>
      </div>
      <span class="progress-caption">{{ caption }}</span>
    </div>
  `,
}

const ChannelLogo = {
  props: { channelId: { type: [String, Number], default: null }, hasLogo: Boolean },
  setup(props) {
    const failed = ref(false)
    watch(() => props.channelId, () => { failed.value = false })
    const showsImage = computed(() => props.hasLogo && props.channelId != null && !failed.value)
    return { failed, showsImage }
  },
  template: `
    <img v-if="showsImage" class="epg-rail-logo" :src="'/api/epg/logo/' + channelId" alt="" loading="lazy"
      draggable="false" @error="failed = true" />
    <tv-icon v-else class="epg-rail-logo channel-logo-fallback" />
  `,
}

const imageStatusOf = (img) => {
  if (!img?.complete) return 'loading'
  return img.naturalWidth > 0 ? 'loaded' : 'failed'
}

const ProgrammeImage = {
  props: {
    eventId: { type: [String, Number], default: null },
    source: { type: String, default: null },
    variant: { type: String, default: 'thumb' },
    channelId: { type: [String, Number], default: null },
    hasLogo: Boolean,
  },
  setup(props) {
    const img = ref(null)
    const status = ref('loading')
    const instant = ref(false)
    const src = computed(() => props.source
      ?? (props.eventId != null ? `/api/epg/image/${encodeURIComponent(props.eventId)}` : null))
    const settleFromCache = () => {
      if (src.value == null) {
        status.value = 'failed'
        return
      }
      const cached = imageStatusOf(img.value)
      instant.value = cached !== 'loading'
      status.value = cached
    }
    const onLoad = () => { if (status.value === 'loading') status.value = 'loaded' }
    const onError = () => { status.value = 'failed' }
    const fadeInFromCache = () => {
      const cached = src.value == null ? 'failed' : imageStatusOf(img.value)
      if (cached !== 'loaded') return settleFromCache()
      getComputedStyle(img.value).opacity
      status.value = 'loaded'
    }
    onMounted(fadeInFromCache)
    watch(src, async () => {
      status.value = 'loading'
      instant.value = false
      await nextTick()
      settleFromCache()
    })
    return { img, status, instant, src, onLoad, onError }
  },
  template: `
    <div :class="['programme-image', variant, 'is-' + status, { 'no-fade': instant }]">
      <img v-if="src != null && status !== 'failed'" ref="img" :src="src" alt=""
        :loading="variant === 'hero' ? 'eager' : 'lazy'" decoding="async" @load="onLoad" @error="onError" />
      <span v-if="status === 'failed'" class="programme-image-fallback">
        <channel-logo :channel-id="channelId" :has-logo="hasLogo" />
      </span>
    </div>
  `,
}

const ToggleSwitch = {
  props: { modelValue: Boolean, label: { type: String, default: '' } },
  emits: ['update:modelValue'],
  template: `
    <button type="button" role="switch" :class="['toggle', { on: modelValue }]" :aria-checked="String(modelValue)"
      @click="$emit('update:modelValue', !modelValue)">
      <span class="toggle-track" aria-hidden="true"><span class="toggle-knob"></span></span>
      <span class="toggle-label"><slot>{{ label }}</slot></span>
    </button>
  `,
}

const TimeZoneField = {
  props: {
    modelValue: { type: String, default: '' },
    source: { type: String, default: 'system' },
    hint: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  template: `
    <div class="field-row">
      <label class="field-label" for="time-zone-select">TIME ZONE</label>
      <select id="time-zone-select" class="field-input" :value="modelValue"
        @change="$emit('update:modelValue', $event.target.value)">
        <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
      </select>
      <p v-if="modelValue" class="text-xs font-mono text-ink-dim mt-2">Now {{ readout }}</p>
      <p v-if="fromEnv" class="text-xs text-ink-dim mt-2">Pre-filled from <code>TZ</code> in your .env file.</p>
      <p v-else-if="hint" class="text-xs text-ink-dim mt-2">Pre-filled from this browser. Freetvarr uses it for the guide, recordings, and the sync schedule.</p>
    </div>
  `,
  setup(props) {
    const nowMs = ref(Date.now())
    const timer = setInterval(() => (nowMs.value = Date.now()), 15000)
    onUnmounted(() => clearInterval(timer))
    const fromEnv = computed(() => props.source === 'env')
    const zones = computed(() => {
      const known = Intl.supportedValuesOf('timeZone')
      return props.modelValue && !known.includes(props.modelValue)
        ? [props.modelValue, ...known]
        : known
    })
    const readout = computed(() => {
      try {
        return `${formatDate(nowMs.value, props.modelValue)} ${formatClock(nowMs.value, props.modelValue)}`
      } catch {
        return props.modelValue
      }
    })
    return { fromEnv, zones, readout }
  },
}

const OFF_AIR_MESSAGE = "This channel isn't broadcasting right now."

const ChannelIdentity = {
  props: { channel: { type: Object, required: true }, hasLogo: Boolean, number: { type: String, default: '' } },
  emits: ['pin'],
  setup: () => ({ OFF_AIR_MESSAGE }),
  template: `
    <button type="button" :class="['epg-pin', { pinned: channel.pinned }]" :aria-pressed="Boolean(channel.pinned)"
      :title="channel.pinned ? 'Remove from favourites' : 'Add to favourites'"
      :aria-label="channel.pinned ? 'Remove ' + channel.name + ' from favourites' : 'Add ' + channel.name + ' to favourites'"
      @click="$emit('pin')"><star-icon /></button>
    <span class="channel-logo"><channel-logo :channel-id="channel.id" :has-logo="hasLogo" /></span>
    <span class="channel-name" :title="channel.offAir ? OFF_AIR_MESSAGE : channel.name">
      <span v-if="number" class="channel-number">{{ number }}</span>
      {{ channel.name }}
      <span v-if="channel.offAir" class="off-air-note">OFF AIR</span>
    </span>
  `,
}

const channelGroupLabel = ({ pinned, anyPinned }) => {
  if (pinned) return 'Favourites'
  return anyPinned ? 'Other channels' : 'Channels'
}

const storedFlag = ({ key, fallback }) => {
  const read = () => {
    try {
      const stored = localStorage.getItem(key)
      return stored == null ? fallback : stored === '1'
    } catch {
      return fallback
    }
  }
  const flag = ref(read())
  watch(flag, (on) => {
    try { localStorage.setItem(key, on ? '1' : '0') } catch {}
  })
  return flag
}

const storedChoice = ({ key, options, fallback }) => {
  const read = () => {
    try {
      const stored = localStorage.getItem(key)
      return options.includes(stored) ? stored : fallback
    } catch {
      return fallback
    }
  }
  const choice = ref(read())
  watch(choice, (value) => {
    try { localStorage.setItem(key, value) } catch {}
  })
  return choice
}

const useMediaQuery = (query) => {
  const list = window.matchMedia(query)
  const matches = ref(list.matches)
  const update = () => { matches.value = list.matches }
  onMounted(() => list.addEventListener('change', update))
  onUnmounted(() => list.removeEventListener('change', update))
  return matches
}

const makeStatus = () => {
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

const usePathCheck = (request) => {
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

const recordingsFolderStatus = async ({ path, mediaRoot }) =>
  describeRecordingsFolder(await api('POST', '/api/recordings-root-test', { path, media_root: mediaRoot }))

const describeRecordingsFolder = (r) => {
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

const tvhRecordingsPathStatus = async ({ path, fill }) =>
  describeTvhRecordingsPath({ r: await api('POST', '/api/tvh-recordings-path-check', { path }), fill })

const describeTvhRecordingsPath = ({ r, fill }) => {
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

const useFlash = () => {
  const flashText = ref('')
  const flashKind = ref('ok')
  const flash = ({ msg, kind = 'ok', ms = FLASH_DEFAULT_MS }) => {
    flashText.value = msg
    flashKind.value = kind
    if (ms > 0) setTimeout(() => (flashText.value = ''), ms)
  }
  const flashUntilSyncDone = ({ msg, kind = 'ok' }) => {
    flashText.value = msg
    flashKind.value = kind
    const ourMsg = msg
    const clearIfStillOurs = () => {
      if (flashText.value === ourMsg) flashText.value = ''
    }
    const stop = watch(() => syncStatus.value.activeSyncId, (curr, prev) => {
      if (!curr && prev) {
        clearIfStillOurs()
        stop()
      }
    })
    setTimeout(() => {
      clearIfStillOurs()
      stop()
    }, SYNC_FLASH_SAFETY_MS)
  }
  return { flashText, flashKind, flash, flashUntilSyncDone }
}

const FLASH_DEFAULT_MS = 4500
const UNDO_WINDOW_MS = 10_000
const SYNC_DOTS = { ok: '#e2b03c', partial: '#ffcd00', error: '#ffab3d', running: '#62cfff' }
const SYNC_FLASH_SAFETY_MS = 60_000
const MIN_SYNC_DISPLAY_MS = 1500

const ROUTES = ['dashboard', 'live', 'guide', 'series', 'syncs', 'recordings', 'settings', 'doctor', 'welcome']
const WELCOME_DISMISSED_KEY = 'freetvarr.welcomeDismissed'
const DEFAULT_ROUTE = 'dashboard'
const ROUTE_ALIASES = { shows: 'series' }

const DASHBOARD_POLL_MS = 30_000
const SYNCS_POLL_MS = 30_000
const RECORDINGS_POLL_MS = 60_000
const RECORDINGS_ACTIVE_POLL_MS = 2_000
const UNIMPORTED_STATUSES = ['failed', 'skipped', 'not_imported']

const hashSegments = () => (window.location.hash || '').replace(/^#\/?/, '').toLowerCase().split('/')

const parseHash = () => {
  const [segment] = hashSegments()
  const view = ROUTE_ALIASES[segment] || segment
  return ROUTES.includes(view) ? view : DEFAULT_ROUTE
}

const parseHashSection = () => hashSegments()[1] || ''

const canonicaliseHash = () => {
  const [segment, ...rest] = hashSegments()
  const view = ROUTE_ALIASES[segment]
  if (view) history.replaceState(null, '', `#/${[view, ...rest].join('/')}`)
}

canonicaliseHash()
const route = ref(parseHash())
const routeSection = ref(parseHashSection())
window.addEventListener('hashchange', () => {
  canonicaliseHash()
  route.value = parseHash()
  routeSection.value = parseHashSection()
})

const ROUTE_SECTION_ALIASES = { about: 'help' }

const routeSectionId = () => ROUTE_SECTION_ALIASES[routeSection.value] || routeSection.value

const scrollToRouteSection = async () => {
  if (!routeSection.value) return
  await nextTick()
  const behavior = document.visibilityState === 'visible' ? 'smooth' : 'auto'
  document.getElementById(`section-${routeSectionId()}`)?.scrollIntoView({ behavior, block: 'start' })
}

const guideHandoff = ref(null)
const refreshTick = ref(0)

const recordDialogOverPlayer = ref(false)

const openInGuide = (handoff) => {
  guideHandoff.value = handoff
  window.location.hash = '#/guide'
}

const syncStatus = ref({ activeSyncId: null, cron: '' })
let syncPollTimer = null

const loadSyncStatus = async () => {
  try {
    syncStatus.value = await api('GET', '/api/sync-status')
  } catch {
    /* leave previous value */
  }
  return syncStatus.value
}

const stopSyncPolling = () => {
  if (syncPollTimer) clearInterval(syncPollTimer)
  syncPollTimer = null
}

const ensureSyncPolling = () => {
  if (syncPollTimer || !syncStatus.value.activeSyncId) return
  syncPollTimer = setInterval(async () => {
    await loadSyncStatus()
    if (!syncStatus.value.activeSyncId) stopSyncPolling()
  }, 3000)
}

watch(() => syncStatus.value.activeSyncId, (curr) => {
  if (curr) ensureSyncPolling()
})

const FAVICON_SIZE = 32
const FAVICON_BG = '#28231b'
const FAVICON_CHIP_BASE_Y = 13
const FAVICON_CHIP_WIDTH = 8
const FAVICON_CHIP_HEIGHT = 6
const FAVICON_BOB_AMPLITUDE = 4
const FAVICON_BOB_PERIOD_MS = 900
const FAVICON_FRAME_INTERVAL_MS = 90
const FAVICON_CHIPS = [
  { x: 3,  color: '#1eb6ff' },
  { x: 12, color: '#ff8a00' },
  { x: 21, color: '#e2b03c' },
]

const FAVICON_REC_DISC = { x: 16, y: 16, radius: 6.5, color: '#ff8a00' }

let faviconCanvas = null
let faviconCtx = null
let faviconLink = null
let faviconTimer = null
let faviconStart = 0
let faviconRecording = false

const ensureFaviconCanvas = () => {
  if (faviconCanvas) return
  faviconCanvas = document.createElement('canvas')
  faviconCanvas.width = FAVICON_SIZE
  faviconCanvas.height = FAVICON_SIZE
  faviconCtx = faviconCanvas.getContext('2d')
  faviconLink = document.querySelector('link[rel="icon"]')
  faviconLink.type = 'image/png'
}

const drawFaviconFrame = (now, { bob = true } = {}) => {
  if (faviconRecording) return drawFaviconRecording()
  const phase = ((now - faviconStart) / FAVICON_BOB_PERIOD_MS) * Math.PI * 2
  faviconCtx.fillStyle = FAVICON_BG
  faviconCtx.fillRect(0, 0, FAVICON_SIZE, FAVICON_SIZE)
  FAVICON_CHIPS.forEach((chip, index) => {
    const stagger = (index / FAVICON_CHIPS.length) * Math.PI * 2
    const offset = bob ? Math.sin(phase + stagger) * FAVICON_BOB_AMPLITUDE : 0
    faviconCtx.fillStyle = chip.color
    faviconCtx.fillRect(chip.x, FAVICON_CHIP_BASE_Y - offset, FAVICON_CHIP_WIDTH, FAVICON_CHIP_HEIGHT)
  })
  faviconLink.href = faviconCanvas.toDataURL('image/png')
}

const drawFaviconRecording = () => {
  faviconCtx.fillStyle = FAVICON_BG
  faviconCtx.fillRect(0, 0, FAVICON_SIZE, FAVICON_SIZE)
  faviconCtx.fillStyle = FAVICON_REC_DISC.color
  faviconCtx.beginPath()
  faviconCtx.arc(FAVICON_REC_DISC.x, FAVICON_REC_DISC.y, FAVICON_REC_DISC.radius, 0, Math.PI * 2)
  faviconCtx.fill()
  faviconLink.href = faviconCanvas.toDataURL('image/png')
}

const showFaviconAtRest = () => {
  if (!faviconRecording) {
    if (faviconLink) {
      faviconLink.type = 'image/svg+xml'
      faviconLink.href = '/favicon.svg'
    }
    return
  }
  ensureFaviconCanvas()
  drawFaviconFrame(0, { bob: false })
}

const setFaviconRecording = (recording) => {
  faviconRecording = recording
  if (!faviconTimer) showFaviconAtRest()
}

const startFaviconAnimation = () => {
  ensureFaviconCanvas()
  if (faviconTimer) return
  faviconStart = performance.now()
  faviconTimer = setInterval(() => drawFaviconFrame(performance.now()), FAVICON_FRAME_INTERVAL_MS)
}

const stopFaviconAnimation = () => {
  if (faviconTimer) {
    clearInterval(faviconTimer)
    faviconTimer = null
  }
  showFaviconAtRest()
}

watch(() => syncStatus.value.activeSyncId, (curr) => {
  if (curr) startFaviconAnimation()
  else stopFaviconAnimation()
})

const now = ref(new Date())
setInterval(() => { now.value = new Date() }, 1000)

const recordingNow = ref({ active: [], journeys: [] })
let recordingNowTimer = null

const recordingCount = computed(() => recordingNow.value.active.length)

const recordingNowBusy = computed(() =>
  recordingNow.value.active.length > 0 || recordingNow.value.journeys.length > 0)

const loadRecordingNow = async () => {
  try {
    recordingNow.value = await api('GET', '/api/recording-now')
  } catch {
    recordingNow.value = { active: [], journeys: [] }
  }
}

const pollRecordingNow = async () => {
  clearTimeout(recordingNowTimer)
  await loadRecordingNow()
  const fast = recordingNowBusy.value && !document.hidden
  recordingNowTimer = setTimeout(pollRecordingNow, fast ? RECORDING_NOW_FAST_POLL_MS : RECORDING_NOW_IDLE_POLL_MS)
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && recordingNowBusy.value) pollRecordingNow()
})

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkForNewBuild()
})

watch(recordingCount, (count) => {
  document.title = count > 0 ? `● REC · ${APP_TITLE}` : APP_TITLE
  setFaviconRecording(count > 0)
})

const APP_TITLE = 'Freetvarr'
const RECORDING_NOW_FAST_POLL_MS = 5_000
const RECORDING_NOW_IDLE_POLL_MS = 45_000

const clockReadout = computed(() => formatClockSeconds(now.value.getTime(), tz.value))

const tzShortName = computed(() => {
  try {
    const parts = dateFormat({ timeZoneName: 'short' }).formatToParts(now.value)
    return parts.find((p) => p.type === 'timeZoneName')?.value || tz.value
  } catch {
    return tz.value
  }
})

const seasonEpisodeLabel = (r) => {
  if (r.season == null && r.episode == null) return ''
  const s = r.season != null ? `S${String(r.season).padStart(2, '0')}` : ''
  const e = r.episode != null ? `E${String(r.episode).padStart(2, '0')}` : ''
  return `${s}${e}`
}

const within7Days = (s) => {
  if (!s) return false
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && (Date.now() - t) < 7 * 24 * 60 * 60 * 1000
}

const hostOf = (url) => {
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const HEALTH_COLOURS = { ok: '#e2b03c', err: '#ff8a00', off: '#544e47' }

const fmtClockTz = (ms) => formatClock(ms, tz.value)

const dayKey = (ms) => dateFormat({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))

const fmtRelativeDay = (ms) => {
  const daysAhead = localDayNumber({ ms, timeZone: tz.value }) - localDayNumber({ ms: Date.now(), timeZone: tz.value })
  if (daysAhead === 0) return 'Today'
  if (daysAhead === 1) return 'Tomorrow'
  return formatDate(ms, tz.value)
}

const tsOfMs = (v) => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  if (Number.isFinite(n)) return n
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : 0
}

const RecordingCard = {
  props: ['rec', 'kind'],
  setup(props) {
    const geometry = computed(() => recordingBarGeometry({ rec: props.rec, nowMs: now.value.getTime() }))
    const phaseLabel = computed(() => {
      if (props.rec.phase !== 'programme') return props.rec.phase
      const mins = Math.max(0, Math.ceil((props.rec.stop - now.value.getTime()) / 60_000))
      return `${formatMinutes(mins)} left`
    })
    const liveLine = computed(() => recordingLiveLine(props.rec))
    const metaLine = computed(() =>
      [seasonEpisodeLabel(props.rec), props.rec.episodeTitle].filter(Boolean).join(' · '))
    const stepDetail = computed(() => {
      if (props.rec.failed) return ''
      const current = (props.rec.steps || []).find((st) => st.state !== 'done' && st.detail)
      return current ? `${current.label}: ${current.detail}` : ''
    })
    return { geometry, phaseLabel, liveLine, metaLine, stepDetail, fmtClockTz }
  },
  template: `
    <article :class="['rec-card', { failed: rec.failed }]">
      <programme-image v-if="rec.hasImage" :event-id="rec.programId ?? rec.uuid" variant="rec" :channel-id="rec.channelId" has-logo />
      <div class="rec-card-body">
        <div class="rec-card-head">
          <channel-logo class="shrink-0" :channel-id="rec.channelId" has-logo />
          <span class="rec-card-channel">{{ rec.channelName }}</span>
          <span v-if="rec.failed" class="rec-badge failed"><cross-icon /> FAILED</span>
          <span v-else-if="kind === 'active'" class="rec-badge"><span class="led-dot sm live"></span>REC</span>
          <span v-else class="rec-badge ended">ENDED {{ fmtClockTz(rec.endedAt) }}</span>
        </div>
        <div class="rec-card-title">{{ rec.title }}</div>
        <div v-if="metaLine" class="rec-card-meta">{{ metaLine }}</div>
        <template v-if="kind === 'active'">
          <div class="rec-bar" role="progressbar" aria-label="Recording progress"
            :aria-valuenow="Math.round(geometry.fill)" aria-valuemin="0" aria-valuemax="100">
            <span class="rec-bar-pad" :style="{ left: 0, width: geometry.pre + '%' }"></span>
            <span class="rec-bar-pad" :style="{ right: 0, width: geometry.post + '%' }"></span>
            <span class="rec-bar-fill" :style="{ width: geometry.fill + '%' }"></span>
            <span class="rec-bar-shade" :style="{ left: 0, width: Math.min(geometry.pre, geometry.fill) + '%' }"></span>
            <span class="rec-bar-shade" :style="{ left: (100 - geometry.post) + '%', width: Math.max(0, geometry.fill - 100 + geometry.post) + '%' }"></span>
          </div>
          <div class="rec-bar-labels">
            <span>{{ fmtClockTz(rec.startPadded) }}</span>
            <span :class="['rec-phase', rec.phase]">{{ phaseLabel }}</span>
            <span>{{ fmtClockTz(rec.stopPadded) }}</span>
          </div>
          <p class="rec-live">{{ liveLine }}</p>
          <p v-if="rec.failed" class="rec-error">{{ rec.statusText || 'TVHeadend reported an error' }}</p>
        </template>
        <template v-else>
          <p v-if="rec.failed" class="rec-error">{{ rec.statusText || 'Recording failed' }}</p>
          <ol class="rec-steps">
            <li v-for="st in rec.steps" :key="st.key" :class="['rec-step', st.state]">
              <step-mark-icon class="rec-step-mark" :state="st.state" />{{ st.label }}{{ st.percent != null ? ' ' + st.percent + '%' : '' }}
            </li>
          </ol>
          <p v-if="stepDetail" class="rec-card-meta">{{ stepDetail }}</p>
        </template>
      </div>
    </article>
  `,
}

const RecordingNowPanel = {
  setup() {
    const cards = computed(() => [
      ...recordingNow.value.active.slice(0, RECORDING_CARDS_MAX).map((rec) => ({ rec, kind: 'active' })),
      ...recordingNow.value.journeys.map((rec) => ({ rec, kind: 'journey' })),
    ])
    const title = computed(() => recordingNow.value.active.length ? 'RECORDING NOW' : 'JUST RECORDED')
    const summary = computed(() => recordingCount.value ? `${recordingCount.value} active` : '')
    return { cards, title, summary }
  },
  template: `
    <section v-if="cards.length" class="panel rec-panel">
      <header class="panel-header">
        <span class="panel-heading">
          <span class="panel-title">{{ title }}</span>
          <info-button :title="title" doc="guide/tv-guide#on-the-dashboard">
            <p>One card for each programme TVHeadend is recording now. The orange bar runs from the padded start to the padded stop; the dim ends are the early start and the late finish.</p>
            <p>The line under the bar shows the file size, bitrate, tuner signal, and errors, as TVHeadend reports them.</p>
            <p>When a recording stops, its card steps through <strong>Recorded</strong>, <strong>Importing</strong>, <strong>Cutting ads</strong>, and <strong>In Plex</strong>. Importing waits for the next sync. The card goes about ten minutes after the last step.</p>
          </info-button>
        </span>
        <span v-if="summary" class="text-xs font-mono uppercase tracking-[0.16em] text-signal-orange">{{ summary }}</span>
      </header>
      <div class="panel-body">
        <transition-group name="rec-card" tag="div" class="rec-grid">
          <recording-card v-for="c in cards" :key="c.kind + '-' + c.rec.uuid" :rec="c.rec" :kind="c.kind" />
        </transition-group>
      </div>
    </section>
  `,
}

const recordingBarGeometry = ({ rec, nowMs }) => {
  const total = rec.stopPadded - rec.startPadded
  if (!(total > 0)) return { pre: 0, post: 0, fill: 0 }
  const share = (ms) => Math.min(100, Math.max(0, (ms / total) * 100))
  return {
    pre: share(rec.start - rec.startPadded),
    post: share(rec.stopPadded - rec.stop),
    fill: share(nowMs - rec.startPadded),
  }
}

const recordingLiveLine = (rec) => {
  const bits = []
  if (rec.filesize) bits.push(fmtBytes(rec.filesize))
  if (rec.bitsPerSecond) bits.push(`${(rec.bitsPerSecond / 1_000_000).toFixed(1)}Mb/s`)
  if (rec.signal != null) bits.push(`signal ${fmtReading(rec.signal, rec.signalUnit)}`)
  if (rec.snr != null) bits.push(`SNR ${fmtReading(rec.snr, rec.snrUnit)}`)
  const errors = (rec.errors || 0) + (rec.dataErrors || 0)
  bits.push(errors ? `${errors} error${errors === 1 ? '' : 's'}` : 'no errors')
  if (rec.continuityErrors) bits.push(`${rec.continuityErrors} CC`)
  return bits.join(' · ')
}

const fmtReading = (value, unit) => unit === '%' ? `${value}%` : `${Number(value).toFixed(1)} ${unit}`

const RECORDING_CARDS_MAX = 4

const setDragLock = (on) => {
  try { document.body.classList.toggle('epg-drag-lock', on) } catch { /* ignore */ }
}

// Pointer-based drag (not HTML5 drag-and-drop) so reordering works with a
// finger on iOS as well as a mouse. A pinned row's handle (the guide's rail
// cell, Live TV's channel cell) is the drag surface; the drag only starts after
// a small movement threshold so plain clicks and taps (the star button) still
// register. Rows are hit-tested by their live bounding boxes on every move,
// and a cloned ghost of the handle follows the pointer.
const usePinDrag = ({ rowSelector, currentPins, onReorder, grabSelector = null }) => {
  const dragPinId = ref(null)
  const dropTargetId = ref(null)
  const dropAfter = ref(false)
  let pendingDrag = null
  let liftTimer = null
  let dragDidMove = false
  let ghostEl = null
  let ghostDX = 0
  let ghostDY = 0

  const distanceToBox = (clientY, box) => {
    if (clientY < box.top) return box.top - clientY
    if (clientY > box.bottom) return clientY - box.bottom
    return 0
  }

  const pinRowUnderPointer = (clientY) => {
    const nearest = [...document.querySelectorAll(rowSelector)]
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.height > 0)
      .reduce((best, row) => {
        const distance = distanceToBox(clientY, row.box)
        return !best || distance < best.distance ? { ...row, distance } : best
      }, null)
    return nearest?.el.dataset.channelId || null
  }

  const isBelow = (from, to) => {
    const order = currentPins()
    return order.indexOf(from) < order.indexOf(to)
  }

  const moveGhost = (e) => {
    if (!ghostEl) return
    ghostEl.style.left = `${e.clientX - ghostDX}px`
    ghostEl.style.top = `${e.clientY - ghostDY}px`
  }

  const removeGhost = () => {
    if (!ghostEl) return
    ghostEl.remove()
    ghostEl = null
  }

  const startPinDrag = () => {
    clearTimeout(liftTimer)
    if (!pendingDrag) return
    const { ch, cell, pointerId, x, y } = pendingDrag
    pendingDrag = null
    dragDidMove = true
    setDragLock(true)
    try { cell.setPointerCapture(pointerId) } catch { /* ignore */ }
    dragPinId.value = String(ch.id)
    dropTargetId.value = null
    const box = cell.getBoundingClientRect()
    ghostDX = x - box.left
    ghostDY = y - box.top
    ghostEl = cell.cloneNode(true)
    ghostEl.classList.add('epg-ghost')
    ghostEl.style.width = `${box.width}px`
    ghostEl.style.height = `${box.height}px`
    document.body.appendChild(ghostEl)
    moveGhost({ clientX: x, clientY: y })
  }

  const onPinPointerDown = (ch, e) => {
    if (!ch.pinned) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (grabSelector && !e.target.closest?.(grabSelector)) return
    pendingDrag = { ch, cell: e.currentTarget, pointerId: e.pointerId, x: e.clientX, y: e.clientY }
    clearTimeout(liftTimer)
    liftTimer = setTimeout(startPinDrag, PIN_LIFT_HOLD_MS)
  }

  const onPinPointerMove = (e) => {
    if (pendingDrag) {
      if (Math.hypot(e.clientX - pendingDrag.x, e.clientY - pendingDrag.y) < EPG_DRAG_THRESHOLD_PX) return
      startPinDrag()
    }
    if (!dragPinId.value) return
    e.preventDefault()
    moveGhost(e)
    const over = pinRowUnderPointer(e.clientY)
    dropTargetId.value = over && over !== dragPinId.value ? over : null
    dropAfter.value = Boolean(dropTargetId.value) && isBelow(dragPinId.value, dropTargetId.value)
  }

  const onPinPointerUp = async () => {
    pendingDrag = null
    clearTimeout(liftTimer)
    setDragLock(false)
    removeGhost()
    if (dragDidMove) setTimeout(() => { dragDidMove = false }, 0)
    const from = dragPinId.value
    const to = dropTargetId.value
    dragPinId.value = null
    dropTargetId.value = null
    dropAfter.value = false
    if (!from || !to || from === to) return
    const movingDown = isBelow(from, to)
    const pins = currentPins().filter((id) => id !== from)
    pins.splice(pins.indexOf(to) + (movingDown ? 1 : 0), 0, from)
    await onReorder(pins)
  }

  const onPinPointerCancel = () => {
    pendingDrag = null
    clearTimeout(liftTimer)
    setDragLock(false)
    removeGhost()
    dragDidMove = false
    dragPinId.value = null
    dropTargetId.value = null
    dropAfter.value = false
  }

  return {
    dragPinId, dropTargetId, dropAfter, didDrag: () => dragDidMove,
    onPinPointerDown, onPinPointerMove, onPinPointerUp, onPinPointerCancel,
  }
}

const recordingChannelIds = computed(() =>
  new Set(recordingNow.value.active.filter((r) => !r.failed).map((r) => String(r.channelId))))

const isRecordingChannel = (channelId) => recordingChannelIds.value.has(String(channelId))

const onNowPercent = (p) => {
  const span = p.end - p.start
  if (span <= 0) return 0
  return Math.min(100, Math.max(0, Math.round(((now.value.getTime() - p.start) / span) * 100)))
}

const onNowMeta = (p) => {
  const mins = Math.max(0, Math.ceil((p.end - now.value.getTime()) / 60_000))
  return `${fmtClockTz(p.start)} · ${formatMinutes(mins)} remaining`
}

const LiveView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">LIVE TV</span>
            <info-button title="LIVE TV" doc="guide/live-tv#in-freetvarr">
              <p>Every channel in TVHeadend, with what is on now and next. Press the TV button on a channel to watch it in the browser.</p>
              <p>Freetvarr converts the TVHeadend stream into video the browser can play. It needs a free tuner, and a recording always takes the tuner first.</p>
              <p>Star a channel to put it in your favourites at the top. <strong>CHANNELS</strong> hides, sorts, and orders the channels. The zoom buttons change how much each row shows.</p>
            </info-button>
          </span>
          <div class="header-actions flex flex-wrap items-center justify-end gap-3">
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
            <toggle-switch v-model="pinnedOnly" :aria-label="narrow ? 'Favourites only' : null">
              <star-icon v-if="narrow" class="icon-inline" /><template v-else>FAVOURITES ONLY</template>
            </toggle-switch>
            <toggle-switch v-model="showImages" label="IMAGES" />
            <header-button label="Channels" @click="channelsModal = true" :disabled="!data"><sliders-icon /></header-button>
          </div>
        </header>
        <div :class="['panel-body', 'space-y-5', 'live-zoom-' + zoom]">
          <div class="view-controls view-controls-sticky">
            <input v-no-autofill v-model="filterQ" type="search" class="field-input"
              placeholder="Filter channels or shows" aria-label="Filter channels or shows"
              style="padding-top: 0.35rem; padding-bottom: 0.35rem;" />
            <zoom-control :index="zoomIndex" :count="zoomLevelCount" :show-label="!narrow" @step="changeZoom" />
          </div>
          <p v-if="tvhConfigured === false" class="text-sm text-ink-dim">
            Connect TVHeadend in <a href="#/settings/tvheadend">Settings</a> to watch live TV.
          </p>
          <div v-else-if="error" class="flex flex-wrap items-center gap-3">
            <span class="status-readout err">Guide unavailable: {{ error }}</span>
            <button type="button" class="btn btn-sm" @click="load"><refresh-icon /> RETRY</button>
          </div>
          <p v-else-if="!data" class="text-sm text-ink-dim">Loading channels…</p>
          <p v-else-if="!groups.length && favouritesHint" class="text-sm text-ink-dim">No favourites yet. <span class="whitespace-nowrap">Tap <star-icon class="icon-inline" /> next</span> to a channel to add it.</p>
          <p v-else-if="!groups.length" class="text-sm text-ink-dim">{{ emptyText }}</p>
          <div v-for="g in groups" :key="g.key" class="live-group">
            <div class="channel-group-heading">{{ g.label }}</div>
            <ul class="live-list">
              <li v-for="e in g.entries" :key="e.channel.id" :data-channel-id="e.channel.id"
                :class="['live-row', { pinned: e.channel.pinned, 'epg-drop-target': dropTargetId === String(e.channel.id), 'epg-drop-after': dropAfter && dropTargetId === String(e.channel.id), 'epg-dragging': dragPinId === String(e.channel.id) }]">
                <div :class="['live-row-handle', { 'off-air': e.channel.offAir }]" :title="e.channel.pinned ? 'Drag to reorder favourites' : null"
                  @pointerdown="onPinPointerDown(e.channel, $event)"
                  @pointermove="onPinPointerMove"
                  @pointerup="onPinPointerUp"
                  @pointercancel="onPinPointerCancel">
                  <channel-identity :channel="e.channel" :has-logo="e.channel.hasLogo"
                    :number="e.channel.number == null ? '' : String(e.channel.number)" @pin="togglePin(e.channel)" />
                </div>
                <div class="live-row-now">
                  <button v-if="e.now" type="button" class="on-now-open live-now-open"
                    :aria-label="'Show details for ' + e.now.title" @click="openDetails(e, e.now)">
                    <span v-if="showImages" class="live-now-thumb">
                      <programme-image :event-id="e.now.has_image ? e.now.program_id : null"
                        :channel-id="e.channel.id" :has-logo="e.channel.hasLogo" />
                    </span>
                    <div class="live-now-text">
                    <span class="block truncate">
                      <span class="live-now-title text-sm font-semibold text-ink mr-3">{{ e.now.title }}</span>
                      <span v-if="isRecordingChannel(e.channel.id)" class="on-now-rec"><span class="led-dot sm live"></span>REC</span>
                      <span v-else class="font-mono text-xs text-ink-dim">{{ onNowMeta(e.now) }}</span>
                    </span>
                    <div class="progress" style="margin-top: 0.25rem; max-width: none;">
                      <div class="progress-track">
                        <div :class="['progress-fill', { rec: isRecordingChannel(e.channel.id) }]" :style="{ width: onNowPercent(e.now) + '%' }"></div>
                      </div>
                    </div>
                    </div>
                  </button>
                  <span v-else class="text-sm text-ink-mute">No guide data</span>
                </div>
                <button v-if="e.next" type="button" class="on-now-open live-row-next font-mono text-xs text-ink-dim min-w-0 truncate"
                  :aria-label="'Show details for ' + e.next.title" @click="openDetails(e, e.next)">
                  next: <span class="text-xs font-semibold font-sans text-ink">{{ e.next.title }}</span> {{ fmtClockTz(e.next.start) }}
                </button>
                <button type="button" class="btn btn-sm btn-icon btn-watch live-row-watch" :title="e.channel.offAir ? OFF_AIR_MESSAGE : 'Watch live'"
                  :aria-label="'Watch ' + e.channel.name + ' live'"
                  @click="watchLive({ channel: e.channel, nowTitle: e.now?.title || '' })"><tv-icon /></button>
              </li>
            </ul>
          </div>
        </div>
      </section>
      <teleport to="body">
      <transition name="epg-sheet">
      <channels-modal v-if="channelsModal" :channels="data?.channels || []" :hidden-ids="data?.hiddenIds || []"
        :sort="data?.sort" :hide-sd-simulcasts="data?.hideSdSimulcasts" :hide-sd-channels="data?.hideSdChannels"
        @close="channelsModal = false" @saved="onChannelPrefsSaved" />
      </transition>
      </teleport>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash } = useFlash()
    const data = ref(null)
    const error = ref('')
    const tvhConfigured = ref(null)
    const filterQ = ref('')
    const pinnedOnly = storedFlag({ key: LIVE_FAVOURITES_ONLY_KEY, fallback: false })
    const showImages = storedFlag({ key: LIVE_IMAGES_KEY, fallback: true })
    const zoom = storedChoice({ key: LIVE_ZOOM_KEY, options: LIVE_ZOOM_LEVELS, fallback: 'm' })
    const zoomIndex = computed(() => LIVE_ZOOM_LEVELS.indexOf(zoom.value))
    const changeZoom = (step) => {
      const level = LIVE_ZOOM_LEVELS[zoomIndex.value + step]
      if (level) zoom.value = level
    }
    const channelsModal = ref(false)
    const narrow = useMediaQuery(EPG_NARROW_QUERY)
    let pollTimer = null
    let boundaryTimer = null

    const matchesFilter = (e) => {
      const q = filterQ.value.trim().toLowerCase()
      if (!q) return true
      return [e.channel.name, e.channel.number, e.now?.title, e.next?.title]
        .some((v) => v != null && String(v).toLowerCase().includes(q))
    }

    const groups = computed(() => {
      const entries = (data.value?.entries || []).filter(matchesFilter)
      const pinned = entries.filter((e) => e.channel.pinned)
      const rest = pinnedOnly.value ? [] : entries.filter((e) => !e.channel.pinned)
      const anyPinned = pinned.length > 0
      return [
        ...(anyPinned ? [{ key: 'pinned', label: channelGroupLabel({ pinned: true }), entries: pinned }] : []),
        ...(rest.length ? [{ key: 'other', label: channelGroupLabel({ pinned: false, anyPinned }), entries: rest }] : []),
      ]
    })

    const favouritesHint = computed(() => pinnedOnly.value && !filterQ.value.trim())

    const emptyText = computed(() => {
      if (filterQ.value.trim()) return `No channels or shows match "${filterQ.value.trim()}".`
      return 'No channels to show. Open CHANNELS to unhide some.'
    })

    const scheduleBoundaryReload = () => {
      clearTimeout(boundaryTimer)
      const ends = (data.value?.entries || []).map((e) => e.now?.end).filter(Boolean)
      if (!ends.length) return
      const wait = Math.max(LIVE_BOUNDARY_MIN_MS, Math.min(...ends) - Date.now() + LIVE_BOUNDARY_GRACE_MS)
      boundaryTimer = setTimeout(load, wait)
    }

    const load = async () => {
      if (tvhConfigured.value === null) {
        const settings = await api('GET', '/api/settings').catch(() => ({}))
        tvhConfigured.value = Boolean(settings.tvh_url)
      }
      if (!tvhConfigured.value) return
      try {
        data.value = await api('GET', '/api/epg/now?all=1')
        error.value = ''
        scheduleBoundaryReload()
      } catch (err) {
        error.value = err.message
      }
    }

    const currentPins = () => (data.value?.channels || []).filter((c) => c.pinned).map((c) => String(c.id))

    const reorderPins = async (pins) => {
      try {
        await api('PUT', '/api/epg/channel-prefs', { pinned_ids: pins })
        await load()
      } catch (err) {
        flash({ msg: `Reorder failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const pinDrag = usePinDrag({ rowSelector: '.live-row.pinned', currentPins, onReorder: reorderPins, grabSelector: '.epg-pin, .channel-logo' })

    const togglePin = async (channel) => {
      if (pinDrag.didDrag()) return
      const pinnedIds = currentPins()
      try {
        await togglePinnedChannel({ pinnedIds, channelId: channel.id })
        await load()
      } catch (err) {
        flash({ msg: `Favourite failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const onChannelPrefsSaved = async () => {
      channelsModal.value = false
      await load()
      flash({ msg: CHANNELS_SAVED_TEXT })
    }

    const openDetails = (e, program) => openInGuide({ channelId: e.channel.id, program, returnTo: '#/live' })

    const onVisibility = () => {
      if (document.visibilityState === 'visible') load()
    }

    onMounted(() => {
      load()
      pollTimer = setInterval(load, LIVE_LIST_POLL_MS)
      document.addEventListener('visibilitychange', onVisibility)
    })
    onUnmounted(() => {
      clearInterval(pollTimer)
      clearTimeout(boundaryTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    })

    return {
      data, error, tvhConfigured, filterQ, pinnedOnly, showImages, channelsModal, narrow, groups, favouritesHint, emptyText,
      OFF_AIR_MESSAGE, load, togglePin, onChannelPrefsSaved, openDetails, watchLive,
      zoom, zoomIndex, zoomLevelCount: LIVE_ZOOM_LEVELS.length, changeZoom,
      dragPinId: pinDrag.dragPinId, dropTargetId: pinDrag.dropTargetId, dropAfter: pinDrag.dropAfter,
      onPinPointerDown: pinDrag.onPinPointerDown, onPinPointerMove: pinDrag.onPinPointerMove,
      onPinPointerUp: pinDrag.onPinPointerUp, onPinPointerCancel: pinDrag.onPinPointerCancel,
      isRecordingChannel, onNowPercent, onNowMeta, fmtClockTz, flashText, flashKind,
    }
  },
}

const LIVE_LIST_POLL_MS = 30_000
const LIVE_BOUNDARY_MIN_MS = 5_000
const LIVE_BOUNDARY_GRACE_MS = 2_000
const LIVE_IMAGES_KEY = 'freetvarr.liveImages'
const LIVE_FAVOURITES_ONLY_KEY = 'freetvarr.liveFavouritesOnly'
const LIVE_ZOOM_KEY = 'freetvarr.liveZoom'
const LIVE_ZOOM_LEVELS = ['s', 'm', 'l']

const DashboardView = {
  template: `
    <div class="view-reveal space-y-6">
      <recording-now-panel />

      <section v-if="tvhConfigured" class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">WHAT'S ON</span>
            <info-button title="WHAT'S ON" doc="guide/tv-guide#on-the-dashboard">
              <p>What is on now on your favourite channels, what is on next, and the next recordings TVHeadend has scheduled. All of it comes from TVHeadend.</p>
              <p>Star a channel in Live TV or the TV Guide to add it here.</p>
              <p>Tap a programme or a recording to open its details in the TV Guide. The TV button plays the channel live.</p>
            </info-button>
          </span>
          <div class="flex items-center gap-4">
            <a href="#/live" class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">Live TV <arrow-right-icon /></a>
            <a href="#/guide" class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">Guide <arrow-right-icon /></a>
          </div>
        </header>
        <div v-if="!guideOk" class="panel-body flex flex-wrap items-center gap-3">
          <span class="status-readout err">Guide unavailable. TVHeadend did not answer.</span>
          <button type="button" class="btn btn-sm" @click="loadGuidePanel"><refresh-icon /> RETRY</button>
        </div>
        <div v-else class="panel-body space-y-5">
          <div v-if="onNow.length">
            <div class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim mb-3">Now · favourites</div>
            <div class="space-y-3">
            <div v-for="e in onNow" :key="e.channel.id" class="flex items-center gap-3 md:gap-4">
              <channel-logo class="shrink-0" :channel-id="e.channel.id" :has-logo="e.channel.hasLogo" />
              <span :class="['font-mono text-xs text-ink-dim w-20 md:w-28 shrink-0 truncate', { 'off-air': e.channel.offAir }]" :title="e.channel.offAir ? OFF_AIR_MESSAGE : e.channel.name">{{ e.channel.name }}</span>
              <div class="flex-1 min-w-0">
                <button v-if="e.now" type="button" class="on-now-open block w-full"
                  :aria-label="'Show details for ' + e.now.title"
                  @click="openInGuide({ channelId: e.channel.id, program: e.now })">
                  <span class="block truncate">
                    <span class="text-sm font-semibold text-ink mr-3">{{ e.now.title }}</span>
                    <span v-if="isRecordingChannel(e.channel.id)" class="on-now-rec"><span class="led-dot sm live"></span>REC</span>
                    <span v-else class="font-mono text-xs text-ink-dim">{{ onNowMeta(e.now) }}</span>
                  </span>
                  <div class="progress" style="margin-top: 0.25rem; max-width: none;">
                    <div class="progress-track">
                      <div :class="['progress-fill', { rec: isRecordingChannel(e.channel.id) }]" :style="{ width: onNowPercent(e.now) + '%' }"></div>
                    </div>
                  </div>
                </button>
                <span v-else class="text-sm text-ink-mute">off air</span>
              </div>
              <button v-if="e.next" type="button" class="on-now-open hidden sm:block font-mono text-xs text-ink-dim min-w-0 max-w-[16rem] truncate"
                :aria-label="'Show details for ' + e.next.title"
                @click="openInGuide({ channelId: e.channel.id, program: e.next })">
                next: <span class="text-xs font-semibold font-sans text-ink">{{ e.next.title }}</span> {{ fmtClockTz(e.next.start) }}
              </button>
              <button type="button" class="btn btn-sm btn-icon btn-watch shrink-0" :title="e.channel.offAir ? OFF_AIR_MESSAGE : 'Watch live'"
                :aria-label="'Watch ' + e.channel.name + ' live'"
                @click="watchLive({ channel: e.channel, nowTitle: e.now?.title || '' })"><tv-icon /></button>
            </div>
            </div>
          </div>
          <div v-else class="flex flex-wrap items-center gap-3">
            <p class="text-xs text-ink-dim">Star channels to see what's on now.</p>
            <a href="#/live" class="btn btn-sm no-hover-underline">OPEN LIVE TV</a>
          </div>
          <div>
            <div class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim mb-3">Next recordings</div>
            <p v-if="!guideUpcoming.length" class="text-xs text-ink-dim">Nothing scheduled to record.</p>
            <div v-else class="space-y-2">
              <button v-for="r in guideUpcoming" :key="r.id" type="button"
                class="on-now-open flex w-full items-center gap-2.5 font-mono text-xs text-ink-dim min-w-0"
                :aria-label="'Show details for ' + r.name"
                @click="openInGuide({ upcoming: r })">
                <span class="led-dot sm shrink-0" :style="{ background: isSeriesRec(r) ? '#e2b03c' : '#1eb6ff' }"></span>
                <span class="truncate min-w-0"><span class="text-ink">{{ r.name }}</span>
                · {{ fmtRelativeDay(tsOfMs(r.startDate)) }} {{ fmtClockTz(tsOfMs(r.startDate)) }}<template v-if="r.episodeTitle"> · {{ r.episodeTitle }}</template> · {{ isSeriesRec(r) ? 'series' : 'one-off' }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">SYNC DECK</span>
            <info-button title="SYNC DECK" doc="guide/syncs#dashboard-sync-deck">
              <p>A sync reads the finished recordings in TVHeadend, imports them into your library (series episodes into their series folders, single recordings and films into the one-off and movies folders), then asks Plex to refresh.</p>
              <ul><li><strong>STATUS</strong>: idle, or syncing.</li><li><strong>LAST SYNC</strong>: when the last sync ran, and how it went.</li><li><strong>RESULT</strong>: what it imported, or what failed.</li><li><strong>SYNC NOW</strong>: runs a sync at once, without waiting for the schedule.</li></ul>
              <p>The strip below shows TVHeadend, your series, the last 7 days of recordings, and Plex. Press a cell to open its page.</p>
            </info-button>
          </span>
          <span v-if="nextSyncLabel" class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim" :title="'Cron: ' + syncStatus.cron">NEXT SYNC · <span class="text-ink normal-case">{{ nextSyncLabel }}</span></span>
        </header>
        <div class="deck-status">
          <div class="deck-cell deck-cell-status">
            <span class="deck-cell-label"><span :class="['led-dot', 'sm', shownSyncId ? 'live' : 'idle']"></span>STATUS</span>
            <span :class="['deck-cell-value', { 'deck-cell-live': shownSyncId }]">{{ shownSyncId ? 'Syncing' : 'Idle' }}</span>
          </div>
          <div class="deck-zone-action">
            <button type="button" class="btn btn-primary" @click="syncNow" :disabled="!!shownSyncId || starting">
              <play-icon v-if="!shownSyncId && !starting" /> {{ syncButtonLabel }}
            </button>
          </div>
          <a href="#/syncs" class="deck-cell deck-cell-last no-hover-underline" :title="lastSyncCell.title">
            <span class="deck-cell-label">
              <span v-if="lastSyncCell.dot" :class="['led-dot', 'sm', { live: lastSyncCell.live }]" :style="{ background: lastSyncCell.dot }"></span>{{ lastSyncCell.label }}
            </span>
            <span :class="['deck-cell-value', { 'deck-cell-dim': lastSyncCell.dim }]">{{ lastSyncCell.value }}</span>
          </a>
          <div :key="resultCell.key" class="deck-cell deck-cell-result deck-fade" :title="resultCell.title">
            <span class="deck-cell-label">{{ resultCell.label }}</span>
            <span :class="['deck-cell-value', resultCell.tone]">{{ resultCell.value }}<span v-if="resultCell.failed" class="deck-cell-err"> · {{ resultCell.failed }} failed</span></span>
          </div>
        </div>
        <div class="deck-pipeline">
          <a v-for="cell in pipeline" :key="cell.label" :href="cell.href" class="deck-cell no-hover-underline">
            <span class="deck-cell-label">
              <span v-if="cell.health" class="led-dot sm" :style="{ background: HEALTH_COLOURS[cell.health] }"></span>{{ cell.label }}
            </span>
            <span :class="['deck-cell-value', { 'deck-cell-cta': cell.cta }]" :title="cell.title || cell.value">{{ cell.value }}</span>
          </a>
        </div>
      </section>

      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">RECENT SYNCS</span>
            <info-button title="RECENT SYNCS" doc="guide/syncs#reading-a-sync">
              <p>The last few syncs Freetvarr ran, newest first, with what each one imported.</p>
              <p>A sync is <strong>ok</strong> unless something failed. <strong>See all</strong> opens the Syncs tab with the full history.</p>
            </info-button>
          </span>
          <a href="#/syncs" class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">See all <arrow-right-icon /></a>
        </header>
        <div class="panel-body">
          <table v-if="recentSyncs.length" class="deck-table hidden md:table">
            <thead><tr>
              <th>Started</th><th>Status</th><th>Summary</th>
            </tr></thead>
            <tbody>
              <tr v-for="s in recentSyncs" :key="s.id" :class="{ active: s.id === syncStatus.activeSyncId }">
                <td class="font-mono">{{ fmtTime(s.started_at) }}</td>
                <td><span :class="['pill', s.status]">{{ s.status }}</span></td>
                <td><summary-line :summary="s.summary"/></td>
              </tr>
            </tbody>
          </table>
          <div v-if="recentSyncs.length" class="md:hidden space-y-3">
            <article v-for="s in recentSyncs" :key="s.id"
              :class="['deck-card', 'space-y-2', { active: s.id === syncStatus.activeSyncId }]">
              <div class="flex items-start justify-between gap-3">
                <span class="deck-card-meta">{{ fmtTime(s.started_at) }}</span>
                <span :class="['pill', s.status]">{{ s.status }}</span>
              </div>
              <summary-line :summary="s.summary"/>
            </article>
          </div>
          <p v-else class="text-ink-dim text-sm">No syncs yet.</p>
        </div>
      </section>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash } = useFlash()
    const starting = ref(false)
    const heldSyncId = ref(null)
    const runningSince = ref({ id: null, at: null })
    const shownSyncId = computed(() => syncStatus.value.activeSyncId || heldSyncId.value)
    const recentSyncs = ref([])
    const statsLoaded = ref(false)
    const seriesCount = ref(0)
    const outsideLibraryCount = ref(0)
    const seriesUnavailable = ref(false)
    const recordings7dCount = ref(0)
    const plexConfigured = ref(false)
    const plexHost = ref('')
    const tvhState = ref(null)
    const tvhReachable = ref(false)
    const tvhConfigured = ref(false)
    const onNow = ref([])
    const guideUpcoming = ref([])
    const guideSeriesLinks = ref(new Set())
    const guideOk = ref(true)

    const lastSync = computed(() => recentSyncs.value[0] || null)

    const deckSync = computed(() => {
      const id = shownSyncId.value
      if (!id || lastSync.value?.id === id) return lastSync.value
      const startedAt = runningSince.value.id === id ? runningSince.value.at : null
      return { id, status: 'running', started_at: startedAt, summary: null }
    })

    const noteRunningSince = (id) => {
      if (id && runningSince.value.id !== id) runningSince.value = { id, at: new Date().toISOString() }
    }


    const loadGuidePanel = async () => {
      if (!tvhConfigured.value) {
        tvhState.value = null
        tvhReachable.value = false
        return
      }
      const [s, onNowResult] = await Promise.all([
        api('GET', '/api/epg/state').catch(() => null),
        api('GET', '/api/epg/now').catch(() => null),
      ])
      tvhState.value = s
      tvhReachable.value = Boolean(s) && !s.stale
      guideSeriesLinks.value = new Set((s?.seriesTags || []).map((t) => String(t.seriesLinkId ?? t.id)))
      guideUpcoming.value = (s?.futureRecordings || [])
        .filter((r) => !r.pendingDelete)
        .sort((a, b) => tsOfMs(a.startDate) - tsOfMs(b.startDate))
        .slice(0, 3)
      guideOk.value = Boolean(onNowResult)
      if (onNowResult) onNow.value = onNowResult.entries || []
    }

    const isSeriesRec = (r) =>
      r?.seriesLinkId != null && guideSeriesLinks.value.has(String(r.seriesLinkId))


    const refresh = async () => {
      const [syncs, , series, recordings, settings] = await Promise.all([
        api('GET', '/api/syncs?pageSize=5').catch(() => ({ syncs: [] })),
        loadSyncStatus().then(ensureSyncPolling),
        api('GET', '/api/series').catch((err) => ({ series: [], error: err.message })),
        api('GET', '/api/recordings').catch(() => ({ recordings: [] })),
        api('GET', '/api/settings').catch(() => ({})),
      ])
      recentSyncs.value = (syncs.syncs || []).slice(0, 5)
      seriesCount.value = series.series?.length || 0
      outsideLibraryCount.value = series.series?.filter((s) => s.savesTo?.kind !== 'library').length || 0
      seriesUnavailable.value = Boolean(series.error)
      recordings7dCount.value = recordings.recordings?.filter((r) => within7Days(r.imported_at)).length || 0
      plexConfigured.value = Boolean(settings.plex_url && settings.plex_token_set && settings.plex_tv_section_id)
      plexHost.value = hostOf(settings.plex_url)
      tvhConfigured.value = Boolean(settings.tvh_url)
      await loadGuidePanel()
      statsLoaded.value = true
    }

    const tvhCell = computed(() => {
      const base = { label: 'TVHEADEND', href: '#/settings/tvheadend' }
      if (!statsLoaded.value) return { ...base, value: '...' }
      if (!tvhConfigured.value) return { ...base, health: 'off', value: 'not set up', cta: true }
      if (!tvhReachable.value) return { ...base, href: '#/doctor/tvheadend', health: 'err', value: 'unreachable' }
      const s = tvhState.value
      const bits = [
        ...(s?.tunerCount ? [`${s.tunerCount} tuner${s.tunerCount === 1 ? '' : 's'}`] : []),
        ...(s?.storageInfo?.free ? [`${fmtBytes(s.storageInfo.free)} free`] : []),
      ]
      return { ...base, health: 'ok', value: bits.join(' · ') || 'reachable' }
    })

    const seriesCell = computed(() => {
      const base = { label: 'SERIES', href: '#/series' }
      if (!statsLoaded.value || seriesUnavailable.value) return { ...base, value: '...' }
      if (!seriesCount.value) return { ...base, href: '#/guide', value: 'record a series', cta: true }
      const outside = outsideLibraryCount.value ? ` · ${outsideLibraryCount.value} not in library` : ''
      return { ...base, value: `${seriesCount.value} series${outside}` }
    })

    const recordingsCell = computed(() => ({
      label: 'RECORDINGS 7D',
      href: '#/recordings',
      value: statsLoaded.value ? `${recordings7dCount.value} imported` : '...',
    }))

    const plexCell = computed(() => {
      const base = { label: 'PLEX', href: '#/settings/plex' }
      if (!statsLoaded.value) return { ...base, value: '...' }
      if (!plexConfigured.value) return { ...base, health: 'off', value: 'not set up', cta: true }
      return { ...base, health: 'ok', value: plexHost.value || 'connected' }
    })

    const pipeline = computed(() => [tvhCell.value, seriesCell.value, recordingsCell.value, plexCell.value])

    const lastSyncCell = computed(() => {
      const s = deckSync.value
      if (!s) return { label: 'LAST SYNC', value: 'never', dim: true }
      const nowMs = now.value.getTime()
      const title = [`#${s.id}`, fmtTime(s.started_at), s.summary?.trigger].filter(Boolean).join(' · ')
      if (s.status === 'running') {
        return { label: 'ELAPSED', value: fmtElapsed({ at: s.started_at, nowMs }), dot: SYNC_DOTS.running, live: true, title }
      }
      return { label: 'LAST SYNC', value: fmtAgo({ at: s.finished_at || s.started_at, nowMs }), dot: SYNC_DOTS[s.status], title }
    })

    const resultCell = computed(() => {
      if (flashText.value) {
        return { key: `flash-${flashText.value}`, label: 'NOTICE', value: flashText.value, tone: flashKind.value, title: flashText.value }
      }
      const s = deckSync.value
      if (!s) return { key: 'none', label: 'RESULT', value: 'none', tone: 'deck-cell-dim' }
      if (s.status === 'running') return { key: `run-${s.id}`, label: 'RESULT', value: 'in progress', tone: 'deck-cell-dim' }
      const sum = s.summary || {}
      const errors = (sum.errors || []).join('\n')
      if (s.status === 'error') {
        const text = sum.message || sum.errors?.[0] || 'failed'
        return { key: `err-${s.id}`, label: 'RESULT', value: text, tone: 'err', title: errors || text }
      }
      if (sum.imported) return { key: `ok-${s.id}`, label: 'RESULT', value: `${sum.imported} imported`, failed: sum.failed, title: errors }
      if (sum.failed) return { key: `fail-${s.id}`, label: 'RESULT', value: `${sum.failed} failed`, tone: 'err', title: errors }
      return { key: `none-${s.id}`, label: 'RESULT', value: sum.message || 'nothing new', tone: 'deck-cell-dim' }
    })

    const nextSyncLabel = computed(() => {
      const at = Date.parse(syncStatus.value.nextRunAt || '')
      if (!at) return ''
      const mins = Math.ceil((at - now.value.getTime()) / 60_000)
      if (mins <= 0) return 'due'
      if (mins < 60) return `in ${formatMinutes(mins)}`
      return `at ${fmtClockTz(at)}`
    })

    const syncButtonLabel = computed(() => {
      if (starting.value) return 'STARTING…'
      if (shownSyncId.value) return 'SYNCING…'
      return 'SYNC NOW'
    })

    const holdSyncState = (syncId) => {
      heldSyncId.value = syncId
      noteRunningSince(syncId)
      setTimeout(() => { heldSyncId.value = null }, MIN_SYNC_DISPLAY_MS)
    }

    const syncNow = async () => {
      starting.value = true
      try {
        const r = await api('POST', '/api/sync')
        if (r.alreadyRunning) flash({ msg: 'A sync is already running.', kind: 'info' })
        else holdSyncState(r.syncId)
        await loadSyncStatus()
        ensureSyncPolling()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      } finally {
        starting.value = false
      }
    }

    let pollTimer = null
    onMounted(() => {
      refresh()
      pollTimer = setInterval(refresh, DASHBOARD_POLL_MS)
    })
    onUnmounted(() => {
      if (pollTimer) clearInterval(pollTimer)
    })
    const stopWatch = watch(shownSyncId, (curr) => {
      noteRunningSince(curr)
      if (!curr || !heldSyncId.value) refresh()
    })
    onUnmounted(stopWatch)

    return {
      syncStatus, shownSyncId, lastSyncCell, resultCell, nextSyncLabel, recentSyncs,
      tvhConfigured, pipeline, HEALTH_COLOURS,
      onNow, guideUpcoming, guideOk, onNowPercent, onNowMeta, isSeriesRec, fmtClockTz, fmtRelativeDay, tsOfMs,
      isRecordingChannel, loadGuidePanel,
      OFF_AIR_MESSAGE, watchLive, openInGuide, starting, syncNow, syncButtonLabel, fmtTime,
      flashText, flashKind,
    }
  },
}

const mediaRootPrefix = (mediaRoot) => `${(mediaRoot || '/media/tv').replace(/\/+$/, '')}/`

const FOLDER_HINT = 'Type a folder name; matching existing folders are suggested.'

const seasonFolderFor = (season) => `Season ${season == null ? '…' : String(season).padStart(2, '0')}`

const folderNameFor = (title) => String(title || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()

const FolderEditor = {
  props: {
    folder: { type: Object, required: true },
    folders: { type: Array, default: () => [] },
    mediaRoot: { type: String, default: '' },
    adRemovalEnabled: Boolean,
    isSeries: Boolean,
    importUnmatched: { type: Boolean, default: true },
  },
  emits: ['saved', 'cancel', 'deleted'],
  template: `
    <form class="series-editor space-y-4" @submit.prevent="save">
      <div class="grid gap-4 md:grid-cols-2">
        <div class="field-row">
          <label class="field-label" :for="'saves-to-' + folder.id">Saves to</label>
          <div class="field-prefixed">
            <span class="field-prefix">{{ mediaRootPrefix(mediaRoot) }}</span>
            <input v-no-autofill :id="'saves-to-' + folder.id" v-autofocus type="text" v-model="destFolder" list="series-media-folders" class="field-input" />
          </div>
          <datalist id="series-media-folders">
            <option v-for="d in folders" :key="d" :value="d" />
          </datalist>
          <p class="text-xs text-ink-mute mt-2">{{ FOLDER_HINT }}</p>
        </div>
        <div class="field-row">
          <label class="field-label">Season folders</label>
          <input v-no-autofill type="text" v-model="seasonTemplate" placeholder="Season {season}" class="field-input" />
        </div>
        <div class="field-row">
          <label class="field-label">Recording titles that contain</label>
          <input v-no-autofill type="text" v-model="pattern" class="field-input" />
          <p class="text-xs text-ink-mute mt-2">Case-insensitive. The longest match wins when two folders match.</p>
        </div>
        <div class="field-row">
          <label class="field-label">Ad removal</label>
          <select class="field-input" v-model="adRemoval" :disabled="!adRemovalEnabled">
            <option value="off">OFF</option>
            <option value="detect">DETECT: mark ad breaks so Kodi can skip them</option>
            <option value="cut">CUT: remove ad breaks (keeps .orig backup)</option>
          </select>
          <p v-if="!adRemovalEnabled" class="text-xs text-ink-mute mt-2">Enable ad removal in Settings to use this.</p>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <toggle-switch v-model="deleteAfter">REMOVE FROM TVHEADEND AFTER IMPORT</toggle-switch>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="submit" class="btn btn-primary" :disabled="saving">
          <template v-if="saving">SAVING…</template><template v-else><check-icon /> SAVE</template>
        </button>
        <button type="button" class="btn" @click="$emit('cancel')" :disabled="saving">CANCEL</button>
        <button type="button" class="btn btn-danger ml-auto" @click="confirming = true" :disabled="saving">{{ removeLabel }}</button>
        <span v-if="statusText" :class="['status-readout', statusKind]">{{ statusText }}</span>
      </div>
      <teleport to="body">
      <transition name="epg-sheet">
      <div v-if="confirming" class="epg-modal-backdrop" @click.self="confirming = false">
        <section class="panel epg-modal info-modal" role="alertdialog" aria-modal="true" :aria-labelledby="'remove-title-' + folder.id">
          <header class="panel-header">
            <span :id="'remove-title-' + folder.id" class="panel-title">{{ removeTitle }}</span>
            <button type="button" class="btn btn-sm btn-icon epg-modal-x" @click="confirming = false" aria-label="Close"><cross-icon /></button>
          </header>
          <div class="panel-body space-y-4">
            <p class="text-sm text-ink">{{ removeOutcome }}</p>
            <p class="text-sm text-ink">{{ isSeries ? 'Episodes' : 'Recordings' }} already imported will stay where they are.</p>
            <div class="epg-modal-actions flex flex-wrap items-center justify-end gap-2">
              <button type="button" class="btn epg-modal-close mr-auto" @click="confirming = false" :disabled="saving">CANCEL</button>
              <button type="button" class="btn btn-danger" @click="remove" :disabled="saving">
                <template v-if="saving">REMOVING…</template><template v-else>{{ removeLabel }}</template>
              </button>
            </div>
          </div>
        </section>
      </div>
      </transition>
      </teleport>
    </form>
  `,
  setup(props, { emit }) {
    const [statusText, statusKind, setStatus] = makeStatus()
    const destFolder = ref(props.folder.dest_folder)
    const seasonTemplate = ref(props.folder.season_template)
    const pattern = ref(props.folder.show_pattern)
    const adRemoval = ref(props.folder.ad_removal || 'off')
    const deleteAfter = ref(Boolean(props.folder.delete_after_import))
    const saving = ref(false)
    const confirming = ref(false)
    const removeLabel = computed(() => (props.isSeries ? 'UNASSIGN FOLDER' : 'REMOVE TITLE MATCH'))
    const removeTitle = computed(() => (props.isSeries
      ? `Unassign the folder from ${props.folder.show_pattern}`
      : `Remove the title match ${props.folder.show_pattern}`))
    const removeOutcome = computed(() => {
      const condition = props.isSeries
        ? 'If you unassign this series folder, future episodes'
        : 'If you remove this title match, future recordings with this title'
      return props.importUnmatched
        ? `${condition} will save to the one-off folder again.`
        : `${condition} will wait in RECORDINGS until you import them.`
    })

    const save = async () => {
      if (!destFolder.value.trim() || !pattern.value.trim()) {
        setStatus('Enter where to save and the title.', 'err', 5000)
        return
      }
      saving.value = true
      try {
        await api('PATCH', `/api/shows/${props.folder.id}`, {
          dest_folder: destFolder.value.trim(),
          season_template: seasonTemplate.value.trim() || 'Season {season}',
          show_pattern: pattern.value.trim(),
          enabled: true,
          delete_after_import: deleteAfter.value,
          ...(props.adRemovalEnabled ? { ad_removal: adRemoval.value } : {}),
        })
        emit('saved')
      } catch (err) {
        setStatus(`Error: ${err.message}`, 'err', 5000)
      } finally {
        saving.value = false
      }
    }

    const remove = async () => {
      saving.value = true
      try {
        await api('DELETE', `/api/shows/${props.folder.id}`)
        confirming.value = false
        emit('deleted')
      } catch (err) {
        confirming.value = false
        setStatus(`Error: ${err.message}`, 'err', 5000)
      } finally {
        saving.value = false
      }
    }

    return {
      destFolder, seasonTemplate, pattern, adRemoval, deleteAfter, saving, confirming,
      removeLabel, removeTitle, removeOutcome, save, remove, statusText, statusKind, mediaRootPrefix, FOLDER_HINT,
    }
  },
}

const SeriesView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">SERIES · {{ series.length }}</span>
            <info-button title="SERIES" doc="guide/series">
              <p>Each row is a series recording in TVHeadend. <strong>Saves to</strong> shows the folder where each sync saves its finished episodes.</p>
              <p>To record a new series, open the TV Guide, pick a programme, and press <strong>RECORD SERIES</strong>. An SD and an HD recording of the same title show as one series.</p>
              <p><strong>STOP SERIES</strong> cancels the series recording in TVHeadend. Episodes already recorded stay, and so do their files. <strong>EDIT</strong> changes where episodes save, the season folders, ad removal, and whether Freetvarr removes the TVHeadend copy after import.</p>
              <p>A series with no folder in your TV library saves to the one-off folder. Press <strong>ASSIGN FOLDER</strong> to give it one. <strong>UNASSIGN FOLDER</strong> in the edit form takes it away again. Episodes already imported stay where they are.</p>
              <p><strong>PAUSE</strong> stops TVHeadend recording new episodes of this series, and the row shows <strong>PAUSED</strong>. Episodes already recorded still import. <strong>RESUME</strong> starts it again; <strong>STOP SERIES</strong> removes it.</p>
            </info-button>
          </span>
          <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
        </header>
        <div class="panel-body space-y-4">
          <p class="text-sm text-ink-dim leading-relaxed">
            Series episodes go into their own folder in the TV library. Single recordings and films go to the one-off and movies folders; see <a href="#/recordings">RECORDINGS</a>.
          </p>
          <div v-if="!loaded" class="text-ink-dim font-mono text-sm"><signal-bars-icon /> contacting TVHeadend…</div>
          <template v-else>
            <p v-if="error" class="text-sm font-mono text-signal-orange-hi">Cannot read the series recordings from TVHeadend: {{ error }}</p>
            <p v-else-if="stale" class="text-xs font-mono text-plex-yellow">TVHeadend is not answering. This is its last known state.</p>
            <p v-if="!error && series.length === 0" class="text-ink-dim text-sm">
              No series recordings yet. Open the <a href="#/guide">TV Guide</a>, pick a programme, and press <strong>RECORD SERIES</strong>.
            </p>
            <div v-else class="space-y-3">
              <article v-for="s in series" :key="s.key" class="deck-card space-y-3">
                <div class="deck-card-with-image">
                  <programme-image v-if="s.imageProgramId != null" :event-id="s.imageProgramId" :channel-id="s.autorecs[0]?.channelId" />
                  <div class="deck-card-text">
                    <div class="flex items-start justify-between gap-3">
                      <span class="deck-card-title">{{ s.title }}</span>
                      <span class="pill-group end">
                        <span v-if="!s.recording" class="pill skipped">PAUSED</span>
                      </span>
                    </div>
                    <p class="deck-card-meta">{{ channelsOf(s) }}<template v-if="s.episodesToKeep"> · keeps the latest {{ s.episodesToKeep }}</template></p>
                    <p class="deck-card-meta"><span class="deck-card-label">Next</span> {{ nextAiringLabel(s) }}</p>
                    <p class="deck-card-meta"><span class="deck-card-label">Saves to</span> <code v-if="s.savesTo?.path">{{ s.savesTo.path }}</code><template v-else>nowhere yet: episodes wait in <a href="#/recordings">RECORDINGS</a></template></p>
                  </div>
                </div>
                <series-folder-editor v-if="s.folder && editingKey === s.key" :folder="s.folder" :folders="folders"
                  :media-root="mediaRoot" :ad-removal-enabled="adRemovalEnabled" is-series :import-unmatched="importUnmatched"
                  @saved="onSaved" @deleted="onDeleted" @cancel="editingKey = ''" />
                <div v-else class="flex flex-wrap items-center gap-2">
                  <template v-if="s.folder">
                    <button type="button" class="btn" @click="edit(s.key)"><sliders-icon /> EDIT</button>
                    <button type="button" class="btn" @click="syncOne(s.folder)"
                      :disabled="!s.folder.enabled || syncingId === s.folder.id"
                      :title="s.folder.enabled ? 'Sync just this series now' : 'Press EDIT, then SAVE, to sync this series'">
                      <template v-if="syncingId === s.folder.id">STARTING…</template><template v-else><play-icon /> SYNC</template>
                    </button>
                  </template>
                  <button v-else type="button" class="btn btn-primary" @click="openAssign(s)" :disabled="busyKey === s.key">
                    <plus-icon /> ASSIGN FOLDER
                  </button>
                  <button type="button" class="btn ml-auto" @click="pauseSeries(s, s.recording)" :disabled="busyKey === s.key">
                    <template v-if="s.recording"><pause-icon /> PAUSE</template><template v-else><play-icon /> RESUME</template>
                  </button>
                  <button type="button" class="btn btn-danger" @click="stopSeries(s)" :disabled="busyKey === s.key">
                    <cross-icon /> STOP SERIES
                  </button>
                </div>
              </article>
            </div>
          </template>
        </div>
      </section>

      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">TITLE MATCHES · {{ titleMatches.length }}</span>
            <info-button title="TITLE MATCHES" doc="guide/series#title-matches">
              <p>A recording whose title contains this text saves to its folder, even without a series recording. This covers a title you typed by hand, such as <code>NRL</code>, or a series you stopped.</p>
              <p><strong>ADD TITLE</strong> adds one. Freetvarr suggests a folder under your media root, and matches folders that are already there.</p>
            </info-button>
          </span>
        </header>
        <div class="panel-body space-y-4">
          <p class="text-sm text-ink-dim">A recording whose title contains this text saves to its folder, even without a series recording.</p>
          <div v-if="titleMatches.length" class="space-y-3">
            <article v-for="f in titleMatches" :key="f.id" class="deck-card space-y-3">
              <div class="flex items-start justify-between gap-3">
                <span class="deck-card-title">{{ f.show_pattern }}</span>
              </div>
              <p class="deck-card-meta"><span class="deck-card-label">Saves to</span> <code v-if="f.savesTo?.path">{{ f.savesTo.path }}</code><template v-else>nowhere yet: recordings wait in <a href="#/recordings">RECORDINGS</a></template></p>
              <series-folder-editor v-if="editingKey === 'folder-' + f.id" :folder="f" :folders="folders"
                :media-root="mediaRoot" :ad-removal-enabled="adRemovalEnabled" :import-unmatched="importUnmatched"
                @saved="onSaved" @deleted="onDeleted" @cancel="editingKey = ''" />
              <div v-else class="flex flex-wrap items-center gap-2">
                <button type="button" class="btn" @click="edit('folder-' + f.id)"><sliders-icon /> EDIT</button>
                <button type="button" class="btn" @click="syncOne(f)" :disabled="!f.enabled || syncingId === f.id"
                  :title="f.enabled ? 'Sync just this title now' : 'Press EDIT, then SAVE, to sync this title'">
                  <template v-if="syncingId === f.id">STARTING…</template><template v-else><play-icon /> SYNC</template>
                </button>
              </div>
            </article>
          </div>

          <form class="space-y-4 pt-2 border-t border-hairline" @submit.prevent="add">
            <span class="field-label pt-3 block">ADD TITLE</span>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="field-row">
                <label class="field-label">Recording titles that contain</label>
                <div class="flex flex-wrap items-center gap-2">
                  <input v-no-autofill type="text" v-model="newPattern" list="tvh-shows" placeholder="e.g. NRL" class="field-input flex-1 min-w-[12rem]" />
                  <button type="button" class="btn btn-sm" @click="loadTvhShows" :disabled="loadingShows"
                    title="List the titles TVHeadend has finished recordings for.">
                    <template v-if="loadingShows">LISTING…</template><template v-else><refresh-icon /> REFRESH TITLES</template>
                  </button>
                </div>
                <datalist id="tvh-shows">
                  <option v-for="fs in tvhShows" :key="fs.id" :value="fs.title" />
                </datalist>
                <p class="text-xs text-ink-mute mt-2">Case-insensitive part of the TVHeadend recording title.</p>
              </div>
              <div class="field-row">
                <label class="field-label" for="new-saves-to">Saves to</label>
                <div class="field-prefixed">
                  <span class="field-prefix">{{ mediaRootPrefix(mediaRoot) }}</span>
                  <input v-no-autofill id="new-saves-to" type="text" v-model="newFolder" list="media-folders" placeholder="e.g. NRL" class="field-input" />
                </div>
                <datalist id="media-folders">
                  <option v-for="d in folders" :key="d" :value="d" />
                </datalist>
                <p class="text-xs text-ink-mute mt-2">{{ FOLDER_HINT }}</p>
                <p v-if="suggestion" class="text-xs text-ink-dim mt-2">
                  Suggested ({{ suggestionIsNew ? 'new folder' : 'existing' }}):
                  <code>{{ suggestion }}</code>
                  <button type="button" class="btn-link" @click="newFolder = suggestion">use</button>
                </p>
              </div>
              <div class="field-row">
                <label class="field-label">Season folders</label>
                <input v-no-autofill type="text" v-model="newTemplate" placeholder="Season {season}" class="field-input" />
              </div>
              <div class="field-row">
                <label class="field-label">Ad removal</label>
                <select class="field-input" v-model="newAdRemoval" :disabled="!adRemovalEnabled">
                  <option value="off">OFF</option>
                  <option value="detect">DETECT: mark ad breaks so Kodi can skip them</option>
                  <option value="cut">CUT: remove ad breaks (keeps .orig backup)</option>
                </select>
                <p v-if="!adRemovalEnabled" class="text-xs text-ink-mute mt-2">Enable ad removal in Settings to use this.</p>
              </div>
            </div>
            <toggle-switch v-model="newDeleteAfter">REMOVE FROM TVHEADEND AFTER IMPORT</toggle-switch>
            <div class="flex flex-wrap items-center gap-3">
              <button type="submit" class="btn btn-primary" :disabled="adding">
                <template v-if="adding">ADDING…</template><template v-else><plus-icon /> ADD TITLE</template>
              </button>
              <span v-if="formStatusText" :class="['status-readout', formStatusKind]">{{ formStatusText }}</span>
            </div>
          </form>
        </div>
      </section>

      <teleport to="body">
      <transition name="epg-sheet">
      <div v-if="assigning" class="epg-modal-backdrop" @click.self="closeAssign">
        <form class="panel epg-modal info-modal" role="dialog" aria-modal="true" aria-labelledby="assign-folder-title" @submit.prevent="assignFolder">
          <header class="panel-header">
            <span id="assign-folder-title" class="panel-title">Assign a folder to {{ assigning.title }}</span>
            <button type="button" class="btn btn-sm btn-icon epg-modal-x" @click="closeAssign" aria-label="Close"><cross-icon /></button>
          </header>
          <div class="panel-body space-y-4">
            <p class="text-sm text-ink">Future episodes save to <code>{{ assignPath }}</code>.</p>
            <div class="field-row">
              <label class="field-label" for="assign-folder">Folder</label>
              <div class="field-prefixed">
                <span class="field-prefix">{{ mediaRootPrefix(mediaRoot) }}</span>
                <input v-no-autofill id="assign-folder" v-autofocus type="text" v-model="assignDest" list="assign-media-folders" class="field-input" />
              </div>
              <datalist id="assign-media-folders">
                <option v-for="d in folders" :key="d" :value="d" />
              </datalist>
              <p class="text-xs text-ink-mute mt-2">{{ FOLDER_HINT }}</p>
            </div>
            <div v-if="folders.length" class="field-row">
              <label class="field-label" for="assign-existing">Or pick an existing folder</label>
              <select id="assign-existing" class="field-input" :value="folders.includes(assignDest.trim()) ? assignDest.trim() : ''"
                @change="assignDest = $event.target.value">
                <option value="" disabled>Choose a folder…</option>
                <option v-for="d in folders" :key="d" :value="d">{{ d }}</option>
              </select>
            </div>
            <p class="text-sm text-ink">Episodes already imported stay where they are.</p>
            <div class="epg-modal-actions flex flex-wrap items-center justify-end gap-2">
              <button type="button" class="btn epg-modal-close mr-auto" @click="closeAssign" :disabled="busyKey === assigning.key">CANCEL</button>
              <span v-if="assignStatusText" :class="['status-readout', assignStatusKind]">{{ assignStatusText }}</span>
              <button type="submit" class="btn btn-primary" :disabled="busyKey === assigning.key">
                <template v-if="busyKey === assigning.key">ASSIGNING…</template><template v-else><check-icon /> ASSIGN</template>
              </button>
            </div>
          </div>
        </form>
      </div>
      </transition>
      </teleport>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash, flashUntilSyncDone } = useFlash()
    const [formStatusText, formStatusKind, setFormStatus] = makeStatus()
    const series = ref([])
    const titleMatches = ref([])
    const loaded = ref(false)
    const error = ref('')
    const stale = ref(false)
    const editingKey = ref('')
    const busyKey = ref('')
    const tvhShows = ref([])
    const folders = ref([])
    const newPattern = ref('')
    const newFolder = ref('')
    const newTemplate = ref('Season {season}')
    const newDeleteAfter = ref(false)
    const newAdRemoval = ref('off')
    const suggestion = ref('')
    const suggestionIsNew = ref(false)
    const adding = ref(false)
    const loadingShows = ref(false)
    const syncingId = ref(null)
    const mediaRoot = ref('')
    const adRemovalEnabled = ref(false)
    const importUnmatched = ref(true)
    const assigning = ref(null)
    const assignDest = ref('')
    const [assignStatusText, assignStatusKind, setAssignStatus] = makeStatus()

    const refresh = async () => {
      try {
        const r = await api('GET', '/api/series')
        series.value = r.series || []
        titleMatches.value = r.titleMatches || []
        error.value = r.error || ''
        stale.value = Boolean(r.stale)
      } catch (err) {
        error.value = err.message
      } finally {
        loaded.value = true
      }
    }

    const loadSettings = async () => {
      const s = await api('GET', '/api/settings').catch(() => ({}))
      mediaRoot.value = s.media_root || ''
      adRemovalEnabled.value = Boolean(s.ad_removal_enabled)
      importUnmatched.value = s.import_unmatched !== false
    }

    const loadFolders = async (title) => {
      const r = await api('GET', `/api/folder-suggest?show=${encodeURIComponent(title)}`).catch(() => ({}))
      folders.value = r.folders || folders.value
      return r.match?.folder || ''
    }

    const suggestFor = async (pattern) => {
      const trimmed = (pattern || '').trim()
      if (trimmed.length < 2) {
        suggestion.value = ''
        suggestionIsNew.value = false
        return
      }
      const existing = await loadFolders(trimmed)
      suggestion.value = existing || folderNameFor(trimmed)
      suggestionIsNew.value = !existing
    }

    let debounceTimer = null
    watch(newPattern, (v) => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => suggestFor(v), 250)
    })

    onMounted(() => Promise.all([refresh(), loadSettings()]))

    const channelsOf = (s) => s.autorecs.some((a) => a.anyChannel)
      ? 'Any channel'
      : [...new Set(s.autorecs.map((a) => a.channelName).filter(Boolean))].join(' + ')
      || (s.autorecs.length === 1 ? '1 channel' : `${s.autorecs.length} channels`)

    const nextAiringLabel = (s) => {
      const next = s.nextAiring
      if (!next) return 'nothing in the guide for the next 7 days'
      const at = tsOfMs(next.startDate)
      const bits = [
        `${fmtRelativeDay(at)} ${fmtClockTz(at)}`,
        ...(next.channelName ? [next.channelName] : []),
        ...(next.episodeTitle ? [next.episodeTitle] : []),
      ]
      return bits.join(' · ')
    }

    const edit = async (key) => {
      editingKey.value = key
      if (folders.value.length === 0) await loadFolders('_')
    }

    const onSaved = async () => {
      editingKey.value = ''
      await refresh()
      flash({ msg: 'Saved.' })
    }

    const onDeleted = async () => {
      editingKey.value = ''
      await refresh()
      flash({ msg: 'Removed.' })
    }

    const assignPath = computed(() => {
      const folder = assignDest.value.trim() || '…'
      return `${mediaRootPrefix(mediaRoot.value)}${folder}/${seasonFolderFor(assigning.value?.nextAiring?.season)}`
    })

    const openAssign = async (s) => {
      assigning.value = s
      assignDest.value = ''
      assignDest.value = (await loadFolders(s.title)) || folderNameFor(s.title)
    }

    const closeAssign = () => {
      if (busyKey.value === assigning.value?.key) return
      assigning.value = null
    }

    const assignFolder = async () => {
      const s = assigning.value
      const destFolder = assignDest.value.trim()
      if (!destFolder) {
        setAssignStatus('Enter a folder name.', 'err', 5000)
        return
      }
      busyKey.value = s.key
      try {
        await api('POST', '/api/shows', { show_pattern: s.title, dest_folder: destFolder })
        busyKey.value = ''
        assigning.value = null
        await refresh()
        flash({ msg: `Episodes of "${s.title}" save to ${destFolder}. Press EDIT to change it.`, ms: 6000 })
      } catch (err) {
        setAssignStatus(`Error: ${err.message}`, 'err', 5000)
      } finally {
        busyKey.value = ''
      }
    }

    const stopSeries = async (s) => {
      if (!confirm(`Stop recording "${s.title}"? Episodes already recorded will stay in TVHeadend, and the library folder will stay.`)) return
      busyKey.value = s.key
      try {
        for (const autorec of s.autorecs) {
          await api('POST', '/api/epg/cancel-series', { series_link_id: autorec.seriesLinkId })
        }
        await refresh()
        flash({ msg: `Stopped the series recording of "${s.title}".` })
      } catch (err) {
        flash({ msg: `Stop failed: ${err.message}`, kind: 'err', ms: 8000 })
        await refresh()
      } finally {
        busyKey.value = ''
      }
    }

    const pauseSeries = async (s, paused) => {
      busyKey.value = s.key
      try {
        await api('POST', '/api/epg/pause-series', {
          series_link_ids: s.autorecs.map((a) => a.seriesLinkId),
          paused,
        })
        await refresh()
        flash({ msg: paused ? `Paused the series recording of "${s.title}".` : `Resumed the series recording of "${s.title}".` })
      } catch (err) {
        flash({ msg: `${paused ? 'Pause' : 'Resume'} failed: ${err.message}`, kind: 'err', ms: 8000 })
        await refresh()
      } finally {
        busyKey.value = ''
      }
    }

    const add = async () => {
      if (!newPattern.value.trim() || !newFolder.value.trim()) {
        setFormStatus('Enter the title and where to save.', 'err', 5000)
        return
      }
      adding.value = true
      try {
        await api('POST', '/api/shows', {
          show_pattern: newPattern.value.trim(),
          dest_folder: newFolder.value.trim(),
          season_template: newTemplate.value.trim() || 'Season {season}',
          delete_after_import: newDeleteAfter.value === true,
          ad_removal: newAdRemoval.value,
        })
        newPattern.value = ''
        newFolder.value = ''
        newTemplate.value = 'Season {season}'
        newDeleteAfter.value = false
        newAdRemoval.value = 'off'
        suggestion.value = ''
        await refresh()
        setFormStatus('Added.')
      } catch (err) {
        setFormStatus(`Error: ${err.message}`, 'err', 5000)
      } finally {
        adding.value = false
      }
    }

    const loadTvhShows = async () => {
      loadingShows.value = true
      setFormStatus('Listing TVHeadend recordings…', 'busy', 0)
      try {
        const r = await api('POST', '/api/tvh-shows')
        tvhShows.value = r.shows
        setFormStatus(`Found ${r.shows.length} title${r.shows.length === 1 ? '' : 's'}.`, 'ok', 5000)
      } catch (err) {
        setFormStatus(`Error: ${err.message}`, 'err', 5000)
      } finally {
        loadingShows.value = false
      }
    }

    const syncOne = async (folder) => {
      syncingId.value = folder.id
      try {
        const r = await api('POST', '/api/sync', { show_id: folder.id })
        if (r.alreadyRunning) flash({ msg: 'A sync is already running.', kind: 'info' })
        else flashUntilSyncDone({ msg: `Started sync #${r.syncId} for "${folder.show_pattern}".` })
        await loadSyncStatus()
        ensureSyncPolling()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      } finally {
        syncingId.value = null
      }
    }

    return {
      series, titleMatches, loaded, error, stale, editingKey, busyKey,
      tvhShows, folders, mediaRoot, mediaRootPrefix, adRemovalEnabled, importUnmatched, FOLDER_HINT,
      assigning, assignDest, assignPath, assignStatusText, assignStatusKind, openAssign, closeAssign, assignFolder,
      newPattern, newFolder, newTemplate, newDeleteAfter, newAdRemoval,
      suggestion, suggestionIsNew, adding, loadingShows, syncingId,
      channelsOf, nextAiringLabel, edit, onSaved, onDeleted, pauseSeries, stopSeries,
      add, loadTvhShows, syncOne,
      flashText, flashKind, formStatusText, formStatusKind,
    }
  },
}

const SyncsView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title" title="Freetvarr keeps the latest 500 syncs and deletes older ones.">SYNCS · <template v-if="filter !== 'all'">{{ filterLabel }} · </template>{{ rangeLabel }} of {{ total }}</span>
            <info-button title="SYNCS" doc="guide/syncs">
              <p>Every sync Freetvarr has run, newest first: when it started, and what it imported, failed, or removed.</p>
              <p>Syncs run on the schedule in Settings, or when you press <strong>SYNC NOW</strong>. Only one runs at a time.</p>
              <p>Filter the list by activity. The list shows 50 syncs per page. Freetvarr keeps the latest 500 syncs.</p>
            </info-button>
          </span>
          <div class="flex items-center gap-3">
            <span class="hidden md:inline text-xs text-ink-dim"><template v-if="scheduleFrequency">Syncs run {{ scheduleFrequency }}.</template><template v-else-if="syncStatus.cron">Syncs run on the schedule <code>{{ syncStatus.cron }}</code>.</template></span>
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
          </div>
        </header>
        <div class="panel-body space-y-4">
          <p v-if="scheduleFrequency || syncStatus.cron" class="md:hidden text-xs text-ink-dim"><template v-if="scheduleFrequency">Syncs run {{ scheduleFrequency }}.</template><template v-else-if="syncStatus.cron">Syncs run on the schedule <code>{{ syncStatus.cron }}</code>.</template></p>
          <div class="flex flex-wrap gap-3">
            <button type="button" class="btn btn-primary" @click="syncNow" :disabled="starting || !!syncStatus.activeSyncId">
              <template v-if="syncStatus.activeSyncId"><span class="spinner"></span>SYNC RUNNING…</template>
              <template v-else-if="starting">STARTING…</template>
              <template v-else><play-icon /> SYNC NOW</template>
            </button>
            <button type="button" class="btn" @click="manualRefresh"><refresh-icon /> REFRESH</button>
            <button type="button" class="btn btn-danger" @click="clearAll" :disabled="!total"><cross-icon /> CLEAR HISTORY</button>
          </div>

          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">ACTIVITY</span>
            <div class="chip-row md:flex-wrap">
              <button v-for="opt in filterOptions" :key="opt.key"
                type="button"
                :class="['btn', 'btn-sm', filter === opt.key ? 'btn-on' : '']"
                @click="setFilter(opt.key)">{{ opt.label }}</button>
            </div>
          </div>

          <table v-if="syncs.length" class="deck-table hidden md:table">
            <thead><tr>
              <th>Started</th><th>Finished</th><th>Status</th><th>Summary</th><th></th>
            </tr></thead>
            <tbody>
              <tr v-for="s in syncs" :key="s.id" :class="{ active: s.id === syncStatus.activeSyncId }">
                <td class="font-mono">{{ fmtTime(s.started_at) }}</td>
                <td class="font-mono">{{ fmtTime(s.finished_at) }}</td>
                <td><span :class="['pill', s.status]">{{ s.status }}</span></td>
                <td><summary-line :summary="s.summary"/></td>
                <td>
                  <button type="button" class="btn btn-sm btn-icon btn-danger"
                    :disabled="s.id === syncStatus.activeSyncId"
                    @click="removeSync(s)"
                    title="Delete this sync from history.">
                    <trash-icon />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="syncs.length" class="md:hidden space-y-3">
            <article v-for="s in syncs" :key="s.id"
              :class="['deck-card', 'space-y-2', { active: s.id === syncStatus.activeSyncId }]">
              <div class="flex items-start justify-between gap-3">
                <span :class="['pill', s.status]">{{ s.status }}</span>
                <button type="button" class="btn btn-sm btn-icon btn-danger"
                  :disabled="s.id === syncStatus.activeSyncId"
                  @click="removeSync(s)">
                  <trash-icon />
                </button>
              </div>
              <p class="deck-card-meta">
                {{ fmtTime(s.started_at) }}<template v-if="s.finished_at"> to {{ fmtTime(s.finished_at) }}</template>
              </p>
              <summary-line :summary="s.summary"/>
            </article>
          </div>
          <p v-else-if="total === 0" class="text-ink-dim text-sm">
            {{ filter === 'all' ? 'No syncs yet.' : 'No syncs match the current filter.' }}
          </p>
          <div v-if="total > pageSize" class="flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-ink-dim pt-1">
            <span>Page {{ page }} of {{ totalPages }} · {{ total }} total</span>
            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-sm" :disabled="page <= 1" @click="page = page - 1"><arrow-left-icon /> PREV</button>
              <button type="button" class="btn btn-sm" :disabled="page >= totalPages" @click="page = page + 1">NEXT <arrow-right-icon /></button>
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash, flashUntilSyncDone } = useFlash()
    const syncs = ref([])
    const starting = ref(false)
    const filter = ref('all')
    const total = ref(0)
    const page = ref(1)
    const pageSize = ref(50)
    const scheduleFrequency = computed(() => describeSyncFrequency(syncStatus.value.cron))
    const filterOptions = [
      { key: 'all',       label: 'ALL' },
      { key: 'manual',    label: 'MANUAL' },
      { key: 'cron',      label: 'CRON' },
      { key: 'imports',   label: 'IMPORTS' },
      { key: 'fails',     label: 'FAILS' },
      { key: 'deletes',   label: 'REMOVALS' },
      { key: 'empty',     label: 'EMPTY' },
    ]

    const filterLabel = computed(() => filterOptions.find((opt) => opt.key === filter.value)?.label ?? '')

    const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

    const rangeLabel = computed(() => {
      if (total.value === 0) return '0'
      const start = (page.value - 1) * pageSize.value + 1
      const end = Math.min(total.value, page.value * pageSize.value)
      return `${start}–${end}`
    })

    const refresh = async () => {
      const params = new URLSearchParams({
        page: String(page.value),
        pageSize: String(pageSize.value),
      })
      if (filter.value !== 'all') params.set('filter', filter.value)
      const r = await api('GET', `/api/syncs?${params}`)
      syncs.value = r.syncs
      total.value = r.total
      if (page.value > 1 && r.syncs.length === 0) page.value = 1
    }

    const manualRefresh = async () => {
      try {
        await refresh()
        const label = filter.value === 'all' ? 'sync' : `${filterLabel.value.toLowerCase()} sync`
        flash({ msg: `Refreshed ${total.value} ${label}${total.value === 1 ? '' : 's'}.` })
      } catch (err) {
        flash({ msg: `Refresh failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const setFilter = (v) => {
      filter.value = v
      page.value = 1
    }

    const syncNow = async () => {
      starting.value = true
      try {
        const r = await api('POST', '/api/sync')
        if (r.alreadyRunning) flash({ msg: 'A sync is already running.', kind: 'info' })
        else flashUntilSyncDone({ msg: `Started sync #${r.syncId}.` })
        await loadSyncStatus()
        ensureSyncPolling()
        await refresh()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      } finally {
        starting.value = false
      }
    }

    const removeSync = async (s) => {
      if (!confirm(`Delete sync #${s.id}?`)) return
      try {
        await api('DELETE', `/api/syncs/${s.id}`)
        await refresh()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      }
    }

    const clearAll = async () => {
      const suffix = syncStatus.value.activeSyncId ? ' (except the active sync)' : ''
      if (!confirm(`Delete all sync history${suffix}?`)) return
      try {
        const r = await api('DELETE', '/api/syncs')
        flash({ msg: `Deleted ${r.deleted} sync${r.deleted === 1 ? '' : 's'}.` })
        await refresh()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      }
    }

    let pollTimer = null
    onMounted(() => {
      refresh()
      pollTimer = setInterval(refresh, SYNCS_POLL_MS)
    })
    onUnmounted(() => {
      if (pollTimer) clearInterval(pollTimer)
    })
    watch([page, filter], refresh)
    const stopWatch = watch(() => syncStatus.value.activeSyncId, refresh)
    onUnmounted(stopWatch)

    return {
      syncs, syncStatus, scheduleFrequency, starting,
      filter, filterOptions, filterLabel, setFilter,
      total, page, pageSize, totalPages, rangeLabel,
      syncNow, refresh, manualRefresh, removeSync, clearAll,
      fmtTime,
      flashText, flashKind,
    }
  },
}

const RecordingsView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">RECORDINGS · {{ rangeLabel }} of {{ total }}</span>
            <info-button title="RECORDINGS" doc="guide/recordings">
              <p>Every recording TVHeadend has finished, and what Freetvarr did with it: <strong>imported</strong>, <strong>partial</strong>, <strong>skipped</strong>, <strong>failed</strong>, or <strong>not imported</strong>. The next sync tries a partial import again.</p>
              <p>Series episodes go into their series folder. A single recording goes to the one-off folder, and a film to the movies folder. Press <strong>IMPORT</strong> on a recording that is not imported to add it to the library.</p>
              <p><strong>NOT IN TVHEADEND</strong> means TVHeadend has deleted its copy. The episode is still in your library, so you can play it, scan it for ads, or cut it again.</p>
              <p>A copy, an ad scan, or a cut shows a progress bar while it runs. You can scan or cut an imported recording again.</p>
            </info-button>
          </span>
          <div class="header-actions flex flex-wrap items-center justify-end gap-3">
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
            <header-button v-if="undoIds.length" label="Undo" @click="undoClear" :disabled="restoring"
              title="Puts the cleared rows back in this list."><arrow-left-icon /></header-button>
            <header-button :label="clearing ? 'Clearing…' : 'Clear from list'" @click="clearNotInTvh"
              :disabled="clearing || clearable === 0"
              title="Removes rows for recordings no longer in TVHeadend from this list. Files stay in your library."><cross-icon /></header-button>
            <header-button label="Refresh" @click="manualRefresh"><refresh-icon /></header-button>
          </div>
        </header>
        <div class="panel-body space-y-4">
          <template v-if="narrow">
            <div class="view-controls view-controls-sticky">
              <select :value="showFilter" @change="setShow($event.target.value)" class="field-input" aria-label="Show">
                <option value="all">Any show</option>
                <option v-for="s in shows" :key="s.id" :value="s.id">{{ s.show_pattern }}</option>
              </select>
              <filter-sheet title="FILTER RECORDINGS" :count="activeFilters.length" @clear="clearSheetFilters">
                <div v-for="g in chipGroups" :key="g.key" class="filter-group" role="group" :aria-label="g.label">
                  <span class="field-label">{{ g.label }}</span>
                  <div class="filter-chips">
                    <button v-for="opt in g.options" :key="opt.key" type="button"
                      :class="['btn', 'btn-sm', g.value === opt.key ? 'btn-on' : '']" :aria-pressed="String(g.value === opt.key)"
                      @click="g.set(opt.key)">{{ opt.label }}</button>
                  </div>
                </div>
              </filter-sheet>
            </div>
            <div v-if="activeFilters.length" class="active-filters">
              <button v-for="f in activeFilters" :key="f.key" type="button" class="btn btn-sm btn-on"
                :aria-label="'Remove filter: ' + f.label" @click="f.clear">{{ f.label }} <cross-icon /></button>
            </div>
          </template>
          <div v-else class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
            <template v-for="g in chipGroups" :key="g.key">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">{{ g.label }}</span>
                <div class="chip-row md:flex-wrap">
                  <button v-for="opt in g.options" :key="opt.key" type="button"
                    :class="['btn', 'btn-sm', g.value === opt.key ? 'btn-on' : '']" :aria-pressed="String(g.value === opt.key)"
                    @click="g.set(opt.key)">{{ opt.label }}</button>
                </div>
              </div>
              <div v-if="g.key === 'status'" class="flex items-center gap-2">
                <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">SHOW</span>
                <select :value="showFilter" @change="setShow($event.target.value)" aria-label="Show"
                  class="field-input" style="width: auto; min-width: 9rem; padding-top: 0.3rem; padding-bottom: 0.3rem;">
                  <option value="all">Any</option>
                  <option v-for="s in shows" :key="s.id" :value="s.id">{{ s.show_pattern }}</option>
                </select>
              </div>
            </template>
          </div>
          <table v-if="recordings.length" class="deck-table recordings-table hidden lg:table">
            <thead><tr>
              <th class="sortable" @click="toggleSort('title')">Recording<sort-arrow :dir="sortDirFor('title')" /></th>
              <th class="sortable" @click="toggleSort('show_pattern')">Show<sort-arrow :dir="sortDirFor('show_pattern')" /></th>
              <th>S/E</th>
              <th class="sortable" @click="toggleSort('size')">Size<sort-arrow :dir="sortDirFor('size')" /></th>
              <th class="sortable" @click="toggleSort('status')">Status<sort-arrow :dir="sortDirFor('status')" /></th>
              <th title="Ad break detection/removal status. Hover a pill for break count + minutes.">Ads</th>
              <th class="sortable" @click="toggleSort('imported_at')">Imported<sort-arrow :dir="sortDirFor('imported_at')" /></th>
              <th></th>
            </tr></thead>
            <tbody>
              <tr v-for="r in recordings" :key="r.recording_id"
                :class="{ 'not-in-tvh': r.deleted_from_tvh_at }">
                <td>
                  <div class="recording-cell">
                    <programme-image :source="imageUrl(r)" variant="thumb" :channel-id="r.channel_id" :has-logo="Boolean(r.channel_id)" />
                    <div class="recording-cell-text">
                      <span class="font-mono">{{ r.title }}</span>
                      <span v-if="r.episode_title" class="recording-cell-episode">{{ r.episode_title }}</span>
                      <span v-if="r.channel_name || r.aired_at" class="recording-cell-channel">
                        <channel-logo v-if="r.channel_id" :channel-id="r.channel_id" has-logo />
                        {{ [r.channel_name, r.aired_at ? fmtTime(r.aired_at) : ''].filter(Boolean).join(' · ') }}
                      </span>
                      <span v-if="resumeLabel(r)" class="recording-cell-resume">{{ resumeLabel(r) }}</span>
                    </div>
                  </div>
                </td>
                <td class="font-mono">{{ showLabel(r) }}</td>
                <td class="font-mono">{{ se(r) }}</td>
                <td class="font-mono whitespace-nowrap">{{ fmtBytes(r.size) }}</td>
                <td>
                  <span class="pill-group stacked">
                    <span :class="['pill', r.status]">{{ statusLabel(r.status) }}</span>
                    <span v-if="r.deleted_from_tvh_at" class="pill not-in-tvh-chip" :title="notInTvhTitle(r)">NOT IN TVHEADEND</span>
                  </span>
                  <span v-if="r.error" class="block text-xs font-mono text-signal-orange-hi mt-1">{{ r.error }}</span>
                  <progress-block v-if="progressPhase(r) === 'importing'"
                    :progress="r.progress" :caption="progressCaption(r)" :bar="true"/>
                </td>
                <td>
                  <span v-if="r.ad_status" :class="['pill', r.ad_status]" :title="adTooltip(r)">{{ adLabel(r.ad_status) }}</span>
                  <span v-else-if="!progressPhase(r)" class="text-ink-mute">none</span>
                  <progress-block v-if="isAdProgress(r)"
                    :progress="r.progress" :caption="progressCaption(r)" :bar="hasBar(r)"/>
                </td>
                <td class="font-mono">{{ fmtTime(r.imported_at) }}</td>
                <td>
                  <div class="rec-actions flex items-center gap-2">
                  <button v-if="r.playable" type="button" class="btn btn-sm btn-icon btn-watch"
                    @click="playRecording(r)" :title="playTitle(r)" :aria-label="playTitle(r)">
                    <play-icon />
                  </button>
                  <button v-if="canImport(r)" type="button" class="btn btn-sm"
                    @click="importRecording(r)" :disabled="importingId === r.recording_id"
                    title="Add this recording to the library at the next sync.">
                    {{ importingId === r.recording_id ? '…' : 'IMPORT' }}
                  </button>
                  <button v-if="canAdScan(r)" type="button" class="btn btn-sm btn-icon"
                    @click="adScan(r)" :disabled="adScanningId === r.recording_id || isAdScanBlocked(r)"
                    :title="adScanTitle(r)" :aria-label="adScanTitle(r)">
                    <span v-if="adScanningId === r.recording_id">…</span>
                    <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="4" cy="4.5" r="1.75"/>
                      <circle cx="4" cy="11.5" r="1.75"/>
                      <path d="M5.5 5.75 13 12M5.5 10.25 13 4"/>
                    </svg>
                  </button>
                  <button v-if="canDelete(r)" type="button" class="btn btn-sm btn-icon btn-danger"
                    @click="deleteFromTvh(r)" :disabled="deletingId === r.recording_id"
                    title="Remove this recording from TVHeadend. TVHeadend will delete the file and keep the episode in its history. You cannot undo this.">
                    <span v-if="deletingId === r.recording_id">…</span>
                    <trash-icon v-else />
                  </button>
                  <button v-else-if="canRemove(r)" type="button" class="btn btn-sm btn-icon btn-danger"
                    @click="removeRecording(r)" :disabled="removingId === r.recording_id"
                    :title="removeTitle(r)">
                    <span v-if="removingId === r.recording_id">…</span>
                    <trash-icon v-else />
                  </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="recordings.length" class="lg:hidden space-y-3">
            <article v-for="r in recordings" :key="r.recording_id"
              :class="['deck-card', 'space-y-2', { 'not-in-tvh': r.deleted_from_tvh_at }]">
              <div class="flex items-start justify-between gap-3">
                <div class="recording-cell">
                  <programme-image :source="imageUrl(r)" variant="thumb" :channel-id="r.channel_id" :has-logo="Boolean(r.channel_id)" />
                  <div class="recording-cell-text">
                    <span class="deck-card-title">{{ r.title }}</span>
                    <span v-if="r.episode_title" class="recording-cell-episode">{{ r.episode_title }}</span>
                    <span v-if="r.channel_name || r.aired_at" class="recording-cell-channel">
                      <channel-logo v-if="r.channel_id" :channel-id="r.channel_id" has-logo />
                      {{ [r.channel_name, r.aired_at ? fmtTime(r.aired_at) : ''].filter(Boolean).join(' · ') }}
                    </span>
                    <span v-if="resumeLabel(r)" class="recording-cell-resume">{{ resumeLabel(r) }}</span>
                  </div>
                </div>
                <span :class="['pill', r.status]">{{ statusLabel(r.status) }}</span>
              </div>
              <p class="deck-card-meta">
                {{ showLabel(r) }}<template v-if="se(r)"> · {{ se(r) }}</template><template v-if="fmtBytes(r.size)"> · {{ fmtBytes(r.size) }}</template><template v-if="r.imported_at"> · imported {{ fmtTime(r.imported_at) }}</template>
              </p>
              <p v-if="r.error" class="text-xs font-mono text-signal-orange-hi">{{ r.error }}</p>
              <div v-if="r.deleted_from_tvh_at || r.ad_status" class="pill-group">
                <span v-if="r.deleted_from_tvh_at" class="pill not-in-tvh-chip" :title="notInTvhTitle(r)">NOT IN TVHEADEND</span>
                <span v-if="r.ad_status" :class="['pill', r.ad_status]" :title="adTooltip(r)">{{ adLabel(r.ad_status) }}</span>
              </div>
              <p v-if="r.deleted_from_tvh_at" class="deck-card-meta">removed {{ fmtTime(r.deleted_from_tvh_at) }}</p>
              <p v-if="r.ad_status && adTooltip(r)" class="deck-card-meta">{{ adTooltip(r) }}</p>
              <progress-block v-if="progressPhase(r) === 'importing'"
                :progress="r.progress" :caption="progressCaption(r)" :bar="true"/>
              <progress-block v-if="isAdProgress(r)"
                :progress="r.progress" :caption="progressCaption(r)" :bar="hasBar(r)"/>
              <div v-if="r.playable || canImport(r) || canAdScan(r) || canDelete(r) || canRemove(r)" class="rec-actions flex items-center justify-end gap-2 pt-1">
                <button v-if="r.playable" type="button" class="btn btn-sm btn-icon btn-watch"
                  @click="playRecording(r)" :title="playTitle(r)" :aria-label="playTitle(r)">
                  <play-icon />
                </button>
                <button v-if="canImport(r)" type="button" class="btn btn-sm"
                  @click="importRecording(r)" :disabled="importingId === r.recording_id">
                  {{ importingId === r.recording_id ? '…' : 'IMPORT' }}
                </button>
                <button v-if="canAdScan(r)" type="button" class="btn btn-sm btn-icon"
                  @click="adScan(r)" :disabled="adScanningId === r.recording_id || isAdScanBlocked(r)"
                  :title="adScanTitle(r)" :aria-label="adScanTitle(r)">
                  <span v-if="adScanningId === r.recording_id">…</span>
                  <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="4" cy="4.5" r="1.75"/>
                    <circle cx="4" cy="11.5" r="1.75"/>
                    <path d="M5.5 5.75 13 12M5.5 10.25 13 4"/>
                  </svg>
                </button>
                <button v-if="canDelete(r)" type="button" class="btn btn-sm btn-icon btn-danger"
                  @click="deleteFromTvh(r)" :disabled="deletingId === r.recording_id">
                  <span v-if="deletingId === r.recording_id">…</span>
                  <trash-icon v-else />
                </button>
                <button v-else-if="canRemove(r)" type="button" class="btn btn-sm btn-icon btn-danger"
                  @click="removeRecording(r)" :disabled="removingId === r.recording_id" :title="removeTitle(r)">
                  <span v-if="removingId === r.recording_id">…</span>
                  <trash-icon v-else />
                </button>
              </div>
            </article>
          </div>
          <p v-else-if="total === 0" class="text-ink-dim text-sm">
            {{ hasFiltersApplied ? 'No recordings match the current filters.' : 'No recordings yet.' }}
          </p>
          <div v-if="total > pageSize" class="flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-ink-dim pt-1">
            <span>Page {{ page }} of {{ totalPages }} · {{ total }} total</span>
            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-sm" :disabled="page <= 1" @click="page = page - 1"><arrow-left-icon /> PREV</button>
              <button type="button" class="btn btn-sm" :disabled="page >= totalPages" @click="page = page + 1">NEXT <arrow-right-icon /></button>
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash } = useFlash()
    const recordings = ref([])
    const shows = ref([])
    const deletingId = ref(null)
    const removingId = ref(null)
    const importingId = ref(null)
    const clearing = ref(false)
    const adRemovalEnabled = ref(false)
    const adScanningId = ref(null)
    const total = ref(0)
    const page = ref(1)
    const pageSize = ref(50)
    const sortCol = ref(null)
    const sortDir = ref(null)
    const statusFilter = ref('all')
    const showFilter = ref('all')
    const sinceFilter = ref('all')
    const deletedFilter = ref('all')
    const clearable = ref(0)
    const undoIds = ref([])
    const restoring = ref(false)

    const statusOptions = ['all', 'done', 'not_imported', 'partial', 'failed', 'skipped', 'importing']
    const sinceOptions = [
      { key: 'all', label: 'ALL' },
      { key: '1h',  label: '1H'  },
      { key: '24h', label: '24H' },
      { key: '7d',  label: '7D'  },
      { key: '30d', label: '30D' },
      { key: '90d', label: '90D' },
    ]
    const deletedOptions = [
      { key: 'all',     label: 'ALL'              },
      { key: 'on_tvh',  label: 'IN TVHEADEND'     },
      { key: 'deleted', label: 'NOT IN TVHEADEND' },
    ]

    const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

    const rangeLabel = computed(() => {
      if (total.value === 0) return '0'
      const start = (page.value - 1) * pageSize.value + 1
      const end = Math.min(total.value, page.value * pageSize.value)
      return `${start}–${end}`
    })

    const hasFiltersApplied = computed(() =>
      statusFilter.value !== 'all'
      || showFilter.value !== 'all'
      || sinceFilter.value !== 'all'
      || deletedFilter.value !== 'all',
    )

    const manualRefresh = async () => {
      try {
        await refresh()
        flash({ msg: `Refreshed ${total.value} recording${total.value === 1 ? '' : 's'}.` })
      } catch (err) {
        flash({ msg: `Refresh failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const refresh = async () => {
      const params = new URLSearchParams({
        page: String(page.value),
        pageSize: String(pageSize.value),
      })
      if (sortCol.value) params.set('sort', sortCol.value)
      if (sortDir.value) params.set('dir', sortDir.value)
      if (statusFilter.value !== 'all') params.set('status', statusFilter.value)
      if (showFilter.value !== 'all') params.set('show_id', String(showFilter.value))
      if (sinceFilter.value !== 'all') params.set('since', sinceFilter.value)
      if (deletedFilter.value !== 'all') params.set('deleted', deletedFilter.value)
      const r = await api('GET', `/api/recordings?${params}`)
      recordings.value = r.recordings
      total.value = r.total
      clearable.value = r.clearable ?? 0
      if (page.value > 1 && r.recordings.length === 0) page.value = 1
    }

    const loadShows = async () => {
      const r = await api('GET', '/api/shows').catch(() => ({ shows: [] }))
      shows.value = r.shows || []
    }

    const loadAdRemovalSetting = async () => {
      const s = await api('GET', '/api/settings').catch(() => ({}))
      adRemovalEnabled.value = Boolean(s.ad_removal_enabled)
    }

    const setStatus = (v) => { statusFilter.value = v; page.value = 1 }
    const setShow = (v) => { showFilter.value = v; page.value = 1 }
    const setSince = (v) => { sinceFilter.value = v; page.value = 1 }
    const setDeleted = (v) => { deletedFilter.value = v; page.value = 1 }

    const narrow = useMediaQuery(EPG_NARROW_QUERY)

    const chipGroups = computed(() => [
      {
        key: 'status',
        label: 'STATUS',
        value: statusFilter.value,
        set: setStatus,
        options: statusOptions.map((opt) => ({ key: opt, label: statusLabel(opt).toUpperCase() })),
      },
      { key: 'since', label: 'WHEN', value: sinceFilter.value, set: setSince, options: sinceOptions },
      { key: 'deleted', label: 'TVHEADEND', value: deletedFilter.value, set: setDeleted, options: deletedOptions },
    ])

    const activeFilters = computed(() => chipGroups.value
      .filter((g) => g.value !== 'all')
      .map((g) => ({
        key: g.key,
        label: g.options.find((opt) => opt.key === g.value)?.label ?? g.value,
        clear: () => g.set('all'),
      })))

    const clearSheetFilters = () => {
      statusFilter.value = 'all'
      sinceFilter.value = 'all'
      deletedFilter.value = 'all'
      page.value = 1
    }

    const toggleSort = (col) => {
      if (sortCol.value !== col) {
        sortCol.value = col
        sortDir.value = 'desc'
      } else if (sortDir.value === 'desc') {
        sortDir.value = 'asc'
      } else {
        sortCol.value = null
        sortDir.value = null
      }
      page.value = 1
    }

    const sortDirFor = (col) => (sortCol.value === col ? sortDir.value : null)

    const canDelete = (r) => r.status === 'done' && !r.deleted_from_tvh_at
    const canRemove = (r) => Boolean(r.deleted_from_tvh_at)
      || UNIMPORTED_STATUSES.includes(r.status)
    const removeTitle = (r) => (r.deleted_from_tvh_at
      ? 'Remove this row from the list. The file will stay in your library.'
      : "Remove this recording from Freetvarr's history."
        + ' If it is still in TVHeadend, the next sync will import it again.')
    const notInTvhTitle = (r) => `TVHeadend deleted its copy ${fmtTime(r.deleted_from_tvh_at)}.`
      + ' The episode is still in your library.'
    const canAdScan = (r) => canAdScanRecording({ adRemovalEnabled: adRemovalEnabled.value, recording: r })
    const canImport = (r) => r.status === 'not_imported' && !r.deleted_from_tvh_at
    const statusLabel = (status) => (status === 'done' ? 'imported' : status.replace(/_/g, ' '))
    const showLabel = (r) => r.show_pattern || (r.show_id == null ? 'One-off' : 'none')
    const imageUrl = (r) => (r.image_path ? `/api/recordings/${encodeURIComponent(r.recording_id)}/image` : null)

    const resumeLabel = (r) => {
      const saved = r.playback_position_s
      if (!r.playable || !saved) return ''
      if (r.duration_s && saved >= r.duration_s - RESUME_END_MARGIN_S) return 'Watched'
      return `Resume at ${fmtPlayTime(saved)}`
    }

    const playTitle = (r) => (resumeLabel(r).startsWith('Resume') ? `Play (${resumeLabel(r).toLowerCase()})` : 'Play')

    const importRecording = async (r) => {
      importingId.value = r.recording_id
      try {
        await api('POST', `/api/recordings/${encodeURIComponent(r.recording_id)}/library`, { choice: 'include' })
        flash({ msg: `Importing "${r.title}".` })
        await refresh()
      } catch (err) {
        flash({ msg: `Import failed: ${err.message}`, kind: 'err', ms: 6000 })
      } finally {
        importingId.value = null
      }
    }

    const adLabel = (status) => status.replace(/_/g, ' ')

    const progressPhase = (r) => r.progress?.phase || null

    const isAdProgress = (r) => {
      const phase = progressPhase(r)
      return phase === 'scanning' || phase === 'cutting' || phase === 'verifying'
    }

    const hasBar = (r) => {
      const phase = progressPhase(r)
      return phase === 'importing' || phase === 'scanning'
    }

    const progressCaption = (r) => {
      const p = r.progress
      if (!p) return ''
      if (p.phase === 'importing') {
        const bits = [`${p.percent}%`]
        if (p.etaLabel) bits.push(p.etaLabel)
        if (p.detail) bits.push(p.detail)
        return bits.join(' · ')
      }
      if (p.phase === 'scanning') {
        if (p.percent == null) return p.detail || 'scanning'
        return p.etaLabel ? `${p.percent}% · ~${p.etaLabel} left` : `${p.percent}%`
      }
      return p.detail || p.phase
    }

    const adTooltip = (r) => {
      if (!r.ad_breaks_json) return ''
      try {
        const breaks = JSON.parse(r.ad_breaks_json)
        const secs = breaks.reduce((sum, b) => sum + (b.end - b.start), 0)
        return `${breaks.length} break${breaks.length === 1 ? '' : 's'} · ${formatMinutes(Number((secs / 60).toFixed(1)))} of ads`
      } catch {
        return ''
      }
    }

    const adScan = async (r) => {
      adScanningId.value = r.recording_id
      try {
        await api('POST', `/api/recordings/${encodeURIComponent(r.recording_id)}/ad-scan`)
        flash({ msg: `Ad scan started for "${r.title}". This can take minutes.` })
        await refresh()
      } catch (err) {
        flash({ msg: `Ad scan failed: ${err.message}`, kind: 'err', ms: 6000 })
      } finally {
        adScanningId.value = null
      }
    }

    const deleteFromTvh = async (r) => {
      const prompt = `Remove "${r.title}" from TVHeadend?\n\n`
        + 'TVHeadend will delete the recording file and keep the episode in its history,'
        + ' so it will not record it again. You cannot undo this.'
      if (!confirm(prompt)) return
      deletingId.value = r.recording_id
      try {
        const url = `/api/recordings/${encodeURIComponent(r.recording_id)}/delete-from-tvh`
        const result = await api('POST', url)
        if (result.ok) {
          flash({ msg: `Removed "${r.title}" from TVHeadend.` })
          await refresh()
        } else {
          flash({
            msg: `TVHeadend remove failed: ${result.error} (stage: ${result.stage || '?'})`,
            kind: 'err',
            ms: 8000,
          })
        }
      } catch (err) {
        flash({ msg: `TVHeadend remove failed: ${err.message}`, kind: 'err', ms: 8000 })
      } finally {
        deletingId.value = null
      }
    }

    const removeRecording = async (r) => {
      const prompt = r.deleted_from_tvh_at
        ? `Remove "${r.title}" from this list?\n\nThe file will stay in your library.`
        : `Remove "${r.title}" from Freetvarr's history?`
          + '\n\nIf it is still in TVHeadend, the next sync will import it again.'
      if (!confirm(prompt)) return
      removingId.value = r.recording_id
      try {
        await api('DELETE', `/api/recordings/${encodeURIComponent(r.recording_id)}`)
        flash({ msg: `Removed "${r.title}".` })
        await refresh()
      } catch (err) {
        flash({ msg: `Remove failed: ${err.message}`, kind: 'err', ms: 6000 })
      } finally {
        removingId.value = null
      }
    }

    const clearNotInTvh = async () => {
      if (!confirm(clearListPrompt(clearable.value))) return
      clearing.value = true
      try {
        const r = await api('DELETE', '/api/recordings?deleted=true')
        flash({ msg: clearedListMessage(r.deleted), ms: UNDO_WINDOW_MS })
        offerUndo(r.ids)
        await refresh()
      } catch (err) {
        flash({ msg: `Clear failed: ${err.message}`, kind: 'err', ms: 6000 })
      } finally {
        clearing.value = false
      }
    }

    let undoTimer = null
    const offerUndo = (ids) => {
      clearTimeout(undoTimer)
      undoIds.value = ids
      undoTimer = setTimeout(() => (undoIds.value = []), UNDO_WINDOW_MS)
    }

    const undoClear = async () => {
      restoring.value = true
      try {
        const r = await api('POST', '/api/recordings/restore', { ids: undoIds.value })
        offerUndo([])
        flash({ msg: restoredListMessage(r.restored) })
        await refresh()
      } catch (err) {
        flash({ msg: `Undo failed: ${err.message}`, kind: 'err', ms: 6000 })
      } finally {
        restoring.value = false
      }
    }

    let pollTimer = null
    const hasActiveProgress = () => recordings.value.some((r) => r.progress)
    const scheduleNextPoll = () => {
      const delay = hasActiveProgress() ? RECORDINGS_ACTIVE_POLL_MS : RECORDINGS_POLL_MS
      pollTimer = setTimeout(pollTick, delay)
    }
    const pollTick = async () => {
      await refresh().catch(() => {})
      scheduleNextPoll()
    }
    onMounted(() => {
      loadShows()
      loadAdRemovalSetting()
      refresh().catch(() => {}).finally(scheduleNextPoll)
    })
    onUnmounted(() => {
      if (pollTimer) clearTimeout(pollTimer)
    })

    watch(
      [page, sortCol, sortDir, statusFilter, showFilter, sinceFilter, deletedFilter],
      refresh,
    )

    const stopSyncWatch = watch(() => syncStatus.value.activeSyncId, refresh)
    onUnmounted(stopSyncWatch)

    return {
      recordings, shows, total, page, pageSize, totalPages, rangeLabel,
      sortCol, sortDir, statusFilter, showFilter, sinceFilter, deletedFilter,
      statusOptions, sinceOptions, deletedOptions, hasFiltersApplied,
      deletingId, removingId, importingId, clearing, adRemovalEnabled, adScanningId,
      canImport, importRecording, statusLabel, showLabel, imageUrl, resumeLabel, playTitle, playRecording,
      refresh, manualRefresh, canDelete,
      canAdScan, isAdScanBlocked, adScanTitle, adLabel, adTooltip, adScan,
      progressPhase, isAdProgress, hasBar, progressCaption,
      deleteFromTvh, removeRecording, canRemove, removeTitle, notInTvhTitle, clearNotInTvh,
      clearable, undoIds, restoring, undoClear,
      setStatus, setShow, setSince, setDeleted, toggleSort, sortDirFor,
      narrow, chipGroups, activeFilters, clearSheetFilters,
      se: seasonEpisodeLabel, fmtBytes, fmtTime,
      flashText, flashKind,
    }
  },
}

const SETTINGS_SECTIONS = [
  { id: 'tvheadend', label: 'TVHeadend' },
  { id: 'storage', label: 'Storage' },
  { id: 'plex', label: 'Plex' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'ad-removal', label: 'Ad removal' },
  { id: 'tv-apps', label: 'TV apps' },
  { id: 'help', label: 'Help' },
  { id: 'danger-zone', label: 'Reset' },
]
const SETTINGS_SECTION_GAP_PX = 24
const DEFAULT_PLEX_PREFS_PATH = '/plex/Library/Application Support/Plex Media Server/Preferences.xml'

const isCustomPlexPrefsPath = (path) => Boolean(path) && path !== DEFAULT_PLEX_PREFS_PATH

const isScrolledToBottom = () =>
  window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4

const sectionTop = (id) => document.getElementById(`section-${id}`)?.getBoundingClientRect().top

const sectionInView = (id) => {
  const top = sectionTop(id)
  return top !== undefined && top < window.innerHeight
}

const sectionOnScreen = (navBottom) => {
  const line = navBottom + SETTINGS_SECTION_GAP_PX
  const lastId = SETTINGS_SECTIONS.at(-1).id
  if (isScrolledToBottom()) {
    const routed = SETTINGS_SECTIONS.find(({ id }) => id === routeSectionId())
    return routed && sectionInView(routed.id) ? routed.id : lastId
  }
  return SETTINGS_SECTIONS.reduce((current, { id }) => {
    const top = sectionTop(id)
    return top !== undefined && top <= line ? id : current
  }, SETTINGS_SECTIONS[0].id)
}

const revealActiveLink = (nav) => {
  const link = nav?.querySelector('[data-active="true"]')
  if (!link) return
  const start = link.offsetLeft - SETTINGS_SECTION_GAP_PX
  const end = link.offsetLeft + link.offsetWidth + SETTINGS_SECTION_GAP_PX
  if (start < nav.scrollLeft) nav.scrollLeft = start
  else if (end > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = end - nav.clientWidth
}

const useSettingsSections = () => {
  const sectionNav = ref(null)
  const activeSection = ref(SETTINGS_SECTIONS[0].id)
  let frame = 0
  const publishNavHeight = () => {
    document.documentElement.style.setProperty('--settings-nav-h', `${sectionNav.value?.offsetHeight ?? 0}px`)
  }
  const navObserver = new ResizeObserver(publishNavHeight)
  const trackSection = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      activeSection.value = sectionOnScreen(sectionNav.value?.getBoundingClientRect().bottom ?? 0)
    })
  }
  const openSection = (event, id) => {
    if (routeSectionId() !== id) return
    event.preventDefault()
    scrollToRouteSection()
  }
  onMounted(() => {
    publishNavHeight()
    navObserver.observe(sectionNav.value)
    window.addEventListener('scroll', trackSection, { passive: true })
    window.addEventListener('resize', trackSection, { passive: true })
    trackSection()
  })
  onUnmounted(() => {
    navObserver.disconnect()
    cancelAnimationFrame(frame)
    window.removeEventListener('scroll', trackSection)
    window.removeEventListener('resize', trackSection)
    document.documentElement.style.removeProperty('--settings-nav-h')
  })
  watch(activeSection, async () => {
    await nextTick()
    revealActiveLink(sectionNav.value)
  })
  return { sections: SETTINGS_SECTIONS, sectionNav, activeSection, openSection }
}

const SettingsView = {
  template: `
    <div class="view-reveal settings-page space-y-6 pb-24">
      <nav ref="sectionNav" class="settings-sections" aria-label="Settings sections">
        <a v-for="s in sections" :key="s.id" :href="'#/settings/' + s.id"
          :data-active="activeSection === s.id" :aria-current="activeSection === s.id ? 'location' : null"
          class="settings-section-link" @click="openSection($event, s.id)">{{ s.label }}</a>
      </nav>
      <form id="settings-form" @submit.prevent="save" class="space-y-6">
        <section id="section-tvheadend" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">TVHEADEND</span>
              <info-button title="TVHEADEND" doc="guide/tvheadend">
                <p>The address and login Freetvarr uses for the TVHeadend API. Freetvarr reads the guide, channels, and recordings from it, and sets and cancels recordings.</p>
                <p><strong>AUTO-DISCOVER</strong> looks for TVHeadend on your network. The TVHeadend user needs the rights in the setup guide.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">the recorder</span>
          </header>
          <div class="panel-body grid gap-4 md:grid-cols-3">
            <div class="md:col-span-3 flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="detectTvh" :disabled="tvhDetecting">
                <template v-if="tvhDetecting">SCANNING…</template><template v-else><search-icon /> AUTO-DISCOVER TVHEADEND</template>
              </button>
              <span v-if="tvhDiscoverText" :class="['status-readout', tvhDiscoverKind]">{{ tvhDiscoverText }}</span>
              <span v-else class="text-xs font-mono text-ink-dim">looks on this computer, port 9981</span>
            </div>
            <div v-if="tvhCandidates.length > 1" class="md:col-span-3">
              <p class="text-sm text-ink-dim mb-2">Several TVHeadend servers answered. Pick one:</p>
              <ul class="space-y-2">
                <li v-for="c in tvhCandidates" :key="c.url">
                  <button type="button" class="btn" @click="useTvhCandidate(c)">
                    Use {{ c.url }}
                  </button>
                </li>
              </ul>
            </div>
            <div class="field-row md:col-span-3">
              <label class="field-label">TVHeadend URL</label>
              <input v-no-autofill type="text" class="field-input" v-model="tvhUrl" placeholder="e.g. http://192.168.1.10:9981" />
            </div>
            <div class="field-row">
              <label class="field-label">Username</label>
              <input v-no-autofill type="text" class="field-input" v-model="tvhUsername" placeholder="blank if TVHeadend is open" />
            </div>
            <div class="field-row">
              <label class="field-label">Password</label>
              <input v-no-autofill type="password" class="field-input" v-model="tvhPassword"
                :placeholder="tvhPasswordSet ? '••••• (stored)' : 'blank if TVHeadend is open'" autocomplete="off" />
              <p class="text-xs text-ink-mute mt-1">Blank keeps the stored password.</p>
            </div>
            <div class="field-row md:col-span-3 flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="testTvh" :disabled="tvhTesting">
                <template v-if="tvhTesting">TESTING…</template><template v-else><pulse-icon /> TEST CONNECTION</template>
              </button>
              <span v-if="tvhStatus" :class="['status-readout', tvhStatusKind]">{{ tvhStatus }}</span>
            </div>
            <div v-if="tvhOpenEntryBackupSet" class="field-row md:col-span-3 flex flex-wrap items-center gap-3">
              <button type="button" class="btn btn-sm" @click="undoTvhSecure" :disabled="tvhUndoing">
                <template v-if="tvhUndoing">RESTORING…</template><template v-else>RESTORE OPEN ACCESS</template>
              </button>
              <span v-if="tvhUndoText" :class="['status-readout', tvhUndoKind]">{{ tvhUndoText }}</span>
              <span v-else class="text-xs text-ink-mute">Undoes the wizard's SECURE TVHEADEND: anyone on your network can change TVHeadend again. The logins stay.</span>
            </div>
          </div>
        </section>

        <section id="section-storage" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">STORAGE</span>
              <info-button title="STORAGE" doc="guide/configuration#the-two-recordings-paths">
                <ul><li><strong>Media root</strong>: where imported episodes go. Plex reads this folder.</li><li><strong>One-off folder</strong>: where single recordings go, such as sport and specials. Point a separate Plex library at it.</li><li><strong>Recordings folder, as Freetvarr sees it</strong>: the TVHeadend recordings folder, at the path Freetvarr uses.</li><li><strong>Recordings folder, as TVHeadend sees it</strong>: the same folder, at the path TVHeadend reports.</li></ul>
                <p>When both apps see the folder at the same path, the two recordings paths are the same. Keep the recordings and the media root inside one shared folder: imports are then instant and use no extra disk space.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">where recordings go</span>
          </header>
          <div class="panel-body space-y-4">
            <div class="field-row">
              <label class="field-label">Media root <span class="text-ink-mute">(inside container)</span></label>
              <input v-no-autofill type="text" class="field-input" v-model="mediaRoot" placeholder="/data/media/tv" />
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                The folder Freetvarr saves TV episodes to. Plex reads it. Enter the path Freetvarr sees, from the <code>volumes</code> in <code>docker-compose.yml</code>. If you change the folder there, change it here too.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn btn-sm" @click="testMediaRoot" :disabled="mediaRootTesting">
                <template v-if="mediaRootTesting">TESTING…</template><template v-else><pulse-icon /> TEST PATH</template>
              </button>
              <span v-if="mediaRootStatus" :class="['status-readout', mediaRootStatusKind]">{{ mediaRootStatus }}</span>
            </div>
            <div class="field-row">
              <label class="field-label">One-off folder <span class="text-ink-mute">(inside container)</span></label>
              <input v-no-autofill type="text" class="field-input" v-model="oneOffRoot" placeholder="/data/media/one-offs" />
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                Recordings that match no series go here, one folder per title. In Plex, add an "Other Videos" library for this folder.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn btn-sm" @click="testOneOffRoot" :disabled="oneOffRootTesting">
                <template v-if="oneOffRootTesting">TESTING…</template><template v-else><pulse-icon /> TEST PATH</template>
              </button>
              <span v-if="oneOffRootStatus" :class="['status-readout', oneOffRootStatusKind]">{{ oneOffRootStatus }}</span>
            </div>
            <div class="field-row">
              <label class="field-label">Movies folder <span class="text-ink-mute">(inside container, optional)</span></label>
              <input v-no-autofill type="text" class="field-input" v-model="moviesRoot" placeholder="empty: films go to the one-off folder" />
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                Films that match no series go here, as <code>Title (Year)/Title (Year).ts</code>. In Plex, add a "Movies" library for this folder.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn btn-sm" @click="testMoviesRoot" :disabled="moviesRootTesting || !moviesRoot.trim()">
                <template v-if="moviesRootTesting">TESTING…</template><template v-else><pulse-icon /> TEST PATH</template>
              </button>
              <span v-if="moviesRootStatus" :class="['status-readout', moviesRootStatusKind]">{{ moviesRootStatus }}</span>
            </div>
            <div class="settings-block">
              <span class="settings-block-title">LIBRARY RULES</span>
              <toggle-switch v-model="importUnmatched">IMPORT EVERY RECORDING</toggle-switch>
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                On: a recording that matches no series goes to the one-off folder, or to the movies folder if it is a film. Off: Freetvarr imports only your series, and recordings you made with ADD TO LIBRARY on. The others stay in TVHeadend; you can import them from the RECORDINGS tab.
              </p>
            </div>
            <div class="grid gap-4 md:grid-cols-2 pt-1">
              <div class="field-row">
                <label class="field-label">Recordings folder (as Freetvarr sees it)</label>
                <input v-no-autofill type="text" class="field-input" v-model="recordingsRoot" placeholder="/data/recordings" />
                <div class="flex flex-wrap items-center gap-3 mt-2">
                  <button type="button" class="btn btn-sm" @click="recordingsCheck.run" :disabled="recordingsCheck.checking">
                    <template v-if="recordingsCheck.checking">CHECKING…</template><template v-else><pulse-icon /> TEST PATH</template>
                  </button>
                  <span v-if="recordingsCheck.text" :class="['status-readout', recordingsCheck.kind]">{{ recordingsCheck.text }}</span>
                </div>
              </div>
              <div class="field-row">
                <label class="field-label">Recordings folder (as TVHeadend sees it)</label>
                <input v-no-autofill type="text" class="field-input" v-model="tvhRecordingsPath" placeholder="/recordings" />
                <div class="flex flex-wrap items-center gap-3 mt-2">
                  <button type="button" class="btn btn-sm" @click="tvhPathCheck.run" :disabled="tvhPathCheck.checking">
                    <template v-if="tvhPathCheck.checking">CHECKING…</template><template v-else><pulse-icon /> CHECK TVHEADEND</template>
                  </button>
                  <span v-if="tvhPathCheck.text" :class="['status-readout', tvhPathCheck.kind]">{{ tvhPathCheck.text }}</span>
                </div>
              </div>
            </div>
            <p class="text-xs text-ink-mute leading-relaxed">
              TVHeadend and Freetvarr must share this folder. Each can see it at a different path; enter the path each one sees.
            </p>
          </div>
        </section>

        <section id="section-plex" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">PLEX</span>
              <info-button title="PLEX" doc="guide/plex">
                <p>Optional. After a sync imports an episode, Freetvarr asks Plex to refresh the library section, so new episodes show up without a manual scan.</p>
                <p>Freetvarr needs the Plex address, a token, and the section. Without Plex, Freetvarr still imports and files episodes.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">updates Plex after each sync</span>
          </header>
          <div class="panel-body grid gap-4 md:grid-cols-2">
            <div class="md:col-span-2 flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="discoverPlex" :disabled="plexDiscovering">
                <template v-if="plexDiscovering">SCANNING…</template><template v-else><search-icon /> AUTO-DISCOVER PLEX</template>
              </button>
              <span v-if="plexDiscoverText" :class="['status-readout', plexDiscoverKind]">{{ plexDiscoverText }}</span>
              <span v-else class="text-xs font-mono text-ink-dim">looks on your home network</span>
            </div>
            <div v-if="plexCandidates.length > 1" class="md:col-span-2">
              <p class="text-sm text-ink-dim mb-2">Freetvarr found more than one Plex server. Pick yours:</p>
              <ul class="space-y-2">
                <li v-for="c in plexCandidates" :key="c.ip + ':' + c.port">
                  <button type="button" class="btn" @click="usePlexCandidate(c)">
                    Use {{ c.name || 'Plex' }} ({{ c.ip }}:{{ c.port }})
                  </button>
                </li>
              </ul>
            </div>
            <div class="field-row md:col-span-2">
              <label class="field-label">Plex URL</label>
              <input v-no-autofill type="text" class="field-input" v-model="plexUrl" placeholder="http://127.0.0.1:32400" />
            </div>
            <div class="field-row md:col-span-2">
              <label class="field-label">Plex token</label>
              <input v-no-autofill type="password" class="field-input" v-model="plexToken"
                :placeholder="plexTokenSet ? '••••• (stored)' : 'paste your Plex token'" autocomplete="off" />
              <div class="mt-2 flex flex-wrap items-center gap-3">
                <button type="button" class="btn btn-sm" @click="detectPlexToken" :disabled="plexDetecting">
                  <template v-if="plexDetecting">DETECTING…</template><template v-else><bolt-icon /> AUTO-DETECT TOKEN</template>
                </button>
                <span v-if="plexTokenStatus" :class="['status-readout', plexTokenStatusKind]">{{ plexTokenStatus }}</span>
              </div>
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                AUTO-DETECT TOKEN reads the token from Plex's settings file. It works with the Plex in Freetvarr's compose file.
              </p>
            </div>
            <details class="settings-disclosure md:col-span-2" :open="plexPrefsOpen">
              <summary>Token not found?</summary>
              <div class="settings-disclosure-body space-y-2">
                <p class="text-xs text-ink-mute leading-relaxed">
                  If you installed Plex yourself, share the folder that holds its <code>Preferences.xml</code> with Freetvarr in <code>docker-compose.yml</code>, then enter the path Freetvarr sees below. Or paste the token from Plex; <a href="https://furey.github.io/freetvarr/guide/plex#the-token" target="_blank" rel="noopener noreferrer">the Plex guide</a> says where to find it.
                </p>
                <div class="field-row">
                  <label class="field-label">Preferences.xml path <span class="text-ink-mute">(inside container)</span></label>
                  <input v-no-autofill type="text" class="field-input" v-model="plexPrefsPath" :placeholder="defaultPlexPrefsPath" />
                </div>
              </div>
            </details>
            <div class="field-row md:col-span-2">
              <label class="field-label">Plex TV section</label>
              <select v-if="plexSections.length" class="field-input" v-model="plexSectionId">
                <option value="">Pick a section</option>
                <option v-for="sec in plexSections" :key="sec.key" :value="sec.key">
                  {{ sec.title }} (#{{ sec.key }}, {{ sec.type }})
                </option>
              </select>
              <input v-no-autofill v-else type="text" class="field-input" v-model="plexSectionId"
                placeholder="section number; LOAD SECTIONS lists them" />
            </div>
            <div class="field-row md:col-span-2">
              <label class="field-label">Plex one-off section</label>
              <select v-if="plexSections.length" class="field-input" v-model="plexOneOffSectionId">
                <option value="">None</option>
                <option v-for="sec in plexSections" :key="sec.key" :value="sec.key">
                  {{ sec.title }} (#{{ sec.key }}, {{ sec.type }})
                </option>
              </select>
              <input v-no-autofill v-else type="text" class="field-input" v-model="plexOneOffSectionId"
                placeholder="section number of the one-off library" />
            </div>
            <div class="field-row md:col-span-2">
              <label class="field-label">Plex movies section</label>
              <select v-if="plexSections.length" class="field-input" v-model="plexMoviesSectionId">
                <option value="">None</option>
                <option v-for="sec in plexSections" :key="sec.key" :value="sec.key">
                  {{ sec.title }} (#{{ sec.key }}, {{ sec.type }})
                </option>
              </select>
              <input v-no-autofill v-else type="text" class="field-input" v-model="plexMoviesSectionId"
                placeholder="section number of the movies library" />
            </div>
            <div class="md:col-span-2 flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="loadPlexSections" :disabled="plexProbing">
                <template v-if="plexProbing">LOADING…</template><template v-else><download-icon /> LOAD SECTIONS</template>
              </button>
              <button type="button" class="btn" @click="refreshPlexNow" :disabled="plexRefreshing">
                <template v-if="plexRefreshing">REFRESHING…</template><template v-else><refresh-icon /> REFRESH PLEX NOW</template>
              </button>
              <span v-if="plexStatus" :class="['status-readout', plexStatusKind]">{{ plexStatus }}</span>
            </div>
            <plex-library-setup :plex-url="plexUrl" :plex-token="plexToken" :loads="plexSectionLoads"
              @created="usePlexLibraries" />
            <div class="md:col-span-2">
              <toggle-switch v-model="deleteAfterPlexRefreshOnly" class="toggle-prose">
                Wait for Plex before removing recordings from TVHeadend
                <span class="text-ink-mute">(recommended: if Plex does not answer, the recording stays in TVHeadend)</span>
              </toggle-switch>
            </div>
          </div>
        </section>

        <section id="section-schedule" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">SCHEDULE</span>
              <info-button title="SCHEDULE" doc="guide/syncs#scheduled-and-manual">
                <p>The time zone Freetvarr uses for the guide, recordings, and the sync schedule. A <code>TZ</code> value in your .env file only fills in the first choice; the zone you save here wins.</p>
                <p>How often Freetvarr checks TVHeadend for new recordings to import. <strong>Custom</strong> takes a cron expression, such as <code>0 */2 * * *</code> for every two hours.</p>
                <p>A change applies without a restart. <strong>SYNC NOW</strong> on the dashboard runs a sync at any time.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">time zone and when Freetvarr syncs</span>
          </header>
          <div class="panel-body space-y-4">
            <time-zone-field v-model="timeZone" :source="tzSource" />
            <div class="field-row md:max-w-xs">
              <label class="field-label" for="settings-sync-schedule">Sync schedule</label>
              <select id="settings-sync-schedule" class="field-input" v-model="syncSchedule">
                <option v-for="preset in syncSchedulePresets" :key="preset.cron" :value="preset.cron">{{ preset.label }}</option>
                <option :value="customSyncSchedule">Custom</option>
              </select>
            </div>
            <div v-if="syncSchedule === customSyncSchedule" class="field-row">
              <label class="field-label" for="settings-sync-cron">Custom schedule <span class="text-ink-mute">(cron)</span></label>
              <input v-no-autofill id="settings-sync-cron" type="text" class="field-input" v-model="syncCron" placeholder="0 */2 * * *" />
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                Five fields: minute, hour, day of month, month, day of week. <code>0 */2 * * *</code> is every two hours.
              </p>
              <p v-if="syncCronEffective && syncCronEffective !== syncCron.trim()" class="text-xs text-ink-dim mt-2">
                Freetvarr syncs on <code>{{ syncCronEffective }}</code> until you save a valid schedule.
              </p>
            </div>
          </div>
        </section>

        <section id="section-ad-removal" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">AD REMOVAL</span>
              <info-button title="AD REMOVAL" doc="guide/ad-removal">
                <p>Finds the ad breaks in a recording with comskip, and can cut them out with ffmpeg. Both come with Freetvarr.</p>
                <p>Turn it on here, then set a mode for each series on the SERIES tab. <strong>DETECT</strong> saves the breaks in a <code>.edl</code> file beside the video, so Kodi skips them. <strong>CUT</strong> removes them and keeps the original for a set number of days.</p>
                <p>Detection is not always right. Use DETECT on a channel first, and check the breaks before you let it cut.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">optional</span>
          </header>
          <div class="panel-body space-y-4">
            <div>
              <toggle-switch v-model="adRemovalEnabled" class="toggle-prose">
                Enable ad removal
                <span class="text-ink-mute">(set the mode for each series on the SERIES tab)</span>
              </toggle-switch>
            </div>
            <div class="field-row md:max-w-xs">
              <label class="field-label">Keep the original after a cut for (days)</label>
              <input v-no-autofill type="number" min="1" class="field-input" v-model="adOriginalRetentionDays" />
            </div>
            <p class="text-xs font-mono text-ink-dim">
              Detection settings: <code>{{ comskipIniOverride ? 'your /config/comskip.ini' : 'built in, tuned for Australian free-to-air' }}</code>
            </p>
            <p class="text-xs text-ink-mute leading-relaxed">
              Finding the ads uses a lot of processor time: expect several minutes for each episode. CUT saves the recording again without the ads, at the same picture quality, and keeps the original as <code>&lt;file&gt;.ts.orig</code> for the days above. Detection works better on some channels than others, so try DETECT before you use CUT.
            </p>
          </div>
        </section>
      </form>

      <div class="settings-save-bar">
        <div class="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <span v-if="status" :class="['status-readout', statusKind]">{{ status }}</span>
          <span v-else class="hidden sm:inline text-xs font-mono text-ink-mute">Changes apply when you save.</span>
          <button type="submit" form="settings-form" class="btn btn-primary ml-auto" :disabled="saving">
            <template v-if="saving">SAVING…</template><template v-else><check-icon /> SAVE SETTINGS</template>
          </button>
        </div>
      </div>

      <tv-apps-panel :tvh-url="tvhUrl" />

      <section id="section-help" class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">HELP</span>
            <info-button title="HELP" doc="guide/troubleshooting#reporting-a-bug">
              <p><strong>REOPEN WIZARD</strong> walks the first-run setup again, with your saved values filled in.</p>
              <p><strong>RUN DOCTOR</strong> checks your setup and says what to fix.</p>
              <p>The versions Freetvarr is running with. Include them when you report a bug. <strong>COPY</strong> puts them on the clipboard as plain text. The update check asks GitHub for the newest Freetvarr release, from this browser.</p>
            </info-button>
          </span>
          <span class="text-xs font-mono text-ink-dim">setup, checks, and versions</span>
        </header>
        <div class="panel-body help-rows">
          <div class="help-row">
            <div class="max-w-2xl">
              <span class="settings-block-title">SETUP WIZARD</span>
              <p class="text-sm text-ink-dim leading-relaxed">
                Open the guided setup again. Your saved values are filled in, and a saved password or token shows as <code>••••• (stored)</code>, so you can change one step without typing the rest again.
              </p>
            </div>
            <button type="button" class="btn" @click="reopenWizard"><refresh-icon /> REOPEN WIZARD</button>
          </div>
          <div class="help-row">
            <div class="max-w-2xl">
              <span class="settings-block-title">HEALTH CHECK</span>
              <p class="text-sm text-ink-dim leading-relaxed">
                The Doctor checks the TVHeadend login and rights, the tuners, the guide, the folders, Plex, and live TV, then says what to fix.
              </p>
            </div>
            <a href="#/doctor" class="btn no-hover-underline"><pulse-icon /> RUN DOCTOR</a>
          </div>
          <versions-row />
        </div>
      </section>

      <section id="section-danger-zone" class="panel settings-reset">
        <header class="panel-header">
          <span class="panel-title">RESET</span>
          <span class="text-xs font-mono text-ink-dim">cannot be undone</span>
        </header>
        <div class="panel-body space-y-4">
          <div>
            <p class="text-sm text-ink leading-relaxed">
              Delete Freetvarr's settings, series, list of recordings, and sync history. The next time you open Freetvarr, the setup wizard will start from the beginning.
            </p>
            <p class="text-xs text-ink-mute leading-relaxed mt-2">
              Your video files in <code>{{ mediaRoot || '/media/tv' }}</code> and the other library folders will stay where they are, and so will the recordings and settings in TVHeadend. You cannot reset while a sync is running.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button type="button" class="btn btn-danger" @click="resetFreetvarr" :disabled="resetting">
              <template v-if="resetting">RESETTING…</template><template v-else><trash-icon /> RESET FREETVARR</template>
            </button>
            <span v-if="resetError" class="status-readout err">{{ resetError }}</span>
          </div>
        </div>
      </section>
    </div>
  `,
  setup() {
    const tvhUrl = ref('')
    const tvhUsername = ref('')
    const tvhPassword = ref('')
    const tvhPasswordSet = ref(false)
    const tvhTesting = ref(false)
    const tvhStatus = ref('')
    const tvhStatusKind = ref('ok')
    const tvhOpenEntryBackupSet = ref(false)
    const tvhUndoing = ref(false)
    const [tvhUndoText, tvhUndoKind, setTvhUndo] = makeStatus()
    const undoTvhSecure = async () => {
      if (!confirm('Restore open access to TVHeadend? Anyone on your network will be able to change it again.')) return
      tvhUndoing.value = true
      try {
        await api('POST', '/api/tvh-bootstrap/undo')
        tvhOpenEntryBackupSet.value = false
        setTvhUndo('Open access restored.', 'ok', 8000)
      } catch (err) {
        setTvhUndo(err.message, 'err', 0)
      } finally {
        tvhUndoing.value = false
      }
    }
    const recordingsRoot = ref('')
    const tvhRecordingsPath = ref('')
    const recordingsCheck = usePathCheck(() => recordingsFolderStatus({
      path: recordingsRoot.value,
      mediaRoot: mediaRoot.value,
    }))
    const tvhPathCheck = usePathCheck(() => tvhRecordingsPathStatus({
      path: tvhRecordingsPath.value,
      fill: (value) => (tvhRecordingsPath.value = value),
    }))
    const syncCron = ref('')
    const syncCronEffective = ref('')
    const syncSchedule = ref(DEFAULT_SYNC_CRON)
    watch(syncSchedule, (schedule) => {
      if (schedule !== CUSTOM_SYNC_SCHEDULE) syncCron.value = schedule
    })
    const timeZone = ref('')
    const tzSource = ref('system')
    const plexUrl = ref('')
    const plexToken = ref('')
    const plexTokenSet = ref(false)
    const plexSectionId = ref('')
    const plexSections = ref([])
    const plexProbing = ref(false)
    const plexRefreshing = ref(false)
    const plexDetecting = ref(false)
    const plexTokenStatus = ref('')
    const plexTokenStatusKind = ref('ok')
    const plexDiscovering = ref(false)
    const plexCandidates = ref([])
    const plexPrefsPath = ref('')
    const plexPrefsOpen = ref(false)
    const plexSectionLoads = ref(0)
    const deleteAfterPlexRefreshOnly = ref(true)
    const adRemovalEnabled = ref(false)
    const adOriginalRetentionDays = ref('7')
    const comskipIniOverride = ref(false)
    const status = ref('')
    const statusKind = ref('ok')
    const plexStatus = ref('')
    const plexStatusKind = ref('ok')
    const saving = ref(false)
    const resetting = ref(false)
    const resetError = ref('')
    const oneOffRoot = ref('')
    const oneOffRootTesting = ref(false)
    const oneOffRootStatus = ref('')
    const oneOffRootStatusKind = ref('ok')
    const importUnmatched = ref(true)
    const plexOneOffSectionId = ref('')
    const moviesRoot = ref('')
    const moviesRootTesting = ref(false)
    const moviesRootStatus = ref('')
    const moviesRootStatusKind = ref('ok')
    const plexMoviesSectionId = ref('')
    const mediaRoot = ref('')
    const mediaRootTesting = ref(false)
    const mediaRootStatus = ref('')
    const mediaRootStatusKind = ref('ok')

    const flash = ({ msg, kind = 'ok', ms = FLASH_DEFAULT_MS }) => {
      status.value = msg
      statusKind.value = kind
      if (ms > 0) setTimeout(() => (status.value = ''), ms)
    }

    const setPlexStatus = (msg, kind = 'ok', ms = FLASH_DEFAULT_MS) => {
      plexStatus.value = msg
      plexStatusKind.value = kind
      if (ms > 0) setTimeout(() => (plexStatus.value = ''), ms)
    }

    const setPlexTokenStatus = (msg, kind = 'ok', ms = FLASH_DEFAULT_MS) => {
      plexTokenStatus.value = msg
      plexTokenStatusKind.value = kind
      if (ms > 0) setTimeout(() => (plexTokenStatus.value = ''), ms)
    }

    onMounted(async () => {
      const s = await api('GET', '/api/settings')
      tvhUrl.value = s.tvh_url || ''
      tvhUsername.value = s.tvh_username || ''
      tvhPasswordSet.value = Boolean(s.tvh_password_set)
      tvhOpenEntryBackupSet.value = Boolean(s.tvh_open_entry_backup_set)
      recordingsRoot.value = s.recordings_root || ''
      tvhRecordingsPath.value = s.tvh_recordings_path || ''
      syncCronEffective.value = s.sync_cron_effective || ''
      const storedCron = normaliseCron(s.sync_cron) || syncCronEffective.value || DEFAULT_SYNC_CRON
      syncSchedule.value = syncSchedulePreset(storedCron)
      syncCron.value = storedCron
      tzSource.value = s.tz_source || 'system'
      timeZone.value = s.time_zone || s.tz || browserTimeZone()
      if (s.tz) tz.value = s.tz
      plexUrl.value = s.plex_url || ''
      plexTokenSet.value = Boolean(s.plex_token_set)
      plexSectionId.value = s.plex_tv_section_id || ''
      plexPrefsPath.value = s.plex_prefs_path || ''
      plexPrefsOpen.value = isCustomPlexPrefsPath(plexPrefsPath.value)
      mediaRoot.value = s.media_root || ''
      oneOffRoot.value = s.oneoff_root || ''
      importUnmatched.value = s.import_unmatched !== false
      plexOneOffSectionId.value = s.plex_oneoff_section_id || ''
      moviesRoot.value = s.movies_root || ''
      plexMoviesSectionId.value = s.plex_movies_section_id || ''
      deleteAfterPlexRefreshOnly.value = s.delete_after_plex_refresh_only !== false
      adRemovalEnabled.value = Boolean(s.ad_removal_enabled)
      adOriginalRetentionDays.value = s.ad_original_retention_days || '7'
      comskipIniOverride.value = Boolean(s.comskip_ini_override)
      await scrollToRouteSection()
    })
    const stopSectionWatch = watch(routeSection, scrollToRouteSection)
    onUnmounted(stopSectionWatch)

    const save = async () => {
      saving.value = true
      try {
        const body = {
          tvh_url: tvhUrl.value,
          tvh_username: tvhUsername.value,
          recordings_root: recordingsRoot.value,
          tvh_recordings_path: tvhRecordingsPath.value,
          sync_cron: syncCron.value,
          plex_url: plexUrl.value,
          plex_tv_section_id: plexSectionId.value,
          plex_prefs_path: plexPrefsPath.value,
          media_root: mediaRoot.value,
          oneoff_root: oneOffRoot.value,
          import_unmatched: importUnmatched.value,
          plex_oneoff_section_id: plexOneOffSectionId.value,
          movies_root: moviesRoot.value,
          plex_movies_section_id: plexMoviesSectionId.value,
          delete_after_plex_refresh_only: deleteAfterPlexRefreshOnly.value,
          ad_removal_enabled: adRemovalEnabled.value,
          ad_original_retention_days: adOriginalRetentionDays.value,
        }
        body.time_zone = timeZone.value
        if (plexToken.value) body.plex_token = plexToken.value
        if (tvhPassword.value) body.tvh_password = tvhPassword.value
        await api('POST', '/api/settings', body)
        tz.value = timeZone.value
        tzSource.value = 'setting'
        if (plexToken.value) {
          plexTokenSet.value = true
          plexToken.value = ''
        }
        if (tvhPassword.value) {
          tvhPasswordSet.value = true
          tvhPassword.value = ''
        }
        flash({ msg: 'Saved.' })
        await refreshSyncSchedule()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      } finally {
        saving.value = false
      }
    }

    const refreshSyncSchedule = async () => {
      const fresh = await api('GET', '/api/settings').catch(() => null)
      if (fresh) syncCronEffective.value = fresh.sync_cron_effective || ''
      await loadSyncStatus()
    }

    const tvhDetecting = ref(false)
    const tvhCandidates = ref([])
    const [tvhDiscoverText, tvhDiscoverKind, setTvhDiscover] = makeStatus()
    const useTvhCandidate = (c) => {
      tvhUrl.value = c.url
      tvhCandidates.value = []
      setTvhDiscover(tvhDetectSummary(c), c.loopback ? 'info' : 'ok', 0)
    }
    const detectTvh = async () => {
      tvhDetecting.value = true
      tvhCandidates.value = []
      setTvhDiscover('Scanning this host (~2s)…', 'busy', 0)
      try {
        const r = await api('POST', '/api/tvh-detect')
        if (r.candidates.length === 1) useTvhCandidate(r.candidates[0])
        else {
          tvhCandidates.value = r.candidates
          setTvhDiscover(`${r.candidates.length} TVHeadend servers answered.`, 'info', 0)
        }
      } catch (err) {
        setTvhDiscover(`Auto-discover failed: ${err.message}`, 'err', 8000)
      } finally {
        tvhDetecting.value = false
      }
    }

    const testTvh = async () => {
      tvhTesting.value = true
      tvhStatus.value = 'Contacting TVHeadend…'
      tvhStatusKind.value = 'busy'
      try {
        const r = await api('POST', '/api/tvh-test', {
          tvh_url: tvhUrl.value,
          tvh_username: tvhUsername.value,
          ...(tvhPassword.value ? { tvh_password: tvhPassword.value } : {}),
        })
        if (tvhPassword.value) {
          tvhPasswordSet.value = true
          tvhPassword.value = ''
        }
        tvhStatus.value = tvhTestSummary(r)
        tvhStatusKind.value = 'ok'
      } catch (err) {
        tvhStatus.value = `Failed: ${err.message}${err.stage ? ` (stage: ${err.stage})` : ''}`
        tvhStatusKind.value = 'err'
      } finally {
        tvhTesting.value = false
      }
    }

    const loadPlexSections = async () => {
      plexProbing.value = true
      try {
        const body = { plex_url: plexUrl.value }
        if (plexToken.value) body.plex_token = plexToken.value
        const { sections = [] } = await api('POST', '/api/plex-sections', body)
        plexSections.value = sections
        plexSectionLoads.value++
        if (sections.length === 0) {
          setPlexStatus('Connected to Plex, but no library sections returned.', 'info', 6000)
        } else {
          setPlexStatus(`Loaded ${sections.length} Plex sections.`)
        }
      } catch (err) {
        setPlexStatus(`Could not reach Plex: ${err.message}`, 'err', 8000)
      } finally {
        plexProbing.value = false
      }
    }

    const usePlexLibraries = (selected) => {
      if (selected.tv) plexSectionId.value = selected.tv
      if (selected.oneoff) plexOneOffSectionId.value = selected.oneoff
      if (selected.movies) plexMoviesSectionId.value = selected.movies
      loadPlexSections()
    }

    const detectPlexToken = async () => {
      plexDetecting.value = true
      try {
        if (plexPrefsPath.value) {
          await api('POST', '/api/settings', { plex_prefs_path: plexPrefsPath.value })
        }
        const r = await api('POST', '/api/plex-detect-token')
        if (r.ok) {
          plexTokenSet.value = true
          plexToken.value = r.token || ''
          setPlexTokenStatus(`Token detected from ${r.source}.`, 'ok', 5000)
        } else {
          setPlexTokenStatus(`Auto-detect failed: ${r.reason}`, 'err', 8000)
        }
      } catch (err) {
        setPlexTokenStatus(`Auto-detect failed: ${err.message}`, 'err', 8000)
      } finally {
        plexDetecting.value = false
      }
    }

    const [plexDiscoverText, plexDiscoverKind, setPlexDiscover] = makeStatus()
    const discoverPlex = async () => {
      plexDiscovering.value = true
      plexCandidates.value = []
      setPlexDiscover('Searching your network (~2s)…', 'busy', 0)
      try {
        const { servers = [] } = await api('POST', '/api/discover-plex')
        if (servers.length === 0) {
          setPlexDiscover('No Plex server found on your network.', 'err', 5000)
        } else if (servers.length === 1) {
          usePlexCandidate(servers[0])
        } else {
          plexCandidates.value = servers
          setPlexDiscover(`Found ${servers.length} Plex servers. Choose one below.`, 'info', 5000)
        }
      } catch (err) {
        setPlexDiscover(`Plex discovery failed: ${err.message}`, 'err', 5000)
      } finally {
        plexDiscovering.value = false
      }
    }

    const usePlexCandidate = (c) => {
      plexUrl.value = `http://${c.ip}:${c.port}`
      plexCandidates.value = []
      setPlexDiscover(`Selected ${c.name || 'Plex'} at ${c.ip}:${c.port}. Save to persist.`, 'ok', 5000)
    }

    const testOneOffRoot = async () => {
      oneOffRootTesting.value = true
      oneOffRootStatus.value = ''
      try {
        const r = await api('POST', '/api/media-root-test', { path: oneOffRoot.value || '/media/one-offs' })
        oneOffRootStatus.value = r.ok ? `${r.path} is writable.` : r.error
        oneOffRootStatusKind.value = r.ok ? 'ok' : 'err'
      } catch (err) {
        oneOffRootStatus.value = `Test failed: ${err.message}`
        oneOffRootStatusKind.value = 'err'
      } finally {
        oneOffRootTesting.value = false
      }
    }

    const testMoviesRoot = async () => {
      moviesRootTesting.value = true
      moviesRootStatus.value = ''
      try {
        const r = await api('POST', '/api/media-root-test', { path: moviesRoot.value })
        moviesRootStatus.value = r.ok ? `${r.path} is writable.` : r.error
        moviesRootStatusKind.value = r.ok ? 'ok' : 'err'
      } catch (err) {
        moviesRootStatus.value = `Test failed: ${err.message}`
        moviesRootStatusKind.value = 'err'
      } finally {
        moviesRootTesting.value = false
      }
    }

    const testMediaRoot = async () => {
      mediaRootTesting.value = true
      mediaRootStatus.value = ''
      try {
        const r = await api('POST', '/api/media-root-test', { path: mediaRoot.value })
        if (r.ok) {
          mediaRootStatus.value = `${r.path} is writable.`
          mediaRootStatusKind.value = 'ok'
        } else {
          mediaRootStatus.value = r.error
          mediaRootStatusKind.value = 'err'
        }
      } catch (err) {
        mediaRootStatus.value = `Test failed: ${err.message}`
        mediaRootStatusKind.value = 'err'
      } finally {
        mediaRootTesting.value = false
      }
    }

    const resetFreetvarr = async () => {
      const mediaPath = mediaRoot.value || '/media/tv'
      const prompt = 'Reset Freetvarr?\n\n'
        + 'This will delete Freetvarr\'s settings, series, list of recordings, and sync history.\n\n'
        + `Your video files in ${mediaPath} and the other library folders will stay where they are, `
        + 'and so will the recordings and settings in TVHeadend.\n\n'
        + 'This cannot be undone. Continue?'
      if (!confirm(prompt)) return
      resetting.value = true
      resetError.value = ''
      try {
        await api('POST', '/api/reset')
        try { localStorage.removeItem(WELCOME_DISMISSED_KEY) } catch { /* private mode */ }
        window.location.hash = '#/welcome'
        window.location.reload()
      } catch (err) {
        resetError.value = `Reset failed: ${err.message}`
        resetting.value = false
      }
    }

    const reopenWizard = () => {
      try { localStorage.removeItem(WELCOME_DISMISSED_KEY) } catch { /* private mode */ }
      if (window.location.hash === '#/welcome') {
        window.location.reload()
      } else {
        window.location.hash = '#/welcome'
      }
    }

    const refreshPlexNow = async () => {
      plexRefreshing.value = true
      try {
        const body = {
          plex_url: plexUrl.value,
          plex_tv_section_id: plexSectionId.value,
        }
        if (plexToken.value) body.plex_token = plexToken.value
        const r = await api('POST', '/api/plex-refresh', body)
        if (r.triggered) setPlexStatus(`Plex refresh sent (HTTP ${r.status}).`)
        else if (r.skipped) setPlexStatus(`Not configured: ${r.reason}.`, 'info', 6000)
        else setPlexStatus(`Plex refresh failed: ${r.error}.`, 'err', 8000)
      } catch (err) {
        setPlexStatus(`Plex refresh failed: ${err.message}`, 'err', 8000)
      } finally {
        plexRefreshing.value = false
      }
    }

    return {
      tvhUrl, tvhUsername, tvhPassword, tvhPasswordSet, tvhTesting, tvhStatus, tvhStatusKind,
      tvhOpenEntryBackupSet, tvhUndoing, tvhUndoText, tvhUndoKind, undoTvhSecure,
      recordingsRoot, tvhRecordingsPath, recordingsCheck, tvhPathCheck,
      syncCron, syncCronEffective, syncSchedule, timeZone, tzSource,
      syncSchedulePresets: SYNC_SCHEDULE_PRESETS, customSyncSchedule: CUSTOM_SYNC_SCHEDULE,
      ...useSettingsSections(),
      plexUrl, plexToken, plexTokenSet, plexSectionId, plexSections, plexSectionLoads, usePlexLibraries,
      plexProbing, plexRefreshing, plexDetecting,
      plexTokenStatus, plexTokenStatusKind,
      plexDiscovering, plexCandidates, plexPrefsPath, plexPrefsOpen, plexDiscoverText, plexDiscoverKind,
      defaultPlexPrefsPath: DEFAULT_PLEX_PREFS_PATH,
      deleteAfterPlexRefreshOnly,
      adRemovalEnabled, adOriginalRetentionDays, comskipIniOverride,
      status, statusKind, plexStatus, plexStatusKind, saving,
      resetting, resetError, resetFreetvarr, reopenWizard,
      mediaRoot, mediaRootTesting, mediaRootStatus, mediaRootStatusKind, testMediaRoot,
      oneOffRoot, oneOffRootTesting, oneOffRootStatus, oneOffRootStatusKind, testOneOffRoot,
      importUnmatched, plexOneOffSectionId, plexMoviesSectionId,
      moviesRoot, moviesRootTesting, moviesRootStatus, moviesRootStatusKind, testMoviesRoot,
      save, loadPlexSections, refreshPlexNow, detectPlexToken,
      discoverPlex, usePlexCandidate,
      testTvh, detectTvh, tvhDetecting, tvhCandidates, useTvhCandidate,
      tvhDiscoverText, tvhDiscoverKind,
    }
  },
}

const DOCS_BASE = 'https://furey.github.io/freetvarr/'
const DOCTOR_GROUPS = [
  { key: 'tvheadend', label: 'TVHEADEND' },
  { key: 'guide',     label: 'GUIDE'     },
  { key: 'storage',   label: 'STORAGE'   },
  { key: 'plex',      label: 'PLEX'      },
  { key: 'syncs',     label: 'SYNCS'     },
  { key: 'live',      label: 'LIVE TV'   },
  { key: 'host',      label: 'HOST'      },
]
const DOCTOR_PILLS = { pass: 'doctor-pass', warn: 'doctor-warn', fail: 'doctor-fail', skip: 'doctor-skip' }
const DOCTOR_STATUS_ORDER = ['fail', 'warn', 'pass', 'skip']
const DOCTOR_PILL_ORDER = ['pass', 'warn', 'fail', 'skip']

const sortDoctorChecks = (checks) => [...checks].sort((a, b) =>
  DOCTOR_STATUS_ORDER.indexOf(a.status) - DOCTOR_STATUS_ORDER.indexOf(b.status))

const DOCTOR_SCAN_MIN_MS = 700

const DoctorSpinner = {
  template: `
    <svg class="doctor-spinner" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
      <circle class="doctor-spinner-track" cx="8" cy="8" r="6"/>
      <circle class="doctor-spinner-arc" cx="8" cy="8" r="6" pathLength="100" stroke-dasharray="28 72"/>
    </svg>
  `,
}

const DoctorView = {
  template: `
    <div class="view-reveal space-y-6">
      <a href="#/settings/help" class="btn btn-sm no-hover-underline"><arrow-left-icon /> SETTINGS</a>
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">DOCTOR</span>
            <info-button title="DOCTOR" doc="guide/doctor">
              <p>Checks TVHeadend, the guide, the folders, Plex, live TV, and the host, then says what to fix.</p>
              <ul><li><strong>Pass</strong>: nothing to do.</li><li><strong>Warn</strong>: Freetvarr works, but something costs space, guide data, or picture quality.</li><li><strong>Fail</strong>: something Freetvarr needs is broken. The row says how to fix it.</li><li><strong>Skip</strong>: the check could not run, usually because an earlier check failed.</li></ul>
              <p><strong>RE-RUN</strong> checks again. Otherwise the results can be up to 15 seconds old.</p>
            </info-button>
          </span>
          <div class="flex items-center gap-3">
            <span v-if="report && !checking" class="text-xs font-mono text-ink-dim">ran {{ ranLabel }}, {{ durationLabel }}</span>
            <button type="button" class="btn btn-sm" @click="load({ fresh: true })" :disabled="checking">
              <template v-if="checking"><doctor-spinner /> CHECKING</template><template v-else><refresh-icon /> RE-RUN</template>
            </button>
          </div>
        </header>
        <div class="panel-body space-y-3">
          <div v-if="checking" class="doctor-progress" role="status">
            <div class="doctor-progress-line">
              <doctor-spinner class="text-signal-orange" />
              <span class="status-readout busy">{{ progressText }}</span>
            </div>
            <div class="progress-track">
              <div :class="['progress-fill', { indeterminate: phase === 'scanning' }]" :style="phase === 'scanning' ? null : { width: progressPercent + '%' }"></div>
            </div>
          </div>
          <div v-if="report" class="pill-group">
            <span v-for="s in summaryPills" :key="s.status" :class="['pill', s.pill, { 'doctor-pill-zero': !s.count }]">{{ s.count }} {{ s.status }}</span>
          </div>
          <p v-if="error" class="status-readout err">Doctor failed: {{ error }}</p>
          <p class="text-sm text-ink-dim leading-relaxed max-w-2xl">
            The Doctor checks TVHeadend, Plex, and the folders Freetvarr uses, then lists what needs fixing.
          </p>
        </div>
      </section>

      <section v-for="g in groups" :key="g.key" :id="'section-' + g.key" class="panel">
        <header class="panel-header">
          <span class="panel-title">{{ g.label }}</span>
        </header>
        <ul class="doctor-list">
          <li v-for="c in g.checks" :key="c.id" :class="['doctor-row', 'doctor-row-' + rowState(c)]">
            <span v-if="rowState(c) === 'resolved'" :class="['pill', 'doctor-pill', pillFor(c.status)]">{{ c.status }}</span>
            <span v-else class="pill doctor-pill doctor-pill-pending" :aria-label="rowState(c) === 'active' ? 'Checking' : 'Waiting'">
              <doctor-spinner v-if="rowState(c) === 'active'" /><template v-else>···</template>
            </span>
            <div class="min-w-0 space-y-1.5">
              <div class="text-sm font-semibold text-ink doctor-row-title">{{ c.title }}</div>
              <template v-if="rowState(c) === 'resolved'">
                <div class="doctor-detail font-mono text-xs text-ink-dim">{{ c.detail }}</div>
                <p v-if="needsFix(c) && c.fix" class="text-sm text-ink leading-relaxed">{{ c.fix }}</p>
                <div v-if="needsFix(c) || c.action" class="flex flex-wrap items-center gap-x-5 gap-y-2 pt-0.5">
                  <a v-if="needsFix(c) && c.doc" :href="docsUrl(c.doc)" target="_blank" rel="noopener noreferrer"
                    class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">Read more <external-link-icon /></a>
                  <a v-if="c.action" :href="c.action.href"
                    class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">{{ c.action.label }} <arrow-right-icon /></a>
                </div>
              </template>
              <div v-else class="doctor-placeholder" aria-hidden="true"></div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  `,
  setup() {
    const report = ref(null)
    const checking = ref(false)
    const error = ref('')
    const phase = ref('scanning')
    const revealed = ref(0)
    let runId = 0

    const groups = computed(() => {
      const checks = report.value?.checks || []
      return DOCTOR_GROUPS
        .map((g) => ({ ...g, checks: sortDoctorChecks(checks.filter((c) => c.group === g.key)) }))
        .filter((g) => g.checks.length)
    })

    const orderedChecks = computed(() => groups.value.flatMap((g) => g.checks))
    const revealOrder = computed(() => new Map(orderedChecks.value.map((c, i) => [c.id, i])))

    const rowState = (c) => {
      const index = revealOrder.value.get(c.id)
      if (index < revealed.value) return 'resolved'
      if (phase.value === 'revealing' && index === revealed.value) return 'active'
      return 'pending'
    }

    const isCurrentRun = (id) => id === runId

    const revealRows = async (id) => {
      const total = orderedChecks.value.length
      if (prefersReducedMotion()) {
        revealed.value = total
        return
      }
      const stepMs = revealStepMs(total)
      for (let i = 1; i <= total; i += 1) {
        await wait(stepMs)
        if (!isCurrentRun(id)) return
        revealed.value = i
      }
    }

    const fetchReport = async ({ fresh, id }) => {
      const minimumScan = prefersReducedMotion() ? null : wait(DOCTOR_SCAN_MIN_MS)
      const [result] = await Promise.allSettled([api('GET', `/api/doctor${fresh ? '?fresh=1' : ''}`), minimumScan])
      if (!isCurrentRun(id)) return false
      if (result.status === 'rejected') {
        error.value = result.reason?.message || String(result.reason)
        return false
      }
      report.value = result.value
      return true
    }

    const load = async ({ fresh = false } = {}) => {
      const id = ++runId
      checking.value = true
      error.value = ''
      phase.value = 'scanning'
      revealed.value = 0
      const ok = await fetchReport({ fresh, id })
      if (!isCurrentRun(id)) return
      if (ok) {
        phase.value = 'revealing'
        await scrollToRouteSection()
        await revealRows(id)
        if (!isCurrentRun(id)) return
      } else {
        revealed.value = orderedChecks.value.length
      }
      phase.value = 'done'
      checking.value = false
    }

    const resolvedChecks = computed(() => orderedChecks.value.slice(0, revealed.value))

    const summaryPills = computed(() => DOCTOR_PILL_ORDER.map((status) => ({
      status,
      pill: DOCTOR_PILLS[status],
      count: resolvedChecks.value.filter((c) => c.status === status).length,
    })))

    const progressPercent = computed(() => {
      const total = orderedChecks.value.length
      return total ? Math.round((revealed.value / total) * 100) : 0
    })

    const progressText = computed(() => (phase.value === 'scanning'
      ? 'Checking TVHeadend, Plex, and the folders…'
      : `Checked ${revealed.value} of ${orderedChecks.value.length}`))

    const ranLabel = computed(() => fmtClockTz(Date.parse(report.value.ranAt)))
    const durationLabel = computed(() => formatSeconds(report.value.durationMs / 1000, 1))

    const pillFor = (status) => DOCTOR_PILLS[status]
    const needsFix = (c) => c.status === 'fail' || c.status === 'warn'
    const docsUrl = (doc) => `${DOCS_BASE}${doc}`

    onMounted(load)
    const stopSectionWatch = watch(routeSection, scrollToRouteSection)
    onUnmounted(() => {
      runId += 1
      stopSectionWatch()
    })

    return {
      report, checking, error, phase, load, groups, rowState, summaryPills,
      progressPercent, progressText, ranLabel, durationLabel, pillFor, needsFix, docsUrl,
    }
  },
}

const ManualOption = {
  props: {
    href: { type: String, default: '' },
    label: { type: String, required: true },
    disabled: { type: Boolean, default: false },
  },
  emits: ['choose'],
  template: `
    <div class="border-t border-hairline pt-3 space-y-1">
      <p class="field-label">Or, by hand</p>
      <p class="text-sm text-ink-dim leading-relaxed">
        <slot />
        <a v-if="href" class="btn-link" :href="href" target="_blank" rel="noopener">{{ label }}</a>
        <button v-else type="button" class="btn-link" :disabled="disabled" @click="$emit('choose')">{{ label }}</button>
      </p>
    </div>
  `,
}

const PlexLibrarySetup = {
  props: {
    plexUrl: { type: String, default: '' },
    plexToken: { type: String, default: '' },
    loads: { type: Number, default: 0 },
  },
  emits: ['created'],
  template: `
    <div v-if="missing.length || statusText" class="md:col-span-2 space-y-3 border-t border-hairline pt-4">
      <template v-if="missing.length">
        <p class="text-ink text-sm leading-relaxed">
          Plex has no library for {{ missingSummary }}. Freetvarr can create {{ missing.length === 1 ? 'it' : 'them' }}. Check each name and folder, then press CREATE LIBRARIES.
        </p>
        <div v-for="lib in missing" :key="lib.kind" class="grid gap-3 md:grid-cols-2">
          <div class="field-row">
            <label class="field-label" :for="'plex-library-name-' + lib.kind">{{ PLEX_LIBRARY_LABELS[lib.kind] }} library name</label>
            <input v-no-autofill :id="'plex-library-name-' + lib.kind" type="text" class="field-input" v-model="lib.name" />
          </div>
          <div class="field-row">
            <label class="field-label" :for="'plex-library-folder-' + lib.kind">Folder <span class="text-ink-mute">(as Plex sees it)</span></label>
            <input v-no-autofill :id="'plex-library-folder-' + lib.kind" type="text" class="field-input" v-model="lib.location" />
          </div>
        </div>
        <p class="text-xs text-ink-mute leading-relaxed">
          Plex can see your files at a different path from Freetvarr. With the Plex in Freetvarr's compose file, the paths are the same. If you installed Plex yourself, enter the path that Plex shows when you add a folder to a library.
        </p>
      </template>
      <div class="flex flex-wrap items-center gap-3">
        <button v-if="missing.length" type="button" class="btn" @click="create" :disabled="creating">
          <template v-if="creating">CREATING…</template><template v-else><plus-icon /> CREATE LIBRARIES</template>
        </button>
        <span v-if="statusText" :class="['status-readout', statusKind]">{{ statusText }}</span>
      </div>
    </div>
  `,
  setup(props, { emit }) {
    const [statusText, statusKind, setStatus] = makeStatus()
    const missing = ref([])
    const creating = ref(false)

    const missingSummary = computed(() => listInWords(missing.value.map((lib) => PLEX_LIBRARY_SUMMARIES[lib.kind])))

    const connection = () => ({
      plex_url: props.plexUrl,
      ...(props.plexToken ? { plex_token: props.plexToken } : {}),
    })

    const loadPlan = async () => {
      const { libraries = [] } = await api('POST', '/api/plex-libraries', connection()).catch(() => ({}))
      missing.value = libraries.filter((lib) => !lib.existing)
    }

    const create = async () => {
      creating.value = true
      setStatus('Creating libraries in Plex…', 'busy', 0)
      try {
        const { results, selected } = await api('POST', '/api/plex-libraries/create', {
          ...connection(),
          libraries: missing.value.map(({ kind, name, location }) => ({ kind, name, location })),
        })
        const failed = results.filter((r) => r.status === 'failed')
        setStatus(plexLibraryOutcome(results), failed.length ? 'err' : 'ok', 0)
        emit('created', selected)
      } catch (err) {
        setStatus(`Create failed: ${err.message}`, 'err', 0)
      } finally {
        creating.value = false
      }
    }

    watch(() => props.loads, loadPlan)

    return { missing, missingSummary, creating, create, statusText, statusKind, PLEX_LIBRARY_LABELS }
  },
}

const PLEX_LIBRARY_LABELS = { tv: 'TV', oneoff: 'One-off', movies: 'Movies' }
const PLEX_LIBRARY_SUMMARIES = { tv: 'TV shows', oneoff: 'one-off recordings', movies: 'movies' }

const listInWords = (items) => {
  if (items.length < 2) return items[0] || ''
  if (items.length === 2) return `${items[0]} or ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, or ${items.at(-1)}`
}

const plexLibraryOutcome = (results) => results
  .map((r) => {
    if (r.status === 'created') return `Created ${r.title}.`
    if (r.status === 'exists') return `${r.location} is already in ${r.title}.`
    return `${r.name || PLEX_LIBRARY_LABELS[r.kind]}: ${r.error}`
  })
  .join(' ')

const ChannelSetupStep = {
  props: {
    tvhUrl: { type: String, default: '' },
  },
  emits: ['state'],
  template: `
    <div class="space-y-4">
      <p v-if="loading && !status" class="status-readout busy">Looking for your tuner…</p>

      <div v-else-if="loadError" class="space-y-2">
        <p class="status-readout err">{{ loadError }}</p>
        <button type="button" class="btn" @click="refresh"><refresh-icon /> CHECK AGAIN</button>
      </div>

      <template v-else-if="status">
        <div v-if="showSteps" class="space-y-3">
          <ol class="space-y-1 text-sm font-mono">
            <li v-for="s in steps" :key="s.id" class="step-row">
              <span class="step-marker">
                <span v-if="s.status === 'running'" class="step-spinner"></span>
                <span v-else :class="['led-dot', 'sm', secureStepDot(s.status)]"></span>
              </span>
              <span :class="s.status === 'pending' ? 'text-ink-mute' : 'text-ink'">
                {{ s.label }}<span v-if="stepDetail(s)" class="text-ink-dim"> · {{ stepDetail(s) }}</span>
              </span>
            </li>
          </ol>
          <p v-if="waitingForTuner" class="status-readout info">
            Waiting for a free tuner. Live TV or a recording is using them; the scan carries on when one is free.
          </p>
          <p v-else-if="scanStarting" class="status-readout busy">
            {{ scanLine }}
          </p>
          <p v-if="result && result.ok" class="status-readout ok">{{ doneText }}</p>
          <p v-if="favouritesText" class="text-sm text-ink">{{ favouritesText }}</p>
          <div v-if="result && !result.ok" class="space-y-2">
            <p class="status-readout err">{{ result.error }}</p>
            <p v-if="result.next" class="text-sm text-ink">{{ result.next }}</p>
            <button type="button" class="btn" @click="restart"><refresh-icon /> TRY AGAIN</button>
          </div>
        </div>

        <div v-else-if="state === 'no-tuner'" class="space-y-4">
          <p v-if="addressSaved" class="status-readout busy">
            Looking for the tuner at {{ addressSaved }}. This can take a minute.
          </p>
          <div v-else class="space-y-2">
            <p class="status-readout err">No TV tuner found yet.</p>
            <p v-if="dockerVm" class="text-sm text-ink">
              Docker on a Mac or Windows PC cannot find a network tuner by itself. Enter the tuner's address below.
            </p>
            <p v-else class="text-sm text-ink">Check that the tuner is on and connected to your network, then press CHECK AGAIN.</p>
            <p v-if="savedAddress" class="text-sm text-ink-dim">TVHeadend looks for a tuner at {{ savedAddress }}.</p>
            <button v-if="!dockerVm" type="button" class="btn" @click="refresh" :disabled="loading">
              <template v-if="loading">CHECKING…</template><template v-else><refresh-icon /> CHECK AGAIN</template>
            </button>
          </div>
          <form v-if="addressOpen" class="space-y-3 border-t border-hairline pt-3" @submit.prevent="saveAddress">
            <div class="grid gap-4 md:grid-cols-2">
              <div class="field-row">
                <label class="field-label" for="tuner-address">Tuner address</label>
                <input v-no-autofill id="tuner-address" v-autofocus type="text" inputmode="decimal" class="field-input" v-model="tunerAddress" placeholder="e.g. 192.168.1.50" />
              </div>
              <div v-if="dockerVm" class="field-row">
                <label class="field-label" for="tuner-host-address">This computer's address</label>
                <input v-no-autofill id="tuner-host-address" type="text" inputmode="decimal" class="field-input" v-model="hostAddress" placeholder="e.g. 192.168.1.20" />
              </div>
            </div>
            <p class="text-xs text-ink-dim">
              Find the tuner's address in your router's list of devices, or in the tuner's own app.<template v-if="dockerVm"> This computer's address is the one other devices on your network use to reach this Mac or PC.<template v-if="hostGuessed"> Freetvarr guessed it from the address in your browser.</template></template>
            </p>
            <button type="submit" class="btn btn-primary" :disabled="savingAddress || Boolean(addressSaved) || !tunerAddress">
              <search-icon /> USE THIS ADDRESS
            </button>
            <p v-if="addressError" class="status-readout err">{{ addressError }}</p>
          </form>
          <button v-else type="button" class="btn-link" @click="addressOpen = true">Enter the tuner's address</button>
        </div>

        <div v-else-if="state === 'unsupported-tuner'" class="space-y-2">
          <p class="text-sm text-ink">Freetvarr cannot set up this kind of tuner yet. Set up its channels in TVHeadend, then press CHECK AGAIN.</p>
          <button type="button" class="btn" @click="refresh"><refresh-icon /> CHECK AGAIN</button>
        </div>

        <div v-else-if="state === 'has-channels' && !editing" class="space-y-2">
          <p class="status-readout ok">TVHeadend already has {{ status.channels }} channels.</p>
          <p class="text-sm text-ink-dim">Press NEXT to keep them. To add channels that are missing, scan again.</p>
          <button type="button" class="btn" @click="editing = true"><search-icon /> SCAN AGAIN</button>
        </div>

        <div v-else class="space-y-4">
          <p class="text-ink text-sm leading-relaxed">
            Freetvarr can scan for channels and add them to TVHeadend. Check the choices below, then press FIND CHANNELS.
          </p>
          <div class="field-row">
            <span class="field-label">Tuners</span>
            <label v-for="t in tuners" :key="t.id" class="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" class="chk" :value="t.id" v-model="tunerIds" />
              {{ t.name }}
            </label>
          </div>
          <div v-if="networks.length" class="field-row">
            <label class="field-label" for="channel-network">TV network</label>
            <select id="channel-network" class="field-input" v-model="networkId">
              <option v-for="n in networks" :key="n.id" :value="n.id">{{ transmitterLabel(n.name) }} (existing)</option>
              <option value="">Scan a transmitter instead</option>
            </select>
          </div>
          <template v-if="!networkId">
            <div class="grid gap-4 md:grid-cols-2">
              <div class="field-row">
                <label class="field-label" for="channel-country">Country</label>
                <select id="channel-country" class="field-input" v-model="country">
                  <option value="">Pick a country</option>
                  <option v-for="c in countries" :key="c.code" :value="c.code">{{ c.name }}</option>
                </select>
              </div>
              <div class="field-row">
                <label class="field-label" for="channel-transmitter">Transmitter</label>
                <select id="channel-transmitter" class="field-input" v-model="transmitterKey" :disabled="!country">
                  <option value="">Pick a transmitter</option>
                  <option v-for="t in countryTransmitters" :key="t.key" :value="t.key">{{ transmitterLabel(t.name) }}</option>
                </select>
              </div>
            </div>
            <p class="text-xs text-ink-dim">
              Pick the transmitter your antenna points at.<template v-if="guessed"> Freetvarr guessed it from your time zone.</template>
            </p>
          </template>
          <p v-if="recordingNow" class="status-readout info">{{ recordingNow }}</p>
          <div class="flex flex-wrap items-center gap-3">
            <button type="button" class="btn btn-primary" @click="apply" :disabled="!ready || starting">
              <search-icon /> FIND CHANNELS
            </button>
          </div>
          <p v-if="applyError" class="status-readout err">{{ applyError }}</p>
          <p class="text-xs text-ink-mute">A scan takes a few minutes. Freetvarr keeps any channels you already have.</p>
          <manual-option v-if="tvhUrl" :href="tvhUrl" label="Open TVHeadend">
            Scan and add channels yourself in TVHeadend, then come back here.
          </manual-option>
        </div>
      </template>
    </div>
  `,
  setup(props, { emit }) {
    const status = ref(null)
    const loading = ref(false)
    const loadError = ref('')
    const editing = ref(false)
    const tunerIds = ref([])
    const networkId = ref('')
    const country = ref('')
    const transmitterKey = ref('')
    const guessed = ref(false)
    const job = ref(null)
    const starting = ref(false)
    const applyError = ref('')
    const tunerAddress = ref('')
    const hostAddress = ref('')
    const hostGuessed = ref(false)
    const addressOpen = ref(false)
    const savingAddress = ref(false)
    const addressError = ref('')
    const addressSaved = ref('')
    let pollTimer = null
    let retryTimer = null
    let retries = 0

    const state = computed(() => status.value?.suggestion?.state || '')
    const dockerVm = computed(() => status.value?.dockerVm || null)
    const savedAddress = computed(() => status.value?.tunerAddress?.address || '')
    const tuners = computed(() => status.value?.tuners?.filter((t) =>
      t.deliverySystem === status.value?.suggestion?.deliverySystem?.id) || [])
    const networks = computed(() => status.value?.networks || [])
    const countries = computed(() => status.value?.suggestion?.countries || [])
    const countryTransmitters = computed(() => (status.value?.transmitters || [])
      .filter((t) => t.country === country.value)
      .sort((a, b) => a.name.localeCompare(b.name)))
    const ready = computed(() => tunerIds.value.length > 0 && Boolean(networkId.value || transmitterKey.value))
    const steps = computed(() => job.value?.steps || [])
    const result = computed(() => job.value?.result || null)
    const running = computed(() => Boolean(job.value?.running))
    const showSteps = computed(() => running.value || Boolean(result.value))
    const runningScan = computed(() => (running.value
      ? steps.value.find((s) => s.id === 'scan' && s.status === 'running')?.detail || null
      : null))
    const waitingForTuner = computed(() => Boolean(runningScan.value?.waitingForTuner))
    const scanStarting = computed(() => Boolean(runningScan.value) && !runningScan.value.scanned)
    const scanLine = computed(() => (runningScan.value?.active
      ? 'Scanning. The first channels can take a few minutes.'
      : 'Starting the scan. The first channels can take a minute.'))
    const channelCount = computed(() => status.value?.channels || 0)
    const recordingNow = computed(() => recordingWarning(status.value?.recordingNow || []))
    const doneText = computed(() => channelsAddedText(result.value))
    const favouritesText = computed(() => defaultFavouritesText(result.value))
    const actionShown = computed(() => {
      if (!status.value || loadError.value || showSteps.value) return false
      if (state.value === 'no-tuner') return addressOpen.value
      return state.value !== 'unsupported-tuner' && (state.value !== 'has-channels' || editing.value)
    })

    watch([running, starting, channelCount, actionShown], () => {
      emit('state', {
        busy: running.value || starting.value,
        channels: channelCount.value,
        actionShown: actionShown.value,
      })
    }, { immediate: true })

    watch(country, (curr, prev) => {
      if (prev !== undefined && prev !== '' && curr !== prev) {
        transmitterKey.value = ''
        guessed.value = false
      }
    })

    const prefill = (suggestion) => {
      tunerIds.value = suggestion?.tunerIds || []
      networkId.value = suggestion?.networkId || ''
      country.value = suggestion?.country || ''
      transmitterKey.value = suggestion?.transmitterKey || ''
      guessed.value = Boolean(suggestion?.transmitterKey)
    }

    const prefillAddress = (r) => {
      if (r.dockerVm) addressOpen.value = true
      if (!tunerAddress.value) tunerAddress.value = r.tunerAddress?.address || ''
      if (hostAddress.value) return
      const guess = browserLanAddress()
      hostAddress.value = r.tunerAddress?.hostAddress || guess
      hostGuessed.value = !r.tunerAddress?.hostAddress && Boolean(guess)
    }

    const refresh = async () => {
      loading.value = true
      loadError.value = ''
      clearTimeout(retryTimer)
      try {
        const r = await api('GET', '/api/tvh-setup/status')
        status.value = r
        if (r.job) job.value = r.job
        if (r.job?.running) startPolling()
        prefill(r.suggestion)
        if (r.suggestion?.state === 'no-tuner') prefillAddress(r)
        else addressSaved.value = ''
        if (r.suggestion?.state === 'no-tuner' && retries < NO_TUNER_RETRIES) {
          retries += 1
          retryTimer = setTimeout(refresh, NO_TUNER_RETRY_MS)
        } else if (addressSaved.value) {
          addressError.value = `No tuner answered at ${addressSaved.value}. Check the address, then press USE THIS ADDRESS again.`
          addressSaved.value = ''
        }
      } catch (err) {
        loadError.value = err.message
      } finally {
        loading.value = false
      }
    }

    const startPolling = () => {
      clearInterval(pollTimer)
      pollTimer = setInterval(async () => {
        const progress = await api('GET', '/api/tvh-setup/progress').catch(() => null)
        if (!progress) return
        job.value = progress
        if (!progress.running) {
          clearInterval(pollTimer)
          if (progress.result?.ok) await refreshCounts()
        }
      }, SETUP_POLL_MS)
    }

    const refreshCounts = async () => {
      const r = await api('GET', '/api/tvh-setup/status').catch(() => null)
      if (r) status.value = r
    }

    const apply = async () => {
      starting.value = true
      applyError.value = ''
      try {
        const r = await api('POST', '/api/tvh-setup/apply', {
          tuner_ids: tunerIds.value,
          network_id: networkId.value || null,
          transmitter_key: networkId.value ? null : transmitterKey.value,
        })
        job.value = { running: true, steps: r.steps, result: null }
        startPolling()
      } catch (err) {
        applyError.value = err.message
      } finally {
        starting.value = false
      }
    }

    const saveAddress = async () => {
      savingAddress.value = true
      addressError.value = ''
      addressSaved.value = ''
      try {
        const r = await api('POST', '/api/tvh-setup/tuner-address', {
          address: tunerAddress.value,
          host_address: dockerVm.value ? hostAddress.value : null,
        })
        addressSaved.value = r.address
        retries = 0
        retryTimer = setTimeout(refresh, TUNER_ADDRESS_CHECK_MS)
      } catch (err) {
        addressError.value = err.message
      } finally {
        savingAddress.value = false
      }
    }

    const restart = () => {
      job.value = null
      editing.value = true
      refresh()
    }

    const stepDetail = (s) => scanOrMapDetail(s)

    onMounted(refresh)
    onUnmounted(() => {
      clearInterval(pollTimer)
      clearTimeout(retryTimer)
    })

    return {
      transmitterLabel, status, loading, loadError, editing, state, tuners, networks, countries, countryTransmitters,
      tunerIds, networkId, country, transmitterKey, guessed, ready, starting, applyError,
      steps, result, showSteps, waitingForTuner, scanStarting, scanLine, doneText, favouritesText, recordingNow,
      dockerVm, savedAddress, tunerAddress, hostAddress, hostGuessed, addressOpen,
      savingAddress, addressError, addressSaved,
      refresh, apply, restart, stepDetail, secureStepDot, saveAddress,
    }
  },
}

const recordingWarning = (recordings) => {
  if (!recordings.length) return ''
  const [first] = recordings
  const until = first.stopMs ? ` until ${fmtClockTz(first.stopMs)}` : ''
  const what = recordings.length === 1 ? first.title : `${recordings.length} programmes`
  return `TVHeadend is recording ${what}${until}. A scan now can cause brief glitches in the recording, so you may want to wait.`
}

const syncFrequency = (cron) => {
  const preset = SYNC_SCHEDULE_PRESETS.find((p) => p.cron === syncSchedulePreset(cron))
  return preset ? preset.label.toLowerCase() : 'on your sync schedule'
}

const channelsAddedText = (result) => {
  const total = result?.channels || 0
  const added = total - (result?.channelsBefore || 0)
  if (added <= 0) return 'Every channel the scan found is already in TVHeadend.'
  if (added === total) return `Added ${total} channels.`
  return `Added ${added} channels. TVHeadend now has ${total}.`
}

const defaultFavouritesText = (result) => {
  const names = (result?.ok && result.favourites || []).map((f) => f.name)
  if (!names.length) return ''
  return `Favourites: ${names.join(', ')}. To change them, press CHANNELS in the TV Guide.`
}

const scanOrMapDetail = (step) => {
  const d = step.detail
  if (!d) return ''
  if (step.id === 'scan') {
    if (!d.frequencies) return 'starting'
    return `${d.scanned} of ${d.frequencies} done`
  }
  if (step.id === 'map') {
    if (!d.total) return 'nothing new to add'
    return `${Math.round(((d.ok + d.fail) / d.total) * 100)}% done`
  }
  return ''
}

const browserLanAddress = () => {
  const host = window.location.hostname
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.startsWith('127.') ? host : ''
}

const SETUP_POLL_MS = 1500
const NO_TUNER_RETRY_MS = 15_000
const NO_TUNER_RETRIES = 3
const TUNER_ADDRESS_CHECK_MS = 5000

const GuideSetupStep = {
  props: {
    tvhUrl: { type: String, default: '' },
  },
  emits: ['state', 'back'],
  template: `
    <div class="space-y-4">
      <p v-if="loading && !status" class="status-readout busy">Reading the TV guide settings…</p>

      <div v-else-if="loadError" class="space-y-2">
        <p class="status-readout err">{{ loadError }}</p>
        <button type="button" class="btn" @click="refresh"><refresh-icon /> CHECK AGAIN</button>
      </div>

      <template v-else-if="suggestion">
        <div v-if="showSteps" class="space-y-3">
          <ol class="space-y-1 text-sm font-mono">
            <li v-for="s in steps" :key="s.id" class="step-row">
              <span class="step-marker">
                <span v-if="s.status === 'running'" class="step-spinner"></span>
                <span v-else :class="['led-dot', 'sm', secureStepDot(s.status)]"></span>
              </span>
              <span :class="s.status === 'pending' ? 'text-ink-mute' : 'text-ink'">
                {{ s.label }}<span v-if="stepDetail(s)" class="text-ink-dim"> · {{ stepDetail(s) }}</span>
              </span>
            </li>
          </ol>
          <template v-if="result && result.ok">
            <div v-if="!result.total" class="space-y-2">
              <p class="status-readout err">There are no channels yet, so there is nothing to link a guide to.</p>
              <button type="button" class="btn" @click="$emit('back')"><arrow-left-icon /> BACK TO CHANNELS</button>
            </div>
            <p v-else class="status-readout ok">{{ result.linked }} of {{ result.total }} channels have a guide.</p>
            <div v-if="result.unmatched.length" class="space-y-3">
              <p class="text-sm text-ink">These channels have no guide yet. Check each pick, or choose No guide. NEXT saves your choices.</p>
              <div v-for="c in result.unmatched" :key="c.id" class="grid gap-2 md:grid-cols-2 items-center">
                <label class="text-sm text-ink" :for="'guide-' + c.id">{{ c.name }}<span v-if="c.number" class="text-ink-dim"> · {{ c.number }}</span></label>
                <guide-combobox :input-id="'guide-' + c.id" v-model="picks[c.id]" :options="result.options"
                  none-label="No guide" :label="'Guide for ' + c.name" />
              </div>
            </div>
          </template>
          <div v-if="result && !result.ok" class="space-y-2">
            <p class="status-readout err">{{ result.error }}</p>
            <p v-if="result.next" class="text-sm text-ink">{{ result.next }}</p>
            <button type="button" class="btn" @click="restart"><refresh-icon /> TRY AGAIN</button>
          </div>
        </div>

        <div v-else-if="!suggestion.channels" class="space-y-2">
          <p class="status-readout err">There are no channels yet, so there is nothing to link a guide to.</p>
          <p class="text-sm text-ink">Go back to CHANNELS and scan for channels first. Then come back here to set up the guide.</p>
          <button type="button" class="btn" @click="$emit('back')"><arrow-left-icon /> BACK TO CHANNELS</button>
        </div>

        <div v-else-if="!suggestion.available" class="space-y-2">
          <p class="text-sm text-ink">This TVHeadend cannot download a guide from an address. It uses the guide that comes with the broadcast. Press NEXT.</p>
        </div>

        <div v-else-if="suggestion.state === 'has-guide' && !editing" class="space-y-2">
          <p class="status-readout ok">{{ suggestion.linked }} of {{ suggestion.channels }} channels have a guide.</p>
          <p class="text-sm text-ink-dim break-all">Guide address: {{ suggestion.url }}</p>
          <p class="text-sm text-ink-dim">Press NEXT to keep it. To link channels that have no guide, or to change the address, set it up again.</p>
          <button type="button" class="btn" @click="editing = true"><refresh-icon /> SET UP AGAIN</button>
        </div>

        <div v-else class="space-y-4">
          <p class="text-ink text-sm leading-relaxed">
            A guide feed gives Freetvarr a week of listings with episode numbers, so it can record a show by name.
          </p>
          <div v-if="suggestion.feeds.length" class="field-row">
            <label class="field-label" for="guide-feed">Guide</label>
            <select id="guide-feed" class="field-input" v-model="choice">
              <option value="">Pick a region</option>
              <option v-for="f in suggestion.feeds" :key="f.url" :value="f.url">{{ f.region }}</option>
              <option :value="OTHER">Another address</option>
            </select>
          </div>
          <p v-else class="text-sm text-ink-dim">
            Freetvarr has no free guide feed for your country yet. TVHeadend uses the guide that comes with the broadcast. If you have an XMLTV guide address, enter it below.
          </p>
          <div v-if="!suggestion.feeds.length || choice === OTHER" class="field-row">
            <label class="field-label" for="guide-url">Guide address (XMLTV)</label>
            <input v-no-autofill id="guide-url" v-autofocus type="text" class="field-input" v-model="customUrl" placeholder="https://example.com/epg.xml" />
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button type="button" class="btn btn-primary" @click="apply" :disabled="!url || starting">
              <tv-icon /> SET UP GUIDE
            </button>
          </div>
          <p v-if="applyError" class="status-readout err">{{ applyError }}</p>
          <p v-if="suggestion.linked" class="text-xs text-ink-mute">Freetvarr keeps the guide links you already have.</p>
          <manual-option v-if="tvhUrl" :href="tvhUrl" label="Open TVHeadend">
            Load a guide yourself in TVHeadend, then come back here.
          </manual-option>
        </div>
      </template>
    </div>
  `,
  setup(props, { emit }) {
    const OTHER = 'other'
    const status = ref(null)
    const loading = ref(false)
    const loadError = ref('')
    const editing = ref(false)
    const choice = ref('')
    const customUrl = ref('')
    const job = ref(null)
    const starting = ref(false)
    const applyError = ref('')
    const picks = reactive({})
    let pollTimer = null

    const suggestion = computed(() => status.value?.suggestion || null)
    const url = computed(() => (choice.value && choice.value !== OTHER ? choice.value : customUrl.value.trim()))
    const steps = computed(() => job.value?.steps || [])
    const result = computed(() => job.value?.result || null)
    const running = computed(() => Boolean(job.value?.running))
    const showSteps = computed(() => running.value || Boolean(result.value))
    const linked = computed(() => (result.value?.ok ? result.value.linked : suggestion.value?.linked || 0))
    const pickedCount = computed(() => Object.values(picks).filter(Boolean).length)

    watch([running, starting, linked, pickedCount], () => {
      emit('state', { busy: running.value || starting.value, linked: linked.value, pending: pickedCount.value })
    }, { immediate: true })

    watch(() => result.value?.unmatched, (unmatched) => {
      for (const c of unmatched || []) if (!(c.id in picks)) picks[c.id] = c.guess || ''
    }, { immediate: true })

    const prefill = (s) => {
      const known = (s?.feeds || []).some((f) => f.url === s?.url)
      choice.value = known ? s.url : s?.url ? OTHER : ''
      customUrl.value = known ? '' : s?.url || ''
    }

    const refresh = async () => {
      loading.value = true
      loadError.value = ''
      try {
        const r = await api('GET', '/api/tvh-guide/status')
        status.value = r
        if (r.job) job.value = r.job
        if (r.job?.running) startPolling()
        prefill(r.suggestion)
      } catch (err) {
        loadError.value = err.message
      } finally {
        loading.value = false
      }
    }

    const startPolling = () => {
      clearInterval(pollTimer)
      pollTimer = setInterval(async () => {
        const progress = await api('GET', '/api/tvh-guide/progress').catch(() => null)
        if (!progress) return
        job.value = progress
        if (!progress.running) clearInterval(pollTimer)
      }, SETUP_POLL_MS)
    }

    const apply = async () => {
      starting.value = true
      applyError.value = ''
      try {
        const r = await api('POST', '/api/tvh-guide/apply', { url: url.value })
        job.value = { running: true, steps: r.steps, result: null }
        startPolling()
      } catch (err) {
        applyError.value = err.message
      } finally {
        starting.value = false
      }
    }

    const saveLinks = async () => {
      if (!pickedCount.value) return
      const links = Object.entries(picks).filter(([, g]) => g).map(([channel_id, guide_id]) => ({ channel_id, guide_id }))
      await api('POST', '/api/tvh-guide/links', { links })
      for (const { channel_id } of links) delete picks[channel_id]
      const progress = await api('GET', '/api/tvh-guide/progress').catch(() => null)
      if (progress) job.value = progress
    }

    const restart = () => {
      job.value = null
      editing.value = true
      refresh()
    }

    const stepDetail = (s) => (s.id === 'download' && s.detail?.expected
      ? `${s.detail.found} of ${s.detail.expected} guide channels loaded`
      : '')

    onMounted(refresh)
    onUnmounted(() => clearInterval(pollTimer))

    return {
      OTHER, status, loading, loadError, editing, suggestion, choice, customUrl, url,
      steps, result, showSteps, starting, applyError, picks, pickedCount,
      refresh, apply, saveLinks, restart, stepDetail, secureStepDot,
    }
  },
}

const WelcomeView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-title">{{ stepTitle }} · STEP {{ step }} / {{ totalSteps }}</span>
          <button v-if="step < totalSteps" type="button" class="btn-link link-arrow" @click="skipToSettings">FINISH LATER <arrow-right-icon /></button>
        </header>
        <div class="panel-body space-y-4">

          <div v-if="step === 1" class="space-y-4">
            <p class="text-ink text-base leading-relaxed">
              Freetvarr gives you a TV guide, records shows and series, and lets you watch live and recorded TV on any screen. Recordings are saved into your media library.
            </p>
            <p class="text-ink-dim text-sm leading-relaxed">
              Setup takes about two minutes. The only step you must finish is connecting to TVHeadend, the program that runs your tuner. Plex is optional.
            </p>
            <p v-if="hasExistingConfig" class="text-xs font-mono text-plex-yellow">
              <span class="led-dot sm bg-plex-yellow align-middle mr-1"></span> RETURN VISIT: your existing settings are prefilled. Leave a field as-is to keep its stored value; stored secrets show as <code>••••• (stored)</code>.
            </p>
            <time-zone-field v-model="timeZone" :source="tzSource" hint />
          </div>

          <div v-if="step === 2" class="space-y-4">
            <p class="text-ink text-sm leading-relaxed">
              Freetvarr needs the address of your TVHeadend server.
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="detectTvh()" :disabled="tvhDetecting">
                <template v-if="tvhDetecting && !tvhAutoScanning">SCANNING…</template><template v-else><search-icon /> AUTO-DISCOVER TVHEADEND</template>
              </button>
              <span v-if="tvhDiscoverText"
                :class="['status-readout', tvhDiscoverKind]">{{ tvhDiscoverText }}</span>
            </div>
            <div v-if="tvhCandidates.length > 1" class="space-y-2">
              <p class="text-sm text-ink-dim">Several TVHeadend servers answered. Pick one:</p>
              <ul class="space-y-2">
                <li v-for="c in tvhCandidates" :key="c.url">
                  <button type="button" class="btn" @click="useTvhCandidate(c)">
                    Use {{ c.url }}
                  </button>
                </li>
              </ul>
            </div>
            <div class="field-row">
              <label class="field-label">TVHeadend URL</label>
              <input v-no-autofill type="text" class="field-input" v-model="tvhUrl" placeholder="e.g. http://192.168.1.10:9981" />
            </div>
            <div v-if="showSecure && !secureStepsVisible" class="space-y-4">
              <p class="text-ink text-sm leading-relaxed">
                <strong class="text-signal-orange">This TVHeadend has no logins yet</strong>, so anyone on your network can change it. Freetvarr can secure it: it makes an admin login for you and a separate login for itself, then turns off the open access.
              </p>
              <div class="grid gap-4 md:grid-cols-2">
                <div class="field-row">
                  <label class="field-label">Admin username</label>
                  <input v-no-autofill type="text" class="field-input" v-model="secureAdminUsername" :disabled="securing" />
                </div>
                <div class="field-row">
                  <label class="field-label">Admin password</label>
                  <div class="flex items-center gap-2">
                    <input v-no-autofill.new-password ref="secureAdminPasswordInput" :type="secureShowPassword ? 'text' : 'password'" class="field-input" v-model="secureAdminPassword" :disabled="securing" />
                    <button type="button" class="btn btn-sm btn-icon" @click="secureShowPassword = !secureShowPassword" :aria-label="secureShowPassword ? 'Hide password' : 'Show password'" :aria-pressed="secureShowPassword"><eye-off-icon v-if="secureShowPassword" /><eye-icon v-else /></button>
                  </div>
                </div>
              </div>
              <div class="field-row">
                <label class="field-label">Allowed networks</label>
                <input v-no-autofill type="text" class="field-input" v-model="securePrefixes" :disabled="securing" placeholder="e.g. 192.168.1.0/24, 127.0.0.0/8" />
                <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                  Both logins work only from these networks. Freetvarr guessed them from this computer's networks and this browser's network; add any network you sign in to TVHeadend from.
                </p>
              </div>
              <p class="text-xs text-ink-mute leading-relaxed">
                Keep the admin password somewhere safe: you sign in to TVHeadend with it, and Freetvarr does not store it. Freetvarr signs in as <code>freetvarr</code> with a random password it keeps for itself.
              </p>
              <div class="flex flex-wrap items-center gap-3">
                <button type="button" class="btn btn-primary" @click="secureTvh" :disabled="securing || !secureReady">
                  <template v-if="securing">SECURING…</template><template v-else>SECURE TVHEADEND AND CONNECT FREETVARR</template>
                </button>
                <span v-if="secureInputProblem" class="text-xs text-signal-yellow font-mono">{{ secureInputProblem }}</span>
              </div>
              <manual-option label="Enter a login instead" :disabled="securing" @choose="useManualLogin">
                Make your own TVHeadend logins, then give Freetvarr the one you made for it.
              </manual-option>
            </div>
            <ol v-if="secureStepsVisible" class="space-y-1 text-sm font-mono">
              <li v-for="s in secureShownSteps" :key="s.id" class="step-row">
                <span class="step-marker">
                  <span v-if="s.status === 'running'" class="step-spinner"></span>
                  <span v-else :class="['led-dot', 'sm', secureStepDot(s.status)]"></span>
                </span>
                <span :class="s.status === 'pending' ? 'text-ink-mute' : 'text-ink'">{{ s.label }}</span>
              </li>
            </ol>
            <div v-if="secureError" class="space-y-1">
              <p class="status-readout err">{{ secureError }}</p>
              <p v-if="secureNext" class="text-sm text-ink">{{ secureNext }}</p>
              <button v-if="showSecure && !securing" type="button" class="btn btn-sm" @click="backToSecureForm">
                BACK TO THE FORM
              </button>
            </div>
            <p v-if="securedAs" class="status-readout ok">
              TVHeadend is secured. Sign in to TVHeadend as {{ securedAs }} from now on; Freetvarr signs in as freetvarr.
            </p>
            <template v-if="!showSecure">
              <p v-if="!securedAs" class="text-ink-dim text-sm leading-relaxed">
                Enter the TVHeadend login Freetvarr should use. Leave both blank if TVHeadend allows anonymous access.
              </p>
              <div class="grid gap-4 md:grid-cols-2">
                <div class="field-row">
                  <label class="field-label">Username</label>
                  <input v-no-autofill type="text" class="field-input" v-model="tvhUsername" v-autofocus="manualLogin" />
                </div>
                <div class="field-row">
                  <label class="field-label">Password</label>
                  <input v-no-autofill type="password" class="field-input" v-model="tvhPassword"
                    :placeholder="tvhPasswordSet ? '••••• (stored)' : ''" autocomplete="off" />
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <button type="button" class="btn" @click="testTvh" :disabled="tvhTesting">
                  <template v-if="tvhTesting">TESTING…</template><template v-else><pulse-icon /> TEST CONNECTION</template>
                </button>
                <span v-if="tvhText" :class="['status-readout', tvhKind]">{{ tvhText }}</span>
              </div>
            </template>
          </div>

          <channel-setup-step v-if="step === 3" :tvh-url="tvhUrl" @state="channelState = $event" />

          <guide-setup-step v-if="step === 4" :tvh-url="tvhUrl" ref="guideStep" @state="guideState = $event" @back="step = 3" />

          <div v-if="step === 5" class="space-y-4">
            <p v-if="storageChecking" class="status-readout busy">Checking the folders…</p>
            <template v-else-if="storageChecked">
              <template v-if="!storageProblems.length">
                <p class="text-ink text-sm leading-relaxed">{{ storageSummary }}</p>
                <p class="status-readout ok">The folder checks passed.</p>
              </template>
              <div v-for="p in storageProblems" :key="p.text" class="space-y-1">
                <p class="status-readout err">{{ p.text }}</p>
                <p class="text-sm text-ink leading-relaxed">{{ p.fix }}</p>
              </div>
              <p v-for="note in storageNotes" :key="note" class="status-readout info">{{ note }}</p>
              <button v-if="storageProblems.length" type="button" class="btn btn-sm" @click="checkStorage">
                <refresh-icon /> CHECK AGAIN
              </button>
            </template>
            <details class="settings-disclosure" :open="storageAdvancedOpen" @toggle="storageAdvancedOpen = $event.target.open">
              <summary @click="focusFirstFieldOnOpen">Advanced: change folders</summary>
              <div class="settings-disclosure-body space-y-4">
                <p class="text-xs text-ink-mute leading-relaxed">
                  Enter each folder as the app sees it inside its container, from the <code>volumes</code> in <code>docker-compose.yml</code>. If you change a folder there, change it here too. The data folder is the one that <code>DATA_PATH</code> sets in <code>.env</code>.
                </p>
                <div class="field-row">
                  <label class="field-label">TV library folder</label>
                  <input v-no-autofill type="text" class="field-input" v-model="mediaRoot" @input="clearStaleLibraryStatus" placeholder="/data/media/tv" />
                  <div class="flex flex-wrap items-center gap-3 mt-2">
                    <button type="button" class="btn btn-sm" @click="testMediaRoot" :disabled="mediaRootTesting">
                      <template v-if="mediaRootTesting">TESTING…</template><template v-else><pulse-icon /> TEST PATH</template>
                    </button>
                    <span v-if="mediaRootStatus" :class="['status-readout', mediaRootStatusKind]">{{ mediaRootStatus }}</span>
                  </div>
                </div>
                <div class="grid gap-4 md:grid-cols-2">
                  <div class="field-row">
                    <label class="field-label">Recordings folder (as Freetvarr sees it)</label>
                    <input v-no-autofill type="text" class="field-input" v-model="recordingsRoot" @input="recordingsCheck.clear" placeholder="/data/recordings" />
                    <div class="flex flex-wrap items-center gap-3 mt-2">
                      <button type="button" class="btn btn-sm" @click="recordingsCheck.run" :disabled="recordingsCheck.checking">
                        <template v-if="recordingsCheck.checking">CHECKING…</template><template v-else><pulse-icon /> TEST PATH</template>
                      </button>
                      <span v-if="recordingsCheck.text" :class="['status-readout', recordingsCheck.kind]">{{ recordingsCheck.text }}</span>
                    </div>
                  </div>
                  <div class="field-row">
                    <label class="field-label">Recordings folder (as TVHeadend sees it)</label>
                    <input v-no-autofill type="text" class="field-input" v-model="tvhRecordingsPath" @input="tvhPathCheck.clear" placeholder="/recordings" />
                    <div class="flex flex-wrap items-center gap-3 mt-2">
                      <button type="button" class="btn btn-sm" @click="tvhPathCheck.run" :disabled="tvhPathCheck.checking">
                        <template v-if="tvhPathCheck.checking">CHECKING…</template><template v-else><pulse-icon /> CHECK TVHEADEND</template>
                      </button>
                      <span v-if="tvhPathCheck.text" :class="['status-readout', tvhPathCheck.kind]">{{ tvhPathCheck.text }}</span>
                    </div>
                  </div>
                </div>
                <p class="text-xs text-ink-mute leading-relaxed">
                  TVHeadend and Freetvarr share the recordings folder. Each can see it at a different path.
                </p>
              </div>
            </details>
          </div>

          <div v-if="step === 6" class="space-y-4">
            <p v-if="plexChecking" class="status-readout busy">Looking for Plex…</p>
            <template v-else-if="plexConnected">
              <p class="text-ink text-sm leading-relaxed">Connected to <strong class="text-plex-yellow">Plex</strong> at {{ plexUrl }}.</p>
              <div v-if="plexShowSections.length" class="field-row">
                <label class="field-label" for="wizard-plex-tv-library">TV library</label>
                <select id="wizard-plex-tv-library" class="field-input" v-model="plexSectionId">
                  <option value="">Pick a library</option>
                  <option v-for="sec in plexShowSections" :key="sec.key" :value="sec.key">{{ sec.title }}</option>
                </select>
                <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                  After each sync, Freetvarr asks Plex to refresh this library.
                </p>
              </div>
            </template>
            <div v-else-if="plexCandidates.length > 1" class="space-y-2">
              <p class="text-sm text-ink-dim">Freetvarr found more than one Plex server. Pick yours:</p>
              <ul class="space-y-2">
                <li v-for="c in plexCandidates" :key="c.ip + ':' + c.port">
                  <button type="button" class="btn" @click="usePlexCandidate(c)">
                    Use {{ c.name || 'Plex' }} ({{ c.ip }}:{{ c.port }})
                  </button>
                </li>
              </ul>
            </div>
            <div v-else-if="plexProblem" class="space-y-2">
              <p class="status-readout err">{{ plexProblem.text }}</p>
              <p class="text-sm text-ink leading-relaxed">{{ plexProblem.fix }} <a :href="plexDocsUrl" target="_blank" rel="noopener noreferrer">Plex setup</a> has the details.</p>
              <button type="button" class="btn btn-sm" @click="findPlex"><refresh-icon /> CHECK AGAIN</button>
            </div>
            <template v-else>
              <p class="text-ink text-sm leading-relaxed">
                Freetvarr works without Plex. Recordings still go into your TV library folder for any media player.
              </p>
              <p class="text-ink-dim text-sm leading-relaxed">
                To add Plex, see <a :href="plexDocsUrl" target="_blank" rel="noopener noreferrer">Plex setup</a>.
              </p>
            </template>
            <plex-library-setup v-if="!plexChecking" :plex-url="plexUrl" :plex-token="plexToken" :loads="plexSectionLoads"
              @created="usePlexLibraries" />
            <details class="settings-disclosure" :open="plexAdvancedOpen" @toggle="plexAdvancedOpen = $event.target.open">
              <summary @click="focusFirstFieldOnOpen">Advanced: connect Plex by hand</summary>
              <div class="settings-disclosure-body space-y-4">
                <div class="field-row">
                  <label class="field-label">Plex address</label>
                  <input v-no-autofill type="text" class="field-input" v-model="plexUrl" placeholder="e.g. http://192.168.1.10:32400" @input="plexEditedByHand = true" />
                </div>
                <div class="field-row">
                  <label class="field-label">Plex token</label>
                  <input v-no-autofill type="password" class="field-input" v-model="plexToken" @input="plexEditedByHand = true"
                    :placeholder="plexTokenSet ? '••••• (stored)' : 'paste your Plex token'" autocomplete="off" />
                  <div class="mt-2 flex flex-wrap items-center gap-3">
                    <button type="button" class="btn btn-sm" @click="detectPlexToken" :disabled="plexDetectingToken">
                      <template v-if="plexDetectingToken">DETECTING…</template><template v-else><bolt-icon /> AUTO-DETECT TOKEN</template>
                    </button>
                    <span v-if="plexTokenStatus" :class="['status-readout', plexTokenStatusKind]">{{ plexTokenStatus }}</span>
                  </div>
                  <p class="text-xs text-ink-mute mt-2 leading-relaxed">
                    AUTO-DETECT TOKEN reads the token from Plex's settings file. It works with the Plex in Freetvarr's compose file. For another Plex, enter the path to its <code>Preferences.xml</code> below, or paste the token from Plex.
                  </p>
                </div>
                <div class="field-row">
                  <label class="field-label">Preferences.xml path <span class="text-ink-mute">(as Freetvarr sees it)</span></label>
                  <input v-no-autofill type="text" class="field-input" v-model="plexPrefsPath" @input="plexEditedByHand = true"
                    placeholder="/plex/Library/Application Support/Plex Media Server/Preferences.xml" />
                </div>
                <div v-if="!plexShowSections.length" class="field-row">
                  <label class="field-label">TV library number</label>
                  <input v-no-autofill type="text" class="field-input" v-model="plexSectionId" @input="plexEditedByHand = true"
                    placeholder="CONNECT lists your libraries" />
                </div>
                <div class="flex flex-wrap items-center gap-3">
                  <button type="button" class="btn" @click="loadPlexSections()" :disabled="plexProbing || !plexUrl.trim()">
                    <template v-if="plexProbing">CONNECTING…</template><template v-else><pulse-icon /> CONNECT</template>
                  </button>
                  <span v-if="plexSectionsText"
                    :class="['status-readout', plexSectionsKind]">{{ plexSectionsText }}</span>
                </div>
              </div>
            </details>
          </div>

          <div v-if="step === 7" class="space-y-4">
            <p v-if="!readySkipped.length" class="text-ink text-base leading-relaxed">
              <span class="led-dot sm bg-plex-yellow align-middle mr-1"></span> Setup is done. Freetvarr is ready to record.
            </p>
            <div v-else class="space-y-2">
              <p class="text-ink text-base leading-relaxed">Setup is not finished yet.</p>
              <ul class="space-y-1 text-sm text-ink-dim">
                <li v-for="item in readySkipped" :key="item.step">
                  {{ item.text }}
                  <button type="button" class="btn-link" @click="step = item.step">{{ item.action }}</button>
                </li>
              </ul>
            </div>
            <p class="text-ink-dim text-sm leading-relaxed">
              Next: open the <strong class="text-ink">TV Guide</strong>, pick a programme, and press <strong class="text-ink">RECORD</strong> or <strong class="text-ink">RECORD SERIES</strong>. Freetvarr checks for finished recordings {{ syncFrequencyText }} and adds them to your library. You can change how often in Settings.
            </p>
            <p class="text-ink-dim text-sm leading-relaxed">
              To check the whole setup, <a href="#/doctor">run the Doctor</a>. It checks {{ plexIsSetUp ? 'TVHeadend, Plex, and the folders' : 'TVHeadend and the folders' }} and lists anything to fix.
            </p>
          </div>

        </div>
        <div class="panel-body border-t border-hairline flex items-center justify-between gap-3 pt-4">
          <button type="button" class="btn" @click="back" :disabled="step === 1 || saving"><arrow-left-icon /> BACK</button>
          <div class="flex items-center gap-3">
            <span v-if="saveStatusText"
              :class="['status-readout', saveStatusKind]">{{ saveStatusText }}</span>
            <span v-else-if="!canAdvance" class="text-xs text-signal-yellow font-mono">{{ advanceHint }}</span>
            <button type="button" :class="['btn', { 'btn-primary': nextIsPrimary }]" @click="next" :disabled="!canAdvance || saving">
              {{ nextLabel }} <arrow-right-icon />
            </button>
          </div>
        </div>
      </section>
    </div>
  `,
  setup() {
    const [plexSectionsText, plexSectionsKind, setPlexSections] = makeStatus()
    const [tvhText, tvhKind, setTvhText] = makeStatus()
    const [saveStatusText, saveStatusKind, setSaveStatus, clearSaveStatus] = makeStatus()
    const step = ref(1)
    const totalSteps = 7
    const STEP_TITLES = {
      1: 'WELCOME',
      2: 'TVHEADEND',
      3: 'CHANNELS',
      4: 'GUIDE',
      5: 'STORAGE',
      6: 'PLEX',
      7: 'READY',
    }
    const stepTitle = computed(() => STEP_TITLES[step.value] || 'WELCOME')
    const saving = ref(false)

    const tvhUrl = ref('')
    const tvhUsername = ref('')
    const tvhPassword = ref('')
    const tvhPasswordSet = ref(false)
    const tvhTesting = ref(false)
    const tvhConnected = ref(false)
    const recordingsRoot = ref('')
    const tvhRecordingsPath = ref('')
    const recordingsCheck = usePathCheck(() => recordingsFolderStatus({
      path: recordingsRoot.value,
      mediaRoot: mediaRoot.value,
    }))
    const tvhPathCheck = usePathCheck(() => tvhRecordingsPathStatus({
      path: tvhRecordingsPath.value,
      fill: (value) => (tvhRecordingsPath.value = value),
    }))

    const timeZone = ref(browserTimeZone())
    const tzSource = ref('system')

    const plexUrl = ref('')
    const plexToken = ref('')
    const plexSectionId = ref('')
    const plexSections = ref([])
    const plexProbing = ref(false)
    const plexCandidates = ref([])
    const plexDetectingToken = ref(false)
    const plexTokenStatus = ref('')
    const plexTokenStatusKind = ref('ok')
    const plexPrefsPath = ref('')
    const plexSectionLoads = ref(0)

    const setPlexTokenStatus = (msg, kind = 'ok', ms = FLASH_DEFAULT_MS) => {
      plexTokenStatus.value = msg
      plexTokenStatusKind.value = kind
      if (ms > 0) setTimeout(() => (plexTokenStatus.value = ''), ms)
    }

    const plexTokenSet = ref(false)

    const mediaRoot = ref('')
    const mediaRootTesting = ref(false)
    const mediaRootStatus = ref('')
    const mediaRootStatusKind = ref('ok')

    const saved = reactive({
      mediaRoot: '', recordingsRoot: '', tvhRecordingsPath: '', plexUrl: '', plexSectionId: '', plexPrefsPath: '',
    })
    const syncCron = ref(DEFAULT_SYNC_CRON)
    const syncFrequencyText = computed(() => syncFrequency(syncCron.value))

    const hasExistingConfig = computed(() =>
      Boolean(tvhUrl.value || tvhPasswordSet.value || saved.plexUrl || plexTokenSet.value || saved.plexSectionId),
    )

    onMounted(async () => {
      const s = await api('GET', '/api/settings').catch(() => ({}))
      tvhUrl.value = s.tvh_url || ''
      tvhConnected.value = Boolean(s.tvh_url)
      tvhUsername.value = s.tvh_username || ''
      tvhPasswordSet.value = Boolean(s.tvh_password_set)
      syncCron.value = s.sync_cron_effective || DEFAULT_SYNC_CRON
      tzSource.value = s.tz_source || 'system'
      timeZone.value = s.time_zone || s.tz_env || browserTimeZone() || s.tz || 'UTC'
      recordingsRoot.value = s.recordings_root || ''
      tvhRecordingsPath.value = s.tvh_recordings_path || ''
      mediaRoot.value = s.media_root || ''
      plexUrl.value = s.plex_url || ''
      plexTokenSet.value = Boolean(s.plex_token_set)
      plexSectionId.value = s.plex_tv_section_id || ''
      plexPrefsPath.value = s.plex_prefs_path || ''
      Object.assign(saved, {
        mediaRoot: mediaRoot.value,
        recordingsRoot: recordingsRoot.value,
        tvhRecordingsPath: tvhRecordingsPath.value,
        plexUrl: plexUrl.value,
        plexSectionId: plexSectionId.value,
        plexPrefsPath: plexPrefsPath.value,
      })
    })

    const showMediaRootResult = (r) => {
      mediaRootStatus.value = r.ok ? `${r.path} is writable.` : r.error
      mediaRootStatusKind.value = r.ok ? 'ok' : 'err'
    }

    const testMediaRoot = async () => {
      mediaRootTesting.value = true
      mediaRootStatus.value = ''
      try {
        showMediaRootResult(await api('POST', '/api/media-root-test', { path: mediaRoot.value }))
      } catch (err) {
        mediaRootStatus.value = `Test failed: ${err.message}`
        mediaRootStatusKind.value = 'err'
      } finally {
        mediaRootTesting.value = false
      }
    }

    const storageChecking = ref(false)
    const storageChecked = ref(false)
    const storageProblems = ref([])
    const storageNotes = ref([])
    const storageAdvancedOpen = ref(false)
    const storageSummary = computed(() => storageSummaryText({
      mediaRoot: mediaRoot.value,
      recordingsRoot: recordingsRoot.value,
    }))
    const storageChanges = computed(() => changedSettings([
      ['media_root', mediaRoot.value, saved.mediaRoot],
      ['recordings_root', recordingsRoot.value, saved.recordingsRoot],
      ['tvh_recordings_path', tvhRecordingsPath.value, saved.tvhRecordingsPath],
    ]))

    const clearStaleLibraryStatus = () => {
      mediaRootStatus.value = ''
      recordingsCheck.clear()
    }

    const checkStorage = async () => {
      storageChecking.value = true
      mediaRootTesting.value = true
      mediaRootStatus.value = 'Checking…'
      mediaRootStatusKind.value = 'busy'
      recordingsCheck.begin()
      tvhPathCheck.begin()
      const folders = {
        mediaRoot: mediaRoot.value,
        recordingsRoot: recordingsRoot.value,
        tvhRecordingsPath: tvhRecordingsPath.value,
      }
      const [library, recordings, tvh] = await Promise.all([
        api('POST', '/api/media-root-test', { path: folders.mediaRoot }).catch(failedCheck),
        api('POST', '/api/recordings-root-test', { path: folders.recordingsRoot, media_root: folders.mediaRoot })
          .catch(failedCheck),
        api('POST', '/api/tvh-recordings-path-check', { path: folders.tvhRecordingsPath }).catch(failedCheck),
      ])
      if (tvh.ok && !tvh.configured && tvh.tvhPath) tvhRecordingsPath.value = tvh.tvhPath
      showMediaRootResult(library)
      mediaRootTesting.value = false
      recordingsCheck.show(describeRecordingsFolder(recordings))
      tvhPathCheck.show(describeTvhRecordingsPath({ r: tvh, fill: (value) => (tvhRecordingsPath.value = value) }))
      const outcome = storageCheckOutcome({ folders, library, recordings, tvh })
      storageProblems.value = outcome.problems
      storageNotes.value = outcome.notes
      storageAdvancedOpen.value = outcome.problems.length > 0
      storageChecked.value = true
      storageChecking.value = false
    }

    const plexChecking = ref(false)
    const plexConnected = ref(false)
    const plexProblem = ref(null)
    const plexAdvancedOpen = ref(false)
    const plexEditedByHand = ref(false)
    const plexDocsUrl = `${DOCS_BASE}guide/plex`
    const plexShowSections = computed(() => plexSections.value.filter((sec) => sec.type === 'show'))
    const hasPlexToken = () => Boolean(plexToken.value || plexTokenSet.value)

    let sectionAutoLoadTimer = null
    watch([plexUrl, plexToken], ([url, token]) => {
      plexConnected.value = false
      clearTimeout(sectionAutoLoadTimer)
      if (!url || !token || plexChecking.value) return
      sectionAutoLoadTimer = setTimeout(() => loadPlexSections({ silent: true }), 600)
    })

    const channelState = ref({ busy: false, channels: 0, actionShown: false })
    const guideStep = ref(null)
    const guideState = ref({ busy: false, linked: 0, pending: 0 })

    const readySkipped = computed(() => {
      if (!channelState.value.channels) {
        return [{
          step: 3,
          text: 'No channels yet. The TV Guide stays empty until you scan for channels.',
          action: 'GO TO CHANNELS',
        }]
      }
      if (!guideState.value.linked) {
        return [{
          step: 4,
          text: 'No guide linked yet. Freetvarr cannot record a show by name without one.',
          action: 'GO TO GUIDE',
        }]
      }
      return []
    })

    const canAdvance = computed(() => {
      if (step.value === 2) return Boolean(tvhUrl.value.trim()) && !showSecure.value
      if (step.value === 3) return !channelState.value.busy
      if (step.value === 4) return !guideState.value.busy
      return true
    })

    const advanceHint = computed(() => {
      if (step.value === 3) return 'Wait for the channel setup to finish.'
      if (step.value === 4) return 'Wait for the guide setup to finish.'
      return tvhUrl.value.trim()
        ? 'Secure TVHeadend first, or choose to set up users yourself.'
        : 'A TVHeadend URL is required to continue.'
    })

    const plexWillSave = computed(() => plexConnected.value || plexEditedByHand.value)
    const plexIsSetUp = computed(() => plexWillSave.value || Boolean(saved.plexUrl))

    const nextLabel = computed(() => {
      if (step.value === totalSteps) return 'OPEN TV GUIDE'
      if (step.value === 2) return 'SAVE & NEXT'
      if (step.value === 3) return channelState.value.channels ? 'NEXT' : 'SKIP'
      if (step.value === 4) {
        if (guideState.value.pending) return 'SAVE & NEXT'
        return guideState.value.linked ? 'NEXT' : 'SKIP'
      }
      if (step.value === 5) return Object.keys(storageChanges.value).length ? 'SAVE & NEXT' : 'NEXT'
      if (step.value === 6) {
        if (plexConnected.value) return 'NEXT'
        return plexEditedByHand.value ? 'SAVE & NEXT' : 'SKIP'
      }
      return 'NEXT'
    })

    const nextIsPrimary = computed(() => {
      if (step.value === 3) return channelState.value.channels > 0 && !channelState.value.actionShown
      if (step.value === 4) return nextLabel.value !== 'SKIP'
      return true
    })

    const dismiss = () => {
      try { localStorage.setItem(WELCOME_DISMISSED_KEY, '1') } catch { /* private mode */ }
    }

    const skipToSettings = () => {
      if (!confirm(wizardSkipPrompt({ tvhConnected: tvhConnected.value }))) return
      dismiss()
      window.location.hash = '#/settings'
    }

    const back = () => {
      if (step.value > 1) {
        clearSaveStatus()
        step.value--
      }
    }

    const saveStorage = async () => {
      if (!Object.keys(storageChanges.value).length) return
      await api('POST', '/api/settings', storageChanges.value)
      Object.assign(saved, {
        mediaRoot: mediaRoot.value,
        recordingsRoot: recordingsRoot.value,
        tvhRecordingsPath: tvhRecordingsPath.value,
      })
    }

    const savePlex = async () => {
      if (!plexWillSave.value) return
      const body = {
        plex_url: plexUrl.value,
        plex_tv_section_id: plexSectionId.value,
        ...changedSettings([['plex_prefs_path', plexPrefsPath.value, saved.plexPrefsPath]]),
        ...(plexToken.value ? { plex_token: plexToken.value } : {}),
      }
      await api('POST', '/api/settings', body)
      Object.assign(saved, {
        plexUrl: plexUrl.value,
        plexSectionId: plexSectionId.value,
        plexPrefsPath: plexPrefsPath.value,
      })
    }

    const next = async () => {
      if (step.value === totalSteps) {
        dismiss()
        window.location.hash = '#/guide'
        return
      }
      clearSaveStatus()
      saving.value = true
      try {
        if (step.value === 1) {
          await api('POST', '/api/settings', { time_zone: timeZone.value })
          tz.value = timeZone.value
          tzSource.value = 'setting'
        } else if (step.value === 2) {
          const connected = await testTvh()
          if (!connected) {
            setSaveStatus('Connection failed. Correct the TVHeadend details to continue.', 'err', 0)
            return
          }
        } else if (step.value === 4) {
          await guideStep.value?.saveLinks()
        } else if (step.value === 5) {
          await saveStorage()
        } else if (step.value === 6) {
          await savePlex()
        }
        step.value++
      } catch (err) {
        setSaveStatus(`Save failed: ${err.message}`, 'err', 5000)
      } finally {
        saving.value = false
      }
    }

    const fetchPlexSections = async () => {
      const body = { plex_url: plexUrl.value }
      if (plexToken.value) body.plex_token = plexToken.value
      const { sections = [] } = await api('POST', '/api/plex-sections', body)
      plexSections.value = sections
      plexSectionLoads.value++
      plexConnected.value = true
      plexProblem.value = null
      if (!plexSectionId.value) plexSectionId.value = guessPlexTvSection({ sections, mediaRoot: mediaRoot.value })
      return sections
    }

    const loadPlexSections = async ({ silent = false } = {}) => {
      plexProbing.value = true
      try {
        const sections = await fetchPlexSections()
        if (!silent) setPlexSections(`Connected. Plex has ${sections.length} libraries.`, 'ok', 5000)
      } catch (err) {
        plexConnected.value = false
        if (!silent) setPlexSections(`Could not reach Plex: ${err.message}`, 'err', 5000)
      } finally {
        plexProbing.value = false
      }
    }

    const usePlexLibraries = (selected) => {
      if (selected.tv) plexSectionId.value = selected.tv
      loadPlexSections({ silent: true })
    }

    const connectPlexAt = async ({ url, guessed = false }) => {
      const before = plexUrl.value
      plexUrl.value = url
      try {
        await fetchPlexSections()
        return {}
      } catch (err) {
        if (guessed) plexUrl.value = before
        return { problem: plexUnreachableProblem({ url, error: err.message }) }
      }
    }

    const connectFoundPlex = async (url) => {
      if (hasPlexToken()) return connectPlexAt({ url })
      plexUrl.value = url
      return { problem: plexNoTokenProblem(url) }
    }

    const detectPlexTokenQuietly = async () => {
      const r = await api('POST', '/api/plex-detect-token').catch(() => ({}))
      if (!r.ok) return
      plexToken.value = r.token || ''
      plexTokenSet.value = true
    }

    const discoverPlexServers = () => api('POST', '/api/discover-plex')
      .then((r) => r.servers || [])
      .catch(() => [])

    const locatePlex = async () => {
      if (plexUrl.value && hasPlexToken()) return connectPlexAt({ url: plexUrl.value })
      const [, servers] = await Promise.all([detectPlexTokenQuietly(), discoverPlexServers()])
      if (servers.length > 1) {
        plexCandidates.value = servers
        return {}
      }
      if (servers.length === 1) return connectFoundPlex(plexServerUrl(servers[0]))
      if (hasPlexToken()) return connectPlexAt({ url: LOCAL_PLEX_URL, guessed: true })
      return {}
    }

    const runPlexCheck = async (task) => {
      plexChecking.value = true
      plexProblem.value = null
      try {
        const { problem = null } = await task()
        plexProblem.value = problem
        plexAdvancedOpen.value = Boolean(problem)
      } finally {
        plexChecking.value = false
      }
    }

    const findPlex = () => {
      plexCandidates.value = []
      return runPlexCheck(locatePlex)
    }

    const usePlexCandidate = (c) => {
      plexCandidates.value = []
      return runPlexCheck(() => connectFoundPlex(plexServerUrl(c)))
    }

    const detectPlexToken = async () => {
      plexDetectingToken.value = true
      try {
        if (plexPrefsPath.value) {
          await api('POST', '/api/settings', { plex_prefs_path: plexPrefsPath.value })
        }
        const r = await api('POST', '/api/plex-detect-token')
        if (r.ok) {
          plexToken.value = r.token || ''
          setPlexTokenStatus(`Token detected from ${r.source}.`, 'ok', 5000)
        } else {
          setPlexTokenStatus(`Auto-detect failed: ${r.reason}`, 'err', 8000)
        }
      } catch (err) {
        setPlexTokenStatus(`Auto-detect failed: ${err.message}`, 'err', 8000)
      } finally {
        plexDetectingToken.value = false
      }
    }

    const tvhDetecting = ref(false)
    const tvhCandidates = ref([])
    const [tvhDiscoverText, tvhDiscoverKind, setTvhDiscover] = makeStatus()
    const useTvhCandidate = (c) => {
      tvhUrl.value = c.url
      tvhCandidates.value = []
      setTvhDiscover(tvhDetectSummary(c), c.loopback ? 'info' : 'ok', 0)
    }
    const tvhAutoScanning = ref(false)
    const detectTvh = async ({ quiet = false } = {}) => {
      tvhDetecting.value = true
      tvhAutoScanning.value = quiet
      tvhCandidates.value = []
      setTvhDiscover('Scanning this host (~2s)…', 'busy', 0)
      try {
        const r = await api('POST', '/api/tvh-detect')
        if (r.candidates.length === 1) useTvhCandidate(r.candidates[0])
        else {
          tvhCandidates.value = r.candidates
          setTvhDiscover(`${r.candidates.length} TVHeadend servers answered.`, 'info', 0)
        }
      } catch (err) {
        if (quiet) setTvhDiscover('', 'info', 0)
        else setTvhDiscover(`Auto-discover failed: ${err.message}`, 'err', 8000)
      } finally {
        tvhDetecting.value = false
        tvhAutoScanning.value = false
      }
    }
    watch(step, (curr) => {
      if (curr === 2 && !tvhUrl.value.trim()) detectTvh({ quiet: true })
      if (curr === 2) checkBootstrap()
      if (curr === 5) checkStorage()
      if (curr === 6) findPlex()
    })
    watch([tvhUrl, tvhUsername, tvhPassword], () => {
      if (step.value === 2) clearSaveStatus()
    })

    const bootstrap = ref(null)
    const manualLogin = ref(false)
    const securing = ref(false)
    const securedAs = ref('')
    const secureAdminUsername = ref('admin')
    const secureAdminPassword = ref('')
    const secureShowPassword = ref(false)
    const secureAdminPasswordInput = ref(null)
    const securePrefixes = ref('')
    const secureSteps = ref([])
    const secureRevealed = ref(0)
    const secureShownSteps = computed(() =>
      pacedSteps({ steps: secureSteps.value, revealed: secureRevealed.value }))
    const secureError = ref('')
    const secureStepsVisible = computed(() => secureShownSteps.value.length > 0)
    const secureNext = ref('')
    const showSecure = computed(() => Boolean(bootstrap.value?.fresh) && !manualLogin.value && !securedAs.value)
    const secureInputProblem = computed(() => bootstrapInputProblem({
      username: secureAdminUsername.value,
      password: secureAdminPassword.value,
      prefixes: securePrefixes.value,
    }))
    const secureReady = computed(() => !secureInputProblem.value)

    let bootstrapCheckTimer = null
    const checkBootstrap = () => {
      clearTimeout(bootstrapCheckTimer)
      const url = tvhUrl.value.trim()
      if (!url || step.value !== 2) return
      bootstrapCheckTimer = setTimeout(async () => {
        const status = await api('GET', `/api/tvh-bootstrap/status?url=${encodeURIComponent(url)}`).catch(() => null)
        if (url !== tvhUrl.value.trim()) return
        bootstrap.value = status
        if (status?.fresh && !securePrefixes.value) {
          securePrefixes.value = withBrowserNetwork({
            prefixes: status.suggestedPrefixes,
            host: window.location.hostname,
          }).join(', ')
        }
      }, BOOTSTRAP_CHECK_DELAY_MS)
    }
    watch(tvhUrl, () => {
      bootstrap.value = null
      checkBootstrap()
    })
    watch(showSecure, async (visible) => {
      if (!visible) return
      await nextTick()
      secureAdminPasswordInput.value?.focus()
    })

    const backToSecureForm = async () => {
      secureSteps.value = []
      secureRevealed.value = 0
      secureError.value = ''
      secureNext.value = ''
      await nextTick()
      secureAdminPasswordInput.value?.focus()
    }

    const focusFirstFieldOnOpen = (event) => {
      const disclosure = event.currentTarget.parentElement
      if (disclosure.open) return
      requestAnimationFrame(() => disclosure.querySelector('input')?.focus())
    }

    const useManualLogin = () => {
      manualLogin.value = true
      secureSteps.value = []
      secureRevealed.value = 0
      secureError.value = ''
      secureNext.value = ''
    }

    const revealSecureSteps = async (isSettled) => {
      if (!prefersReducedMotion()) {
        const stepMs = revealStepMs(secureSteps.value.length, SECURE_REVEAL_PACING)
        while (secureRevealed.value < secureSteps.value.length) {
          const shownAt = Date.now()
          while (!isStepResolved(secureSteps.value[secureRevealed.value])) {
            if (isSettled()) break
            await wait(BOOTSTRAP_REVEAL_POLL_MS)
          }
          const step = secureSteps.value[secureRevealed.value]
          if (!isStepResolved(step)) break
          await wait(Math.max(0, stepMs - (Date.now() - shownAt)))
          secureRevealed.value += 1
          if (step.status === 'failed') break
        }
      }
      secureRevealed.value = secureSteps.value.length
    }

    const secureTvh = async () => {
      securing.value = true
      secureError.value = ''
      secureNext.value = ''
      secureRevealed.value = 0
      secureSteps.value = (bootstrap.value?.steps || []).map((s) => ({ ...s, status: 'pending' }))
      let settled = false
      const reveal = revealSecureSteps(() => settled)
      const poll = setInterval(async () => {
        const progress = await api('GET', '/api/tvh-bootstrap/progress').catch(() => null)
        if (!settled && progress?.steps?.length) secureSteps.value = progress.steps
      }, BOOTSTRAP_POLL_MS)
      try {
        const result = await api('POST', '/api/tvh-bootstrap/apply', {
          url: tvhUrl.value.trim(),
          admin_username: secureAdminUsername.value.trim(),
          admin_password: secureAdminPassword.value,
          prefixes: securePrefixes.value,
        })
        settled = true
        secureSteps.value = result.steps
        await reveal
        securedAs.value = result.adminUsername
        secureAdminPassword.value = ''
        tvhUsername.value = result.username
        tvhPassword.value = ''
        tvhPasswordSet.value = true
        await testTvh()
      } catch (err) {
        settled = true
        if (err.data?.steps) secureSteps.value = err.data.steps
        await reveal
        secureError.value = err.message
        secureNext.value = err.data?.next || ''
        if (err.data?.code === 'not-fresh') manualLogin.value = true
      } finally {
        clearInterval(poll)
        securing.value = false
      }
    }

    const testTvh = async () => {
      tvhTesting.value = true
      setTvhText('Contacting TVHeadend…', 'busy', 0)
      try {
        const r = await api('POST', '/api/tvh-test', {
          tvh_url: tvhUrl.value.trim(),
          tvh_username: tvhUsername.value.trim(),
          ...(tvhPassword.value ? { tvh_password: tvhPassword.value } : {}),
        })
        if (tvhPassword.value) {
          tvhPasswordSet.value = true
          tvhPassword.value = ''
        }
        setTvhText(tvhTestSummary(r), 'ok', 8000)
        tvhConnected.value = true
        return true
      } catch (err) {
        setTvhText(`Failed: ${err.message}`, 'err', 0)
        return false
      } finally {
        tvhTesting.value = false
      }
    }

    return {
      step, totalSteps, stepTitle, saving, canAdvance, nextLabel, nextIsPrimary, plexIsSetUp, syncFrequencyText, guideStep, hasExistingConfig, channelState, guideState, readySkipped,
      timeZone, tzSource,
      tvhUrl, tvhUsername, tvhPassword, tvhPasswordSet, tvhTesting,
      recordingsRoot, tvhRecordingsPath, recordingsCheck, tvhPathCheck,
      plexUrl, plexToken, plexTokenSet, plexSectionId, plexSections, plexProbing,
      plexCandidates, plexDetectingToken, plexPrefsPath, plexSectionLoads, usePlexLibraries,
      plexChecking, plexConnected, plexProblem, plexAdvancedOpen, plexEditedByHand, plexDocsUrl, plexShowSections, findPlex,
      storageChecking, storageChecked, storageProblems, storageNotes, storageAdvancedOpen, storageSummary, checkStorage, clearStaleLibraryStatus,
      focusFirstFieldOnOpen, manualLogin,
      plexTokenStatus, plexTokenStatusKind,
      mediaRoot, mediaRootTesting, mediaRootStatus, mediaRootStatusKind, testMediaRoot,
      back, next, skipToSettings, loadPlexSections, testTvh, advanceHint,
      showSecure, secureStepsVisible, backToSecureForm, securing, securedAs, secureAdminUsername, secureAdminPassword, secureShowPassword, secureAdminPasswordInput,
      securePrefixes, secureShownSteps, secureError, secureNext, secureInputProblem, secureReady,
      secureTvh, useManualLogin, secureStepDot,
      detectTvh, tvhDetecting, tvhAutoScanning, tvhCandidates, useTvhCandidate, tvhDiscoverText, tvhDiscoverKind,
      usePlexCandidate, detectPlexToken,
      plexSectionsText, plexSectionsKind,
      tvhText, tvhKind,
      saveStatusText, saveStatusKind,
    }
  },
}

const bootstrapInputProblem = ({ username, password, prefixes }) => {
  if (!username.trim()) return 'Choose an admin username.'
  if (password.length < BOOTSTRAP_MIN_PASSWORD) return `Choose an admin password of at least ${BOOTSTRAP_MIN_PASSWORD} characters.`
  if (!prefixes.trim()) return 'Enter at least one allowed network.'
  return ''
}

const failedCheck = (err) => ({ ok: false, problem: 'request', error: err.message })

const changedSettings = (entries) => Object.fromEntries(
  entries.filter(([, value, savedValue]) => value !== savedValue).map(([key, value]) => [key, value]),
)

const storageSummaryText = ({ mediaRoot, recordingsRoot }) => {
  const inDataFolder = [mediaRoot, recordingsRoot].every((folder) => isInsideFolder({ folder, root: COMPOSE_DATA_ROOT }))
  if (inDataFolder) return 'Recordings and your TV library are saved in the data folder inside the folder you installed Freetvarr to.'
  return `Freetvarr reads recordings from ${recordingsRoot} and saves your TV library to ${mediaRoot}.`
}

const storageCheckOutcome = ({ folders, library, recordings, tvh }) => {
  const problems = [
    folderProblem({ result: library, path: folders.mediaRoot, name: 'TV library folder', access: 'save to' }),
    folderProblem({ result: recordings, path: folders.recordingsRoot, name: 'recordings folder', access: 'read' }),
    tvhFolderProblem({ result: tvh, configured: folders.tvhRecordingsPath }),
  ].filter(Boolean)
  const notes = recordings.ok && recordings.hardlinks === false ? [COPY_IMPORT_NOTE] : []
  return { problems, notes }
}

const folderProblem = ({ result, path, name, access }) => {
  if (result.ok) return null
  const changeIt = `Change the ${name} under Advanced: change folders.`
  const problems = {
    empty: { text: `The ${name} is blank.`, fix: changeIt },
    relative: { text: `The ${name} must start with /.`, fix: changeIt },
    'not-folder': { text: `${path} is a file, not a folder.`, fix: changeIt },
    missing: {
      text: `Your ${name} ${path} does not exist.`,
      fix: `Check that docker-compose.yml shares this folder with Freetvarr, then run docker compose up -d. Or change the ${name} under Advanced: change folders.`,
    },
    denied: {
      text: `Freetvarr cannot ${access} your ${name} ${path}.`,
      fix: 'Set PUID and PGID in .env to the owner of the data folder, then run docker compose up -d.',
    },
    request: { text: `Freetvarr could not check your ${name}: ${withoutFullStop(result.error)}.`, fix: 'Press CHECK AGAIN.' },
  }
  return problems[result.problem]
    || { text: `Freetvarr cannot ${access} your ${name} ${path}: ${withoutFullStop(result.error)}.`, fix: changeIt }
}

const tvhFolderProblem = ({ result, configured }) => {
  if (!result.ok) {
    return {
      text: 'Freetvarr could not ask TVHeadend where it saves recordings.',
      fix: 'Go BACK to the TVHeadend step and press TEST CONNECTION.',
    }
  }
  if (!result.tvhPath) {
    return {
      text: 'TVHeadend has no folder set for recordings.',
      fix: 'In TVHeadend, set the recording path in the DVR profile, then press CHECK AGAIN.',
    }
  }
  if (result.matches || !result.configured) return null
  return {
    text: `TVHeadend saves recordings to ${result.tvhPath}, but Freetvarr expects ${configured}.`,
    fix: `Set the recording path in TVHeadend's DVR profile to ${configured}, or change the folders under Advanced: change folders.`,
  }
}

const guessPlexTvSection = ({ sections, mediaRoot }) => sections
  .find((sec) => sec.type === 'show' && (sec.locations || []).some((folder) => sameFolder(folder, mediaRoot)))
  ?.key || ''

const plexServerUrl = (server) => `http://${server.ip}:${server.port}`

const plexNoTokenProblem = (url) => ({
  text: `Found Plex at ${url}, but Freetvarr could not find its token.`,
  fix: 'Paste the token under Advanced: connect Plex by hand.',
})

const plexUnreachableProblem = ({ url, error }) => ({
  text: `Freetvarr could not connect to Plex at ${url}: ${withoutFullStop(error)}.`,
  fix: 'Check that Plex is running, then press CHECK AGAIN. SKIP leaves your Plex settings as they are.',
})

const isInsideFolder = ({ folder, root }) => {
  const path = withoutTrailingSlash(folder)
  return path === root || path.startsWith(`${root}/`)
}

const sameFolder = (a, b) => withoutTrailingSlash(a) === withoutTrailingSlash(b)

const withoutTrailingSlash = (path) => String(path || '').trim().replace(/(.)\/+$/, '$1')

const withoutFullStop = (text) => String(text || '').trim().replace(/\.+$/, '')

const COMPOSE_DATA_ROOT = '/data'
const LOCAL_PLEX_URL = 'http://127.0.0.1:32400'
const COPY_IMPORT_NOTE = 'Recordings and your TV library are on different disks or mounts, so each import makes a full copy of the recording.'

const secureStepDot = (status) => ({
  pending: 'idle',
  running: 'live',
  done: 'bg-plex-yellow',
  failed: 'bg-signal-orange',
})[status] || 'idle'

const BOOTSTRAP_CHECK_DELAY_MS = 500
const BOOTSTRAP_POLL_MS = 400
const BOOTSTRAP_REVEAL_POLL_MS = 50
const BOOTSTRAP_MIN_PASSWORD = 8

const EPG_ZOOM_LEVELS = [
  { key: 's', pxPerMin: 3, rowRem: 3.4, narrowRowRem: 3, halfHourTicks: false },
  { key: 'm', pxPerMin: 5, rowRem: 4.4, narrowRowRem: 3.75, halfHourTicks: true },
  { key: 'l', pxPerMin: 8, rowRem: 5.6, narrowRowRem: 4.75, halfHourTicks: true },
]
const EPG_ZOOM_KEY = 'freetvarr.guideZoom'
const EPG_NOW_ANCHOR = 0.2
const EPG_NARROW_QUERY = '(max-width: 767px)'
const EPG_CELL_INSET_PX = 10
const EPG_CELL_TEXT_MIN_PX = 40
const EPG_THUMB_TEXT_MIN_PX = 72
const EPG_TOOLTIP_DELAY_MS = 250
const EPG_TOOLTIP_GAP_PX = 12
const EPG_TOOLTIP_EDGE_PX = 8
const EPG_RAIL_DEFAULT_PX = 200
const EPG_RAIL_MIN_PX = 90
const EPG_RAIL_MAX_PX = 320
const EPG_RAIL_KEY = 'freetvarr.epgRailPx'
const EPG_IMAGES_KEY = 'freetvarr.guideImages'
const EPG_DRAG_THRESHOLD_PX = 6
const PIN_LIFT_HOLD_MS = 250
const EPG_STATE_POLL_MS = 60_000
const LISTINGS_REFRESH_MS = 10_000
const LISTINGS_LOADING_TEXT = 'Loading the new listings. This can take a couple of minutes.'
const CHANNELS_SAVED_TEXT = 'Channel preferences saved.'
const EPG_SEARCH_DEBOUNCE_MS = 300
const EPG_LEAD_OPTIONS = [0, 1, 2, 3, 5, 10, 15]
const EPG_LAG_OPTIONS = [0, 5, 10, 15, 30, 60]
const EPG_KEEP_OPTIONS = [
  { value: 0, label: 'ALL EPISODES' },
  { value: 5, label: 'KEEP 5' },
  { value: 10, label: 'KEEP 10' },
]

const CHANNEL_SORT_OPTIONS = [
  { key: 'default', label: 'TVH ORDER' },
  { key: 'number', label: 'NUMBER' },
  { key: 'name', label: 'NAME' },
]

let infoDialogCount = 0
let filterSheetCount = 0

const LATEST_RELEASE_KEY = 'freetvarr.latest-release'
const LATEST_RELEASE_TTL_MS = 60 * 60 * 1000
const COPIED_FLASH_MS = 2000

const readCachedLatestRelease = () => {
  try {
    const cached = JSON.parse(sessionStorage.getItem(LATEST_RELEASE_KEY) || 'null')
    return cached && Date.now() - cached.at < LATEST_RELEASE_TTL_MS ? cached.latest : undefined
  } catch {
    return undefined
  }
}

const cacheLatestRelease = (latest) => {
  try {
    sessionStorage.setItem(LATEST_RELEASE_KEY, JSON.stringify({ at: Date.now(), latest }))
  } catch {}
}

const fetchLatestRelease = async () => {
  const cached = readCachedLatestRelease()
  if (cached !== undefined) return cached
  const res = await fetch('https://api.github.com/repos/furey/freetvarr/tags?per_page=20', {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`)
  const tags = await res.json()
  const latest = latestReleaseTag(tags.map((tag) => tag.name))
  cacheLatestRelease(latest)
  return latest
}

const copyText = async (text) => {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text)
  const scratch = document.createElement('textarea')
  scratch.value = text
  scratch.setAttribute('readonly', '')
  scratch.style.position = 'fixed'
  scratch.style.opacity = '0'
  document.body.append(scratch)
  scratch.select()
  const copied = document.execCommand('copy')
  scratch.remove()
  if (!copied) throw new Error('Copy failed')
}

const CopyRow = {
  props: {
    label: { type: String, required: true },
    value: { type: String, default: '' },
  },
  template: `
    <div class="copy-row">
      <span class="field-label">{{ label }}</span>
      <code class="copy-row-value">{{ value }}</code>
      <button type="button" class="btn btn-sm" @click="copy" :disabled="!value">
        <template v-if="state === 'copied'"><check-icon /> COPIED</template>
        <template v-else-if="state === 'failed'"><cross-icon /> COPY FAILED</template>
        <template v-else><copy-icon /> COPY</template>
      </button>
    </div>
  `,
  setup(props) {
    const state = ref('')
    let timer = null
    const flash = (next) => {
      state.value = next
      clearTimeout(timer)
      timer = setTimeout(() => { state.value = '' }, COPIED_FLASH_MS)
    }
    const copy = async () => {
      try {
        await copyText(props.value)
        flash('copied')
      } catch {
        flash('failed')
      }
    }
    onUnmounted(() => clearTimeout(timer))
    return { state, copy }
  },
}

const TvAppsPanel = {
  props: {
    tvhUrl: { type: String, default: '' },
  },
  template: `
    <section id="section-tv-apps" class="panel">
      <header class="panel-header">
        <span class="panel-heading">
          <span class="panel-title">WATCH ON YOUR TV</span>
          <info-button title="WATCH ON YOUR TV" doc="guide/tv-apps">
            <p>Watch live TV with the guide in an app on your TV, tablet, or phone (e.g. Jellyfin or Kodi). The app gets the channels and the guide straight from TVHeadend.</p>
            <p v-if="!login.authCode"><strong>MAKE A TV LOGIN</strong> makes a login that can only watch TV. It cannot change your settings or your recordings.</p>
            <p v-else>Your TV login can only watch TV. It cannot change your settings or your recordings.</p>
            <p>Copy each detail into the app. The setup guide has the steps for each app.</p>
          </info-button>
        </span>
        <span class="text-xs font-mono text-ink-dim">live TV in Jellyfin or Kodi</span>
      </header>
      <div class="panel-body space-y-4">
        <p v-if="!tvhUrl" class="text-sm text-ink-dim">Set the TVHeadend URL above first.</p>
        <template v-else-if="!login.authCode">
          <p class="text-sm text-ink-dim leading-relaxed max-w-2xl">
            A TV app needs its own login to get your channels. Press MAKE A TV LOGIN, and Freetvarr will make a login that can only watch TV. It then shows the details to copy into the app.
          </p>
          <div class="flex flex-wrap items-end gap-3">
            <div class="field-row mb-0!">
              <label class="field-label" for="tv-login-name">Login name</label>
              <input v-no-autofill id="tv-login-name" type="text" class="field-input" v-model="name" />
            </div>
            <button type="button" class="btn" @click="makeLogin" :disabled="making">
              <template v-if="making">MAKING…</template><template v-else><tv-icon /> MAKE A TV LOGIN</template>
            </button>
          </div>
          <p v-if="statusText" :class="['status-readout', statusKind]">{{ statusText }}</p>
        </template>
        <template v-else>
          <div class="field-row md:max-w-sm">
            <label class="field-label" for="tv-apps-host">TVHeadend address for TV apps</label>
            <input v-no-autofill id="tv-apps-host" type="text" class="field-input" v-model="host" placeholder="e.g. 192.168.1.10" />
          </div>
          <template v-if="addresses">
            <div>
              <span class="settings-block-title">JELLYFIN</span>
              <copy-row label="Tuner (M3U) URL" :value="addresses.playlist" />
              <copy-row label="Guide (XMLTV) URL" :value="addresses.guide" />
            </div>
            <div>
              <span class="settings-block-title">KODI (TVHEADEND HTSP CLIENT)</span>
              <copy-row label="Hostname" :value="addresses.host" />
              <copy-row label="HTTP port" :value="addresses.httpPort" />
              <copy-row label="HTSP port" :value="addresses.htspPort" />
              <copy-row label="Username" :value="login.username" />
              <copy-row label="Password" :value="login.password" />
            </div>
          </template>
          <p v-else class="text-sm text-ink-dim">Enter the network address of the computer that runs TVHeadend.</p>
          <p class="text-xs text-ink-mute leading-relaxed max-w-2xl">
            Anyone on your home network with these details can watch your channels. They cannot change your settings or your recordings.
          </p>
        </template>
      </div>
    </section>
  `,
  setup(props) {
    const login = ref({})
    const name = ref(DEFAULT_TV_LOGIN_NAME)
    const host = ref('')
    const making = ref(false)
    const [statusText, statusKind, setStatus] = makeStatus()
    const prefillHost = () => {
      host.value = tvAppsHost({ tvhUrl: props.tvhUrl, browserHost: window.location.hostname })
    }
    const addresses = computed(() => tvAppsAddresses({ tvhUrl: props.tvhUrl, host: host.value, authCode: login.value.authCode }))
    const makeLogin = async () => {
      making.value = true
      try {
        login.value = await api('POST', '/api/tv-login', { username: name.value })
      } catch (err) {
        setStatus(err.message, 'err', 0)
      } finally {
        making.value = false
      }
    }
    watch(() => props.tvhUrl, prefillHost, { immediate: true })
    onMounted(async () => {
      login.value = await api('GET', '/api/tv-login').catch(() => ({}))
    })
    return { login, name, host, making, statusText, statusKind, addresses, makeLogin }
  },
}

const DEFAULT_TV_LOGIN_NAME = 'tv'

const VersionsRow = {
  template: `
    <div class="help-row">
      <div>
        <span class="settings-block-title">VERSIONS</span>
        <dl class="about-list">
          <dt>FREETVARR</dt>
          <dd>
            <a v-if="about.version" :href="releaseUrl(about.version)" target="_blank" rel="noopener noreferrer">{{ about.version }}</a>
            <span v-else class="about-muted">…</span>
          </dd>
          <dt>UPDATES</dt>
          <dd>
            <a v-if="update.state === 'available'" :href="releaseUrl(update.latest)" target="_blank" rel="noopener noreferrer" class="about-update">{{ update.latest }} available</a>
            <span v-else :class="update.state === 'current' ? 'about-current' : 'about-muted'">{{ updateText }}</span>
          </dd>
          <dt>BUILD</dt>
          <dd>{{ about.build || '…' }}</dd>
          <dt>FREETVARR UPTIME</dt>
          <dd>{{ uptimeText }}</dd>
          <dt>TVHEADEND</dt>
          <dd :class="{ 'about-muted': !about.tvheadend }">{{ tvheadendText }}</dd>
          <dt>NODE</dt>
          <dd>{{ about.node || '…' }}</dd>
        </dl>
      </div>
      <button type="button" class="btn" @click="copyAbout" :disabled="!about.version">
        <template v-if="copyState === 'copied'"><check-icon /> COPIED</template>
        <template v-else-if="copyState === 'failed'"><cross-icon /> COPY FAILED</template>
        <template v-else><copy-icon /> COPY</template>
      </button>
    </div>
  `,
  setup() {
    const tvheadendLoaded = ref(false)
    const update = ref({ state: 'checking', latest: null })
    const copyState = ref('')
    let copyTimer = null
    const about = serverAbout
    const tvheadendText = computed(() => {
      if (about.value.tvheadend) return about.value.tvheadend
      return tvheadendLoaded.value ? 'not connected' : '…'
    })
    const uptimeText = computed(() =>
      about.value.uptimeSeconds == null ? '…' : formatUptime(about.value.uptimeSeconds))
    const updateText = computed(() => ({
      checking: 'Checking…',
      current: 'Up to date',
      failed: "Couldn't check for updates",
    })[update.value.state] || '')
    const aboutLines = () => [
      `Freetvarr ${about.value.version}`,
      `Build ${about.value.build}`,
      `Freetvarr uptime ${uptimeText.value}`,
      `TVHeadend ${about.value.tvheadend || 'not connected'}`,
      `Node ${about.value.node}`,
    ].join('\n')
    const flashCopy = (state) => {
      copyState.value = state
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => { copyState.value = '' }, COPIED_FLASH_MS)
    }
    const copyAbout = async () => {
      try {
        await copyText(aboutLines())
        flashCopy('copied')
      } catch {
        flashCopy('failed')
      }
    }
    const loadTvheadendVersion = async () => {
      await fetchServerAbout('?tvheadend=1').catch(() => {})
      tvheadendLoaded.value = true
    }
    const checkForUpdate = async () => {
      try {
        const [latest] = await Promise.all([fetchLatestRelease(), about.value.version || fetchServerAbout()])
        const state = isNewerRelease({ current: about.value.version, latest }) ? 'available' : 'current'
        update.value = { state: latest ? state : 'failed', latest }
      } catch {
        update.value = { state: 'failed', latest: null }
      }
    }
    onMounted(() => {
      loadTvheadendVersion()
      checkForUpdate()
    })
    onUnmounted(() => clearTimeout(copyTimer))
    return { about, update, updateText, uptimeText, tvheadendText, copyState, copyAbout, releaseUrl }
  },
}

const InfoButton = {
  props: {
    title: { type: String, required: true },
    doc: { type: String, default: '' },
  },
  template: `
    <button ref="trigger" type="button" class="info-btn" :aria-label="'About ' + title" :title="'About ' + title"
      :aria-expanded="open" @click="show"><info-icon /></button>
    <teleport to="body">
      <transition name="epg-sheet">
        <div v-if="open" class="epg-modal-backdrop" @click.self="close">
          <section ref="dialog" class="panel epg-modal info-modal" role="dialog" aria-modal="true"
            :aria-labelledby="headingId" tabindex="-1">
            <header class="panel-header">
              <span :id="headingId" class="panel-title">{{ title }}</span>
              <button type="button" class="btn btn-sm btn-icon epg-modal-x" @click="close" aria-label="Close"><cross-icon /></button>
            </header>
            <div class="panel-body info-modal-body">
              <slot />
              <div class="epg-modal-actions flex items-center justify-end gap-2">
                <button type="button" class="btn epg-modal-close mr-auto" @click="close"><cross-icon /> CLOSE</button>
                <a v-if="doc" :href="docUrl" target="_blank" rel="noopener noreferrer" class="btn no-hover-underline">
                  READ THE DOCS <external-link-icon />
                </a>
              </div>
            </div>
          </section>
        </div>
      </transition>
    </teleport>
  `,
  setup(props) {
    const headingId = `info-dialog-${++infoDialogCount}`
    const docUrl = computed(() => `${DOCS_BASE}${props.doc}`)
    return { ...useSheet(), headingId, docUrl }
  },
}

const useSheet = () => {
  const open = ref(false)
  const trigger = ref(null)
  const dialog = ref(null)

  const onKeydown = (e) => {
    if (e.key !== 'Escape') return
    e.stopImmediatePropagation()
    close()
  }

  const setSheetOpen = (isOpen) => {
    try { document.body.classList.toggle('sheet-open', isOpen) } catch {}
  }

  const show = async () => {
    open.value = true
    setSheetOpen(true)
    window.addEventListener('keydown', onKeydown, true)
    await nextTick()
    dialog.value?.focus()
  }

  const close = () => {
    if (!open.value) return
    open.value = false
    setSheetOpen(false)
    window.removeEventListener('keydown', onKeydown, true)
    trigger.value?.focus()
  }

  onUnmounted(() => {
    if (!open.value) return
    setSheetOpen(false)
    window.removeEventListener('keydown', onKeydown, true)
  })

  return { open, trigger, dialog, show, close }
}

const FilterSheet = {
  props: {
    title: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  emits: ['clear'],
  template: `
    <button ref="trigger" type="button" class="btn btn-sm filter-trigger" :aria-expanded="open"
      :aria-controls="open ? sheetId : null" :aria-label="count ? 'Filters, ' + count + ' active' : 'Filters'" @click="show">
      <filter-icon /> FILTERS<span v-if="count" class="filter-count" aria-hidden="true">{{ count }}</span>
    </button>
    <teleport to="body">
      <transition name="epg-sheet">
        <div v-if="open" class="epg-modal-backdrop filter-sheet" @click.self="close">
          <section :id="sheetId" ref="dialog" class="panel epg-modal" role="dialog" aria-modal="true"
            :aria-labelledby="headingId" tabindex="-1">
            <header class="panel-header">
              <span :id="headingId" class="panel-title">{{ title }}</span>
              <button type="button" class="btn btn-sm btn-icon epg-modal-x" @click="close" aria-label="Close"><cross-icon /></button>
            </header>
            <div class="panel-body filter-sheet-body">
              <slot />
              <div class="epg-modal-actions flex items-center justify-end gap-2">
                <button type="button" class="btn mr-auto" :disabled="!count" @click="$emit('clear')"><cross-icon /> CLEAR</button>
                <button type="button" class="btn btn-primary" @click="close"><check-icon /> DONE</button>
              </div>
            </div>
          </section>
        </div>
      </transition>
    </teleport>
  `,
  setup() {
    const id = ++filterSheetCount
    return { ...useSheet(), sheetId: `filter-sheet-${id}`, headingId: `filter-sheet-title-${id}` }
  },
}

const HeaderButton = {
  props: { label: { type: String, required: true } },
  template: `
    <button type="button" :class="['btn', 'btn-sm', { 'btn-icon': narrow }]"
      :aria-label="narrow ? label : null" :title="narrow ? label : null">
      <slot /><template v-if="!narrow">{{ label.toUpperCase() }}</template>
    </button>
  `,
  setup() {
    return { narrow: useMediaQuery(EPG_NARROW_QUERY) }
  },
}

const ZoomControl = {
  props: {
    index: { type: Number, required: true },
    count: { type: Number, required: true },
    showLabel: { type: Boolean, default: true },
  },
  emits: ['step'],
  template: `
    <div class="flex items-center gap-2" role="group" aria-label="Zoom">
      <span v-if="showLabel" class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">ZOOM</span>
      <div class="chip-row">
        <button type="button" class="btn btn-sm btn-icon epg-zoom-btn" aria-label="Zoom out"
          :disabled="index === 0" @click="$emit('step', -1)"><minus-icon /></button>
        <button type="button" class="btn btn-sm btn-icon epg-zoom-btn" aria-label="Zoom in"
          :disabled="index === count - 1" @click="$emit('step', 1)"><plus-icon /></button>
      </div>
    </div>
  `,
}

const ChannelsModal = {
  props: ['channels', 'hiddenIds', 'sort', 'hideSdSimulcasts', 'hideSdChannels'],
  emits: ['close', 'saved'],
  template: `
    <div class="epg-modal-backdrop" @click.self="$emit('close')">
      <section class="panel epg-modal channels-modal">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">CHANNELS</span>
            <info-button title="Channels" doc="guide/tv-guide#favourites">
              <p>Favourites sit at the top of Live TV and the TV Guide, in the order set here. Press a star to add or remove a favourite, and use the arrows to change the order.</p>
              <p>Untick a channel to hide it from both pages. A favourite is always shown. The sort order and the SD simulcast switch apply to the other channels.</p>
              <p>Each channel's shows come from a channel in the TV guide you set up. If a channel shows the wrong shows, or none, press the pencil and pick the guide channel that matches it. Tick to keep the pick, or cross to drop it. Pick No listings to remove its shows. A new pick can take a minute to show in the TV Guide.</p>
            </info-button>
          </span>
          <button type="button" class="btn btn-sm btn-icon epg-modal-x" @click="$emit('close')" aria-label="Close"><cross-icon /></button>
        </header>
        <div class="panel-body channels-body">
          <div class="channels-grid">
          <div class="channels-settings space-y-5">
          <div>
            <label class="field-label">FAVOURITES · SHOWN FIRST, IN THIS ORDER</label>
            <p v-if="pinnedDraft.length === 0" class="text-xs text-ink-dim">
              No favourites yet. Tap the <span class="whitespace-nowrap"><star-icon class="icon-inline" /> next</span> to a channel below, in the TV Guide rail, or in Live TV.
            </p>
            <ul v-else class="space-y-1.5">
              <li v-for="(id, i) in pinnedDraft" :key="id" class="flex items-center gap-2">
                <button type="button" class="btn btn-sm btn-icon" :disabled="i === 0"
                  @click="movePin(i, -1)" :title="'Move up'" :aria-label="'Move ' + draftName(id) + ' up'"><arrow-up-icon /></button>
                <button type="button" class="btn btn-sm btn-icon" :disabled="i === pinnedDraft.length - 1"
                  @click="movePin(i, 1)" :title="'Move down'" :aria-label="'Move ' + draftName(id) + ' down'"><arrow-down-icon /></button>
                <button type="button" class="epg-pin pinned" @click="toggleDraftPin(id)"
                  title="Remove from favourites" :aria-label="'Remove ' + draftName(id) + ' from favourites'"><star-icon /></button>
                <span class="font-mono text-[0.8rem] flex-1 min-w-0 truncate">{{ draftName(id) }}</span>
              </li>
            </ul>
          </div>
          <div>
            <label class="field-label">SORT OTHER CHANNELS BY</label>
            <div class="chip-row">
              <button v-for="s in CHANNEL_SORT_OPTIONS" :key="s.key" type="button"
                :class="['btn', 'btn-sm', sortDraft === s.key ? 'btn-on' : '']"
                @click="sortDraft = s.key">{{ s.label }}</button>
            </div>
          </div>
          <div>
            <label class="flex items-center gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" class="chk" :checked="hideSdChannelsDraft || hideSdDraft"
                :disabled="hideSdChannelsDraft" @change="hideSdDraft = $event.target.checked" />
              <span class="font-mono text-[0.8rem]">HIDE SD SIMULCASTS</span>
            </label>
            <p class="text-xs text-ink-dim mt-1.5">
              Hides an SD channel only when its HD twin is in the lineup (10 next to 10 HD, Nine next to 9HD). SD-only channels stay. Applies to the grid and search; a favourite is never hidden. <template v-if="hideSdChannelsDraft">HIDE SD CHANNELS already hides these.</template>
            </p>
          </div>
          <div>
            <label class="flex items-center gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" class="chk" v-model="hideSdChannelsDraft" />
              <span class="font-mono text-[0.8rem]">HIDE SD CHANNELS</span>
            </label>
            <p class="text-xs text-ink-dim mt-1.5">
              Shows only HD channels. SD-only channels (for example 7flix) are hidden too. Applies to the grid, search, and Live TV; a favourite is never hidden.
            </p>
          </div>
          <p class="text-xs text-ink-dim">
            Each channel's shows come from the TV guide you set up (for example the Sydney guide). If a channel shows the wrong shows, or none, <span class="whitespace-nowrap">press <pencil-icon class="icon-inline" /> and</span> pick the guide channel that matches it.
          </p>
          </div>
          <div class="channels-list">
            <label class="field-label">ALL CHANNELS · <span class="whitespace-nowrap"><star-icon class="icon-inline" />&nbsp;FAVOURITE,</span> TICK TO SHOW, <span class="whitespace-nowrap"><pencil-icon class="icon-inline" />&nbsp;CHANGE GUIDE SOURCE</span></label>
            <p v-if="guideLoading" class="text-xs text-ink-dim mb-2">Reading the listings…</p>
            <p v-else-if="guideLoadError" class="status-readout err mb-2">{{ guideLoadError }}</p>
            <p v-else-if="guideLinks && !guideLinks.ready" class="text-xs text-ink-dim mb-2">
              Set up the TV guide first to change the listings of a channel. <a href="#/welcome" @click="$emit('close')">Open the setup wizard</a> and go to its GUIDE step.
            </p>
            <div class="grid grid-cols-1 gap-y-2">
              <div v-for="ch in listedChannels" :key="ch.id" class="flex flex-col gap-1.5"
                @keydown.esc="onRowEscape">
                <div class="flex items-center gap-2">
                  <button type="button" :class="['epg-pin', { pinned: pinnedDraft.includes(String(ch.id)) }]"
                    @click="toggleDraftPin(String(ch.id))"
                    :title="pinnedDraft.includes(String(ch.id)) ? 'Remove from favourites' : 'Add to favourites'"
                    :aria-label="pinnedDraft.includes(String(ch.id)) ? 'Remove ' + ch.name + ' from favourites' : 'Add ' + ch.name + ' to favourites'"><star-icon /></button>
                  <label class="flex flex-1 items-center gap-2.5 text-sm cursor-pointer min-w-0"
                    :title="pinnedDraft.includes(String(ch.id)) ? 'Favourites are always shown' : null">
                    <input type="checkbox" class="chk shrink-0"
                      :checked="!hiddenDraft.has(String(ch.id))"
                      :disabled="pinnedDraft.includes(String(ch.id))"
                      @change="toggleHidden(ch)" />
                    <span class="flex items-center gap-1.5 min-w-0">
                      <span :class="['pill pill-format pill-slot shrink-0', ch.hd ? 'pill-hd' : 'pill-sd']"
                        :title="ch.hd ? 'High definition' : 'Standard definition'">{{ ch.hd ? 'HD' : 'SD' }}</span>
                      <span class="font-mono text-[0.8rem] truncate">
                        <span class="text-ink-mute">{{ ch.number ?? '' }}</span>
                        {{ ch.name }}
                      </span>
                    </span>
                  </label>
                  <template v-if="showGuideColumn && String(ch.id) in guideDraft">
                    <span :class="['font-mono text-[0.7rem] truncate max-w-[40%] sm:max-w-[16rem]', isGuideChanged(ch) ? 'text-signal-orange-hi' : 'text-ink-dim']"
                      :title="isGuideChanged(ch) ? 'Changed; SAVE writes it' : null">{{ guideNameFor(guideDraft[String(ch.id)]) }}</span>
                    <button type="button" class="btn btn-sm btn-icon shrink-0" @click="startGuideEdit(ch)"
                      :title="'Change guide source for ' + ch.name" :aria-label="'Change guide source for ' + ch.name"><pencil-icon /></button>
                  </template>
                </div>
                <div v-if="editingId === String(ch.id)" class="flex items-center gap-2 pl-6">
                  <guide-combobox class="flex-1 min-w-0" v-model="editValue" :options="guideLinks.options"
                    none-label="No listings" :label="'Listings for ' + ch.name" autofocus
                    @confirm="confirmGuideEdit" />
                  <button type="button" class="btn btn-sm btn-icon shrink-0" @click="confirmGuideEdit"
                    title="Use this guide source" aria-label="Use this guide source"><check-icon /></button>
                  <button type="button" class="btn btn-sm btn-icon shrink-0" @click="cancelGuideEdit"
                    title="Keep the current guide source" aria-label="Keep the current guide source"><cross-icon /></button>
                </div>
              </div>
            </div>
          </div>
          </div>
          <p v-if="guideStatusText" :class="['status-readout', guideStatusKind, 'text-right']">{{ guideStatusText }}</p>
          <div class="epg-modal-actions flex items-center justify-end gap-2 pt-1">
            <span v-if="statusText" :class="['status-readout', statusKind]">{{ statusText }}</span>
            <button type="button" class="btn btn-sm" @click="$emit('close')">CANCEL</button>
            <button type="button" class="btn btn-sm btn-primary" @click="save" :disabled="savingPrefs || guideLoading">
              {{ savingPrefs ? 'SAVING…' : 'SAVE' }}
            </button>
          </div>
        </div>
      </section>
    </div>
  `,
  setup(props, { emit }) {
    const pinnedDraft = ref(props.channels.filter((c) => c.pinned).map((c) => String(c.id)))
    const hiddenDraft = ref(new Set((props.hiddenIds || []).map(String)))
    const sortDraft = ref(props.sort || 'default')
    const hideSdDraft = ref(Boolean(props.hideSdSimulcasts))
    const hideSdChannelsDraft = ref(Boolean(props.hideSdChannels))
    const listedChannels = computed(() => (hideSdChannelsDraft.value
      ? props.channels.filter((c) => c.hd || pinnedDraft.value.includes(String(c.id)))
      : props.channels))
    const savingPrefs = ref(false)
    const [statusText, statusKind, setStatus] = makeStatus()
    const [guideStatusText, guideStatusKind, setGuideStatus] = makeStatus()
    const guideLinks = ref(null)
    const guideLoading = ref(true)
    const guideLoadError = ref('')
    const guideSaved = ref({})
    const guideDraft = reactive({})
    const showGuideColumn = computed(() => Boolean(guideLinks.value?.ready))
    const editingId = ref(null)
    const editValue = ref('')

    const guideNameFor = (guideId) =>
      guideLinks.value?.options.find((o) => o.id === guideId)?.name || 'No listings'
    const isGuideChanged = (ch) => guideDraft[String(ch.id)] !== guideSaved.value[String(ch.id)]
    const startGuideEdit = (ch) => {
      editingId.value = String(ch.id)
      editValue.value = guideDraft[String(ch.id)]
    }
    const cancelGuideEdit = () => { editingId.value = null }
    const onRowEscape = (e) => {
      if (editingId.value === null) return
      e.stopPropagation()
      cancelGuideEdit()
    }
    const confirmGuideEdit = () => {
      if (editingId.value === null) return
      guideDraft[editingId.value] = editValue.value
      editingId.value = null
    }

    const loadGuideLinks = async () => {
      try {
        const links = await api('GET', '/api/tvh-guide/links')
        const picks = Object.fromEntries(links.channels.map((c) => [String(c.id), c.guideIds[0] || '']))
        guideSaved.value = picks
        Object.assign(guideDraft, picks)
        guideLinks.value = links
      } catch (err) {
        guideLoadError.value = `Freetvarr could not read the listings: ${err.message}`
      } finally {
        guideLoading.value = false
      }
    }

    onMounted(() => {
      try { document.body.classList.add('sheet-open') } catch { /* ignore */ }
      loadGuideLinks()
    })
    onUnmounted(() => {
      try { document.body.classList.remove('sheet-open') } catch { /* ignore */ }
    })

    const draftName = (id) => props.channels.find((c) => String(c.id) === String(id))?.name || `channel ${id}`

    const toggleDraftPin = (id) => {
      if (pinnedDraft.value.includes(id)) {
        pinnedDraft.value = pinnedDraft.value.filter((p) => p !== id)
        return
      }
      pinnedDraft.value = [...pinnedDraft.value, id]
      const next = new Set(hiddenDraft.value)
      next.delete(id)
      hiddenDraft.value = next
    }

    const movePin = (i, delta) => {
      const next = [...pinnedDraft.value]
      const [moved] = next.splice(i, 1)
      next.splice(i + delta, 0, moved)
      pinnedDraft.value = next
    }

    const toggleHidden = (ch) => {
      const next = new Set(hiddenDraft.value)
      const key = String(ch.id)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      hiddenDraft.value = next
    }

    const savePrefs = async () => {
      try {
        await api('PUT', '/api/epg/channel-prefs', {
          pinned_ids: pinnedDraft.value,
          hidden_ids: [...hiddenDraft.value],
          sort: sortDraft.value,
          hide_sd_simulcasts: hideSdDraft.value,
          hide_sd_channels: hideSdChannelsDraft.value,
        })
        return true
      } catch (err) {
        setStatus(`Save failed: ${err.message}`, 'err', 8000)
        return false
      }
    }

    const changedGuideLinks = () => Object.entries(guideDraft)
      .filter(([id, guideId]) => guideSaved.value[id] !== guideId)
      .map(([channel_id, guide_id]) => ({ channel_id, guide_id }))

    const saveGuideLinks = async () => {
      const links = changedGuideLinks()
      if (!links.length) return { saved: true, listingsLoading: false }
      try {
        const result = await api('POST', '/api/tvh-guide/links', { links })
        guideSaved.value = { ...guideDraft }
        return { saved: true, listingsLoading: Boolean(result.loading?.length) }
      } catch (err) {
        setGuideStatus(`Listings not saved: ${err.message}`, 'err', 0)
        return { saved: false, listingsLoading: false }
      }
    }

    const save = async () => {
      savingPrefs.value = true
      const prefsSaved = await savePrefs()
      if (prefsSaved) setStatus('Channels saved.', 'ok')
      const links = await saveGuideLinks()
      savingPrefs.value = false
      if (prefsSaved && links.saved) emit('saved', { listingsLoading: links.listingsLoading })
    }

    return {
      CHANNEL_SORT_OPTIONS, pinnedDraft, hiddenDraft, sortDraft, hideSdDraft, hideSdChannelsDraft, listedChannels, savingPrefs,
      statusText, statusKind, draftName, toggleDraftPin, movePin, toggleHidden, save,
      guideLinks, guideLoading, guideLoadError, guideDraft, showGuideColumn, guideStatusText, guideStatusKind,
      editingId, editValue, guideNameFor, isGuideChanged, startGuideEdit, cancelGuideEdit, confirmGuideEdit,
      onRowEscape,
    }
  },
}

const togglePinnedChannel = async ({ pinnedIds, channelId }) => {
  const key = String(channelId)
  const next = pinnedIds.includes(key) ? pinnedIds.filter((id) => id !== key) : [...pinnedIds, key]
  await api('PUT', '/api/epg/channel-prefs', { pinned_ids: next })
}

const EpgView = {
  template: `
    <div :class="['view-reveal', 'space-y-6', { 'max-w-[69rem] mx-auto': mode !== 'guide' }]">
      <section :class="['panel', { 'panel-guide': mode === 'guide' }]">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">GUIDE<template v-if="mode === 'guide'"> · <span class="normal-case">{{ dayTitle }}</span></template><template v-else> · {{ mode.toUpperCase() }}</template></span>
            <info-button v-if="mode === 'upcoming'" title="TV GUIDE: UPCOMING" doc="guide/tv-guide#recording-a-programme">
              <p>Everything TVHeadend will record, soonest first. <strong>SCHEDULED</strong> cards are timers set in TVHeadend, marked <strong>SERIES</strong> or <strong>ONE-OFF</strong>. <strong>EXPECTED</strong> cards are episodes your series recordings should catch in the next 7 days.</p>
              <p>Click a card to open the programme, where you can cancel the recording. Search filters the list as you type.</p>
            </info-button>
            <info-button v-else title="TV GUIDE: GUIDE" doc="guide/tv-guide#the-grid">
              <p>Channels run down the page and time runs across; the orange line marks now. The day chips, <strong>NOW</strong>, and <strong>TONIGHT</strong> move through the week, and the zoom buttons change the time scale.</p>
              <p>Earlier programmes from today are dimmed. The grid runs on to 3am; programmes after midnight are dimmed, and the date pill opens the next day. Blue borders are scheduled, gold borders are series recordings, and orange is recording now. Hover a programme for its details.</p>
              <p>Click a programme to record it, record the series, or cancel. A programme on now also offers <strong>WATCH LIVE</strong>.</p>
            </info-button>
          </span>
          <div class="header-actions flex flex-wrap items-center justify-end gap-3">
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
            <template v-if="mode === 'guide'">
              <toggle-switch v-model="showImages" label="IMAGES" />
            </template>
            <header-button label="Channels" @click="openChannelsModal" :disabled="!guide"><sliders-icon /></header-button>
            <header-button v-if="!narrow" label="Refresh" @click="manualRefresh" :disabled="loading"><refresh-icon /></header-button>
          </div>
        </header>
        <div class="panel-body space-y-4">
          <div class="guide-top flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
            <div class="chip-row mode-tabs md:flex-wrap">
              <button v-for="m in modes" :key="m.key" type="button"
                :class="['btn', 'btn-sm', mode === m.key ? 'btn-on' : '']" :aria-pressed="String(mode === m.key)"
                @click="setMode(m.key)">{{ m.label }}</button>
            </div>
            <div :class="['view-controls', 'flex-1', 'min-w-[12rem]', 'md:max-w-xs', 'md:ml-auto', { 'view-controls-sticky': mode !== 'guide' }]">
              <select v-if="narrow && mode === 'guide'" :value="day" @change="setDay(Number($event.target.value))"
                class="field-input day-select" aria-label="Day">
                <option v-for="d in dayChips" :key="d.day" :value="d.day">{{ d.label }}</option>
              </select>
              <input v-no-autofill v-model="searchQ" type="search" class="field-input" :placeholder="searchPlaceholder" :aria-label="searchPlaceholder"
                style="padding-top: 0.35rem; padding-bottom: 0.35rem;" />
            </div>
          </div>

          <template v-if="mode === 'guide' && searchActive">
            <p class="text-xs font-mono text-ink-mute">
              {{ searching ? 'Searching…' : searchResults.length + ' result' + (searchResults.length === 1 ? '' : 's') + ' for “' + searchQ.trim() + '”' }}
            </p>
            <div class="space-y-3">
              <article v-for="p in searchResults" :key="p.program_id + '-' + p.start"
                class="deck-card deck-card-clickable deck-card-with-image" role="button" tabindex="0"
                @click="openProgram(p, channelById(p.channelId))"
                @keydown.enter.prevent="openProgram(p, channelById(p.channelId))"
                @keydown.space.prevent="openProgram(p, channelById(p.channelId))">
                <programme-image v-if="p.has_image" :event-id="p.program_id" :channel-id="p.channelId" :has-logo="hasChannelLogo(p.channelId)" />
                <div class="deck-card-text">
                <div class="flex items-start justify-between gap-3">
                  <span class="deck-card-title">{{ p.title }}</span>
                  <span class="pill-group end">
                    <span v-if="isSeriesScheduled(p)" class="pill done">SERIES</span>
                    <span v-if="cellState(p) === 'recording'" class="pill recording">RECORDING</span>
                    <span v-else-if="cellState(p) === 'scheduled'" class="pill scheduled">SCHEDULED</span>
                    <span v-else-if="cellState(p) === 'series'" class="pill done">SERIES</span>
                    <span v-else-if="cellState(p) === 'recorded'" class="pill skipped">RECORDED</span>
                  </span>
                </div>
                <p class="deck-card-meta flex items-center gap-1.5">
                  <channel-logo class="shrink-0" :channel-id="p.channelId" :has-logo="hasChannelLogo(p.channelId)" />
                  <span>{{ p.channelName }} · {{ fmtDayTime(p.start) }}–{{ fmtClock(p.end) }}<template v-if="p.episode_title"> · {{ p.episode_title }}</template></span>
                </p>
                </div>
              </article>
              <p v-if="!searching && searchResults.length === 0" class="text-ink-dim text-sm">Nothing upcoming matches.</p>
            </div>
          </template>

          <template v-else-if="mode === 'guide'">
            <div v-if="!narrow" class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">DAY</span>
                <div class="chip-row md:flex-wrap">
                  <button v-for="d in dayChips" :key="d.day" type="button"
                    :class="['btn', 'btn-sm', day === d.day ? 'btn-on' : '']"
                    @click="setDay(d.day)"><span class="normal-case">{{ d.label }}</span></button>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-x-6 gap-y-3 md:ml-auto">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">JUMP</span>
                  <div class="chip-row">
                    <button type="button" class="btn btn-sm" @click="jumpNow">NOW</button>
                    <button type="button" class="btn btn-sm" @click="jumpTonight">TONIGHT</button>
                  </div>
                </div>
                <zoom-control :index="zoomIndex" :count="zoomLevelCount" @step="changeZoom" />
              </div>
            </div>
            <p v-if="guide?.stale" class="text-xs font-mono text-plex-yellow">
              Showing the cached guide. TVHeadend did not answer. It refreshes automatically on the next try.
            </p>
            <div v-if="errorCode === 'no-url'" class="space-y-3">
              <p class="text-sm text-ink">Set the TVHeadend URL in Settings.</p>
              <div class="flex items-center gap-2">
                <a href="#/settings" class="btn btn-sm btn-primary no-underline">OPEN SETTINGS</a>
                <button type="button" class="btn btn-sm" @click="loadDay(day, { force: true })"><refresh-icon /> RETRY</button>
              </div>
            </div>
            <div v-else-if="errorCode === 'no-channels'" class="space-y-3">
              <p class="text-sm text-ink">TVHeadend has no channels yet; scan and map them in TVHeadend.</p>
              <button type="button" class="btn btn-sm" @click="loadDay(day, { force: true })"><refresh-icon /> RETRY</button>
            </div>
            <div v-else-if="error" class="space-y-3">
              <p class="text-sm font-mono text-signal-orange-hi">{{ error }}</p>
              <p class="text-xs text-ink-dim">
                Check the TVHeadend connection in <a href="#/settings">Settings</a>.
              </p>
              <button type="button" class="btn btn-sm" @click="loadDay(day, { force: true })"><refresh-icon /> RETRY</button>
            </div>
            <div v-else-if="loading && !guide" class="text-ink-dim font-mono text-sm"><signal-bars-icon /> loading guide…</div>
            <div v-else-if="guide" class="relative" :style="{ '--epg-rail-px': 'min(' + railPx + 'px, 38vw)' }">
              <div class="epg-grid-edge" aria-hidden="true" :style="{ height: railStripH + 'px', right: scrollbarW + 'px' }"></div>
              <button v-if="pinsOffscreen" type="button" class="epg-pinned-chip" @click="scrollRailTop"><arrow-up-icon /> {{ pinnedCount }} FAVOURITES</button>
              <button v-if="midnightOnScreen && day < 6" type="button" class="epg-pinned-chip epg-next-day-chip"
                :style="{ right: 'calc(' + scrollbarW + 'px + 0.4rem)' }" :aria-label="'Go to ' + nextDayLongLabel"
                @click="goToNextDay">{{ narrow ? nextDayWeekday : nextDayLabel }} <chevron-right-icon /></button>
              <div :class="['epg-scroll', 'epg-zoom-' + zoom, { 'epg-zooming': zooming }]" ref="scrollEl"
                @pointerover="onGridPointer" @pointermove="onGridPointer" @pointerout="onGridPointerOut"
                @pointerdown="hideTooltip" @focusin="onGridFocusIn" @focusout="onGridFocusOut">
              <div class="epg-canvas" :style="{ width: 'calc(var(--epg-rail-px) + ' + (trackWidth + trackTailPx) + 'px)' }">
                <div class="epg-ruler">
                  <div class="epg-ruler-corner">
                    <input v-no-autofill v-model="railFilter" type="search" class="field-input epg-corner-filter"
                      :placeholder="narrow ? 'Filter' : 'Filter channels'" aria-label="Filter channels by number or name" />
                    <div class="epg-rail-edge" aria-hidden="true" :style="{ height: railStripH + 'px' }"></div>
                    <div class="epg-rail-resizer" title="Drag to resize the channel rail"
                      :style="{ height: railStripH + 'px' }"
                      @pointerdown="onRailResizeDown"
                      @pointermove="onRailResizeMove"
                      @pointerup="onRailResizeUp"
                      @pointercancel="onRailResizeUp"></div>
                  </div>
                  <div class="epg-ruler-track" :style="{ width: trackWidth + 'px' }">
                    <span v-for="t in ticks" :key="t.x" :class="['epg-tick', { half: t.half }]" :style="{ left: t.x + 'px' }">{{ t.label }}</span>
                    <span class="epg-tick epg-midnight-tick" :style="{ left: midnightX + 'px' }"><calendar-icon /> {{ nextDayLabel }}</span>
                  </div>
                </div>
                <div class="epg-midnight-line" aria-hidden="true" :style="{ left: 'calc(var(--epg-rail-px) + ' + midnightX + 'px)' }"></div>
                <div v-if="day === 6" class="epg-guide-end-lane" :style="{ left: 'calc(var(--epg-rail-px) + ' + midnightX + 'px)' }">
                  <span class="epg-guide-end">Guide ends {{ lastDayLabel }}</span>
                </div>
                <transition-group name="epg-rows" tag="div">
                <div v-for="{ kind, key, label, shown, ch } in railItems" :key="key"
                  v-show="shown"
                  v-memo="[ch, label, shown, loadingIds.has(ch?.id), loadingNoteMaxPx, nowMs, state, railNumWidth, showImages, zoom, thumbMinCellPx, dropTargetId === key, dropTargetId === key && dropAfter, dragPinId === key]"
                  :data-channel-id="ch?.id"
                  :class="kind === 'heading' ? 'epg-heading-row' : ['epg-row', { pinned: ch.pinned, 'epg-drop-target': dropTargetId === key, 'epg-drop-after': dropAfter && dropTargetId === key, 'epg-dragging': dragPinId === key }]">
                  <template v-if="kind === 'heading'">
                    <div class="epg-heading-rail"><span class="channel-group-heading">{{ label }}</span></div>
                    <div class="epg-heading-track"></div>
                  </template>
                  <template v-else>
                  <div :class="['epg-rail-cell', { 'off-air': ch.offAir }]"
                    :title="ch.pinned ? 'Drag to reorder favourites' : null"
                    @pointerdown="onPinPointerDown(ch, $event)"
                    @pointermove="onPinPointerMove"
                    @pointerup="onPinPointerUp"
                    @pointercancel="onPinPointerCancel">
                    <channel-identity :channel="ch" :has-logo="Boolean(ch.logos?.length)" :number="railNum(ch)" @pin="togglePin(ch)" />
                  </div>
                  <div class="epg-track" :style="{ width: trackWidth + 'px' }">
                    <span v-if="loadingIds.has(ch.id)" class="epg-loading-note" role="status"
                      :title="LISTINGS_LOADING_TEXT"
                      :style="{ left: (nowX ?? 0) + 8 + 'px', maxWidth: loadingNoteMaxPx + 'px' }">{{ LISTINGS_LOADING_TEXT }}</span>
                    <button v-for="p in guide.programs[ch.id]" :key="p.program_id + '-' + p.start" type="button"
                      :class="['epg-cell', cellState(p), { past: p.past || p.end <= nowMs, 'on-now': p.start <= nowMs && p.end > nowMs, 'next-day': p.start >= guide.dayEnd, 'with-thumb': cellHasThumb(p) }]"
                      :style="cellStyle(p)" :aria-label="cellTitle(p)" :data-key="cellKey(ch, p)"
                      @click="openProgram(p, ch)">
                      <programme-image v-if="cellHasThumb(p)" :event-id="p.program_id" variant="cell"
                        :channel-id="ch.id" :has-logo="Boolean(ch.logos?.length)" />
                      <span v-if="cellState(p) === 'recording'" class="epg-cell-rec-fill" :style="{ width: recordingFillPercent(p) + '%' }"></span>
                      <template v-if="cellShowsText(p)">
                        <span class="epg-cell-title">{{ p.title }}</span>
                        <span class="epg-cell-meta">
                          <span v-if="cellState(p) === 'recording'" class="led-dot sm live"></span>
                          <span v-else-if="cellState(p) === 'scheduled'" class="led-dot sm" style="background:#1eb6ff"></span>
                          <span v-else-if="cellState(p) === 'series'" class="led-dot sm" style="background:#e2b03c"></span>
                          <span v-else-if="cellState(p) === 'recorded'" class="led-dot sm" style="background:#9a9289"></span>
                          <span v-if="isSeriesScheduled(p)" class="led-dot sm" style="background:#e2b03c"></span>
                          {{ fmtClock(p.start) }}
                        </span>
                      </template>
                    </button>
                  </div>
                  </template>
                </div>
                </transition-group>
                <div v-if="day === 0 && nowX != null" class="epg-nowline" :style="{ left: 'calc(var(--epg-rail-px) + ' + nowX + 'px)' }"></div>
              </div>
              </div>
              <teleport to="body">
              <div v-if="narrow && !selected && !channelsModal" class="epg-float-cluster" role="group" aria-label="Jump and zoom">
                <button type="button" class="epg-float-btn" @click="jumpNow">NOW</button>
                <button type="button" class="epg-float-btn" @click="jumpTonight">TONIGHT</button>
                <button type="button" class="epg-float-btn epg-float-icon" aria-label="Zoom out"
                  :disabled="zoomIndex === 0" @click="changeZoom(-1)"><minus-icon /></button>
                <button type="button" class="epg-float-btn epg-float-icon" aria-label="Zoom in"
                  :disabled="zoomIndex === zoomLevelCount - 1" @click="changeZoom(1)"><plus-icon /></button>
              </div>
              </teleport>
            </div>
            <p v-if="stateLine" class="epg-state-line font-mono text-ink-mute">{{ stateLine }}</p>
          </template>

          <template v-else-if="mode === 'upcoming'">
            <p v-if="stateError" class="text-sm font-mono text-signal-orange-hi">{{ stateError }}</p>
            <div v-else-if="!state" class="text-ink-dim font-mono text-sm"><signal-bars-icon /> contacting TVHeadend…</div>
            <template v-else>
              <p v-if="state?.stale" class="text-xs font-mono text-plex-yellow">TVHeadend is not answering. This is its last known state.</p>
              <p v-if="upcoming.length === 0" class="text-ink-dim text-sm">Nothing scheduled in TVHeadend.</p>
              <p v-else-if="upcomingFiltered.length === 0" class="text-ink-dim text-sm">No upcoming recordings match “{{ searchQ.trim() }}”.</p>
              <div v-else class="space-y-3">
                <article v-for="r in upcomingFiltered" :key="r.programId + '-' + r.source"
                  class="deck-card deck-card-clickable deck-card-with-image" role="button" tabindex="0"
                  @click="openUpcoming(r)"
                  @keydown.enter.prevent="openUpcoming(r)"
                  @keydown.space.prevent="openUpcoming(r)">
                  <programme-image v-if="r.hasImage" :event-id="r.programId" :channel-id="r.channelId" :has-logo="hasChannelLogo(r.channelId)" />
                  <div class="deck-card-text">
                  <div class="flex items-start justify-between gap-3">
                    <span class="deck-card-title">{{ r.name }}</span>
                    <span class="pill-group end">
                      <template v-if="r.source === 'series'">
                        <span class="pill done">SERIES</span>
                        <span class="pill">EXPECTED</span>
                      </template>
                      <template v-else>
                        <span v-if="isSeriesRec(r)" class="pill done">SERIES</span>
                        <span v-else class="pill">ONE-OFF</span>
                        <span v-if="isActiveRecording(r)" class="pill recording">RECORDING</span>
                        <span v-else class="pill scheduled">SCHEDULED</span>
                      </template>
                    </span>
                  </div>
                  <p class="deck-card-meta flex items-center gap-1.5">
                    <channel-logo class="shrink-0" :channel-id="r.channelId" :has-logo="hasChannelLogo(r.channelId)" />
                    <span>{{ channelName(r.channelId) }} · {{ fmtDayTime(tsOf(r.startDate)) }}–{{ fmtClock(tsOf(r.endDate)) }}<template v-if="r.episodeTitle"> · {{ r.episodeTitle }}</template></span>
                  </p>
                  </div>
                </article>
              </div>
            </template>
          </template>

        </div>
      </section>

      <teleport to="body">
      <transition name="epg-sheet">
      <div v-if="selected" class="epg-modal-backdrop is-over-player" @click.self="closeModal">
        <section class="panel epg-modal">
          <header class="panel-header">
            <span class="panel-title">{{ selected.program.title }}</span>
            <button type="button" class="btn btn-sm btn-icon epg-modal-x" @click="closeModal" aria-label="Close"><cross-icon /></button>
          </header>
          <programme-image v-if="selected.program.has_image" :key="selected.program.program_id" :event-id="selected.program.program_id" variant="hero"
            :channel-id="selected.channel?.id ?? selected.program.channelId" :has-logo="hasChannelLogo(selected.channel?.id ?? selected.program.channelId)" />
          <div class="panel-body space-y-4">
            <p class="text-sm font-mono text-ink-dim">
              {{ selected.channel?.name || channelName(selected.program.channelId) }}<template v-if="selected.program.start"> ·
              <span class="hidden md:inline">{{ fmtDayTime(selected.program.start) }}–{{ fmtClock(selected.program.end) }}</span><span class="md:hidden">{{ fmtShortRange(selected.program.start, selected.program.end) }}</span></template>
              <template v-if="ratingLabel(selected.program)"> · {{ ratingLabel(selected.program) }}</template>
              <template v-if="seLabel(selected.program)"> · {{ seLabel(selected.program) }}</template>
            </p>
            <p v-if="selected.program.episode_title" class="text-sm text-ink">{{ selected.program.episode_title }}</p>
            <p v-if="selected.program.synopsis" class="text-sm text-ink-dim leading-relaxed">{{ selected.program.synopsis }}</p>
            <p v-if="cellState(selected.program) === 'scheduled' || cellState(selected.program) === 'recording'" class="text-xs font-mono text-signal-blue-hi">
              {{ cellState(selected.program) === 'recording' ? 'Recording now in TVHeadend' : 'Scheduled to record in TVHeadend' }}{{ isSeriesScheduled(selected.program) ? ' (part of a series recording).' : ' (one-off recording).' }}
            </p>
            <p v-else-if="cellState(selected.program) === 'series'" class="text-xs font-mono" style="color:#e2b03c">
              A series recording in TVHeadend records this show.
            </p>
            <div v-if="canRecord" class="grid grid-cols-2 gap-3">
              <div>
                <label class="field-label">START EARLY</label>
                <select v-model.number="leadTime" class="field-input">
                  <option v-for="m in leadOptions" :key="m" :value="m">{{ minutesLabel(m) }}</option>
                </select>
              </div>
              <div>
                <label class="field-label">RUN LATE</label>
                <select v-model.number="lagTime" class="field-input">
                  <option v-for="m in lagOptions" :key="m" :value="m">{{ minutesLabel(m) }}</option>
                </select>
              </div>
              <div v-if="selected.program.series_link" class="col-span-2">
                <label class="field-label">SERIES · EPISODES TO KEEP</label>
                <select v-model.number="episodesToKeep" class="field-input">
                  <option v-for="o in keepOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div v-if="selected.program.series_link" class="col-span-2 space-y-1">
                <toggle-switch v-model="anyChannel">RECORD ON ANY CHANNEL</toggle-switch>
                <p class="text-xs font-mono text-ink-mute">Off: the series recording covers {{ selected.channel?.name || channelName(selected.program.channelId) }} only. On: it records the show on whichever channel airs it.</p>
              </div>
              <div class="col-span-2 space-y-1">
                <toggle-switch v-model="addToLibrary">ADD TO LIBRARY</toggle-switch>
                <p class="text-xs font-mono text-ink-mute">{{ libraryNote.text }}<template v-if="libraryNote.changeable"> Change it in <a href="#/series">SERIES</a>.</template></p>
              </div>
            </div>
            <div class="epg-modal-actions flex flex-wrap items-center justify-end gap-2 pt-1">
              <button type="button" class="btn epg-modal-close mr-auto" @click="closeModal" aria-label="Close"><cross-icon v-if="!hasCancelAction" /> CLOSE</button>
              <span v-if="modalStatusText" :class="['status-readout', modalStatusKind]">{{ modalStatusText }}</span>
              <button v-if="canWatchLive" type="button" class="btn btn-primary" @click="watchSelected"><tv-icon /> WATCH LIVE</button>
              <template v-if="cellState(selected.program) === 'scheduled' || cellState(selected.program) === 'recording'">
                <template v-if="isSeriesScheduled(selected.program) && cancelChoice">
                  <span class="text-xs font-mono text-ink-mute">This is part of a series recording. Cancel what?</span>
                  <button type="button" class="btn btn-danger" :class="{ 'is-busy': modalAction === 'cancel-episode' }" @click="cancelSelected" :disabled="modalBusy">
                    <span class="btn-label"><cross-icon /> THIS EPISODE</span>
                    <span v-if="modalAction === 'cancel-episode'" class="spinner spinner-overlay"></span>
                  </button>
                  <button type="button" class="btn btn-danger" :class="{ 'is-busy': modalAction === 'cancel-whole' }" @click="cancelSelectedSeries" :disabled="modalBusy">
                    <span class="btn-label"><cross-icon /> WHOLE SERIES</span>
                    <span v-if="modalAction === 'cancel-whole'" class="spinner spinner-overlay"></span>
                  </button>
                  <button type="button" class="btn" @click="cancelChoice = false" :disabled="modalBusy">KEEP</button>
                </template>
                <button v-else type="button" class="btn btn-danger" :class="{ 'is-busy': modalAction === 'cancel' }"
                  @click="isSeriesScheduled(selected.program) ? (cancelChoice = true) : cancelSelected()" :disabled="modalBusy">
                  <span class="btn-label"><cross-icon /> CANCEL RECORDING</span>
                  <span v-if="modalAction === 'cancel'" class="spinner spinner-overlay"></span>
                </button>
              </template>
              <template v-else-if="cellState(selected.program) === 'series'">
                <button type="button" class="btn btn-danger" :class="{ 'is-busy': modalAction === 'cancel-series' }" @click="cancelSelectedSeries" :disabled="modalBusy">
                  <span class="btn-label"><cross-icon /> CANCEL SERIES</span>
                  <span v-if="modalAction === 'cancel-series'" class="spinner spinner-overlay"></span>
                </button>
              </template>
              <template v-else-if="canRecord">
                <button v-if="selected.program.series_link" type="button" class="btn" :class="{ 'is-busy': modalAction === 'record-series' }" @click="recordSelectedSeries" :disabled="modalBusy">
                  <span class="btn-label"><record-icon /> RECORD SERIES</span>
                  <span v-if="modalAction === 'record-series'" class="spinner spinner-overlay"></span>
                </button>
                <button type="button" :class="['btn', { 'btn-primary': !canWatchLive, 'is-busy': modalAction === 'record' }]" @click="recordSelected" :disabled="modalBusy">
                  <span class="btn-label"><record-icon /> RECORD</span>
                  <span v-if="modalAction === 'record'" class="spinner spinner-overlay"></span>
                </button>
              </template>
              <p v-else class="text-xs font-mono text-ink-mute">This programme has already aired.</p>
            </div>
          </div>
        </section>
      </div>
      </transition>
      </teleport>

      <teleport to="body">
      <transition name="epg-sheet">
      <div v-if="hdOffer" class="epg-modal-backdrop is-over-player" @click.self="hdOffer = null">
        <section class="panel epg-modal info-modal" role="alertdialog" aria-modal="true" aria-labelledby="hd-offer-title">
          <header class="panel-header">
            <span id="hd-offer-title" class="panel-title">This is the SD channel</span>
            <button type="button" class="btn btn-sm btn-icon epg-modal-x" @click="hdOffer = null" aria-label="Close"><cross-icon /></button>
          </header>
          <div class="panel-body space-y-4">
            <p class="text-sm text-ink">{{ hdOffer.channel.name }} shows the same programme in HD.</p>
            <div class="epg-modal-actions flex flex-wrap items-center justify-end gap-2">
              <button type="button" class="btn epg-modal-close mr-auto" @click="hdOffer = null">CANCEL</button>
              <button type="button" class="btn" @click="recordOffered('sd')"><record-icon /> RECORD IN SD</button>
              <button type="button" class="btn btn-primary" @click="recordOffered('hd')"><record-icon /> RECORD IN HD</button>
            </div>
          </div>
        </section>
      </div>
      </transition>
      </teleport>

      <teleport to="body">
      <transition name="epg-tip">
      <div v-if="tooltip" ref="tooltipEl" class="epg-tooltip" aria-hidden="true">
        <div class="epg-tooltip-title">{{ tooltip.programme.title }}</div>
        <div v-if="tooltip.programme.episode_title || seLabel(tooltip.programme)" class="epg-tooltip-episode">
          <span v-if="seLabel(tooltip.programme)" class="epg-tooltip-se">{{ seLabel(tooltip.programme) }}</span>
          <span v-if="tooltip.programme.episode_title">{{ tooltip.programme.episode_title }}</span>
        </div>
        <div class="epg-tooltip-meta">{{ fmtProgrammeRange(tooltip.programme) }} · {{ tooltip.channel.name }}</div>
        <div v-if="recordingStateText(tooltip.programme)" :class="['epg-tooltip-state', cellState(tooltip.programme)]">
          <span :class="['led-dot', 'sm', { live: cellState(tooltip.programme) === 'recording' }]"></span>
          {{ recordingStateText(tooltip.programme) }}
        </div>
        <p v-if="tooltip.programme.synopsis" class="epg-tooltip-synopsis">{{ tooltip.programme.synopsis }}</p>
      </div>
      </transition>
      </teleport>

      <teleport to="body">
      <transition name="epg-sheet">
      <channels-modal v-if="channelsModal" :channels="guide?.channels || []" :hidden-ids="guide?.hiddenIds || []"
        :sort="guide?.sort" :hide-sd-simulcasts="guide?.hideSdSimulcasts" :hide-sd-channels="guide?.hideSdChannels"
        @close="channelsModal = false" @saved="onChannelPrefsSaved" />
      </transition>
      </teleport>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash } = useFlash()
    const mode = ref('guide')
    const modes = [
      { key: 'guide', label: 'GUIDE' },
      { key: 'upcoming', label: 'UPCOMING' },
    ]
    const day = ref(0)
    const guide = ref(null)
    const guideByDay = new Map()
    const loading = ref(false)
    const error = ref('')
    const errorCode = ref('')
    const state = ref(null)
    const stateError = ref('')
    const scrollEl = ref(null)
    const searchQ = ref('')
    const searchResults = ref([])
    const searching = ref(false)
    const selected = ref(null)
    const modalBusy = ref(false)
    const modalAction = ref('')
    const busyId = ref(null)
    const channelsModal = ref(false)
    const [modalStatusText, modalStatusKind, setModalStatus] = makeStatus()

    watch([selected, channelsModal], ([program, channels]) => {
      try { document.body.classList.toggle('sheet-open', Boolean(program || channels)) } catch { /* ignore */ }
    })
    onUnmounted(() => {
      try { document.body.classList.remove('sheet-open') } catch { /* ignore */ }
    })
    const leadTime = ref(2)
    const lagTime = ref(10)
    const episodesToKeep = ref(0)
    const anyChannel = ref(false)
    const addToLibrary = ref(true)
    const showRules = ref([])
    const moviesFolderSet = ref(false)
    const loadShowRules = async () => {
      const [r, s] = await Promise.all([
        api('GET', '/api/shows').catch(() => ({ shows: [] })),
        api('GET', '/api/settings').catch(() => ({})),
      ])
      showRules.value = (r.shows || []).filter((rule) => rule.enabled)
      moviesFolderSet.value = Boolean(s.movies_root)
    }
    const looksLikeFilm = (p) => p.genre >= 0x10 && p.genre <= 0x1f
      && p.series_no == null && p.episode_no == null && p.end - p.start >= 75 * 60_000
    const ruleFor = (title) => {
      const t = String(title || '').toLowerCase()
      return showRules.value
        .filter((rule) => t.includes(rule.show_pattern.toLowerCase()))
        .sort((a, b) => b.show_pattern.length - a.show_pattern.length)[0] || null
    }
    const libraryNote = computed(() => {
      const program = selected.value?.program
      if (!program) return { text: '' }
      if (!addToLibrary.value) return { text: 'Stays in TVHeadend. Freetvarr does not import it.' }
      const folder = ruleFor(program.title)
      if (folder) return { text: `Episodes go into ${folder.dest_folder} in your TV library.`, changeable: true }
      if (moviesFolderSet.value && looksLikeFilm(program)) return { text: 'The guide lists this as a film, so it goes to the movies folder.' }
      if (!program.series_link) return { text: 'Goes to the one-off folder.' }
      return {
        text: 'RECORD puts this airing in the one-off folder. RECORD SERIES gives the series its own folder in your TV library.',
        changeable: true,
      }
    })

    const clampRailPx = (px) => Math.min(EPG_RAIL_MAX_PX, Math.max(EPG_RAIL_MIN_PX, px))
    const storedRailPx = () => {
      try {
        const px = Number(localStorage.getItem(EPG_RAIL_KEY))
        return Number.isFinite(px) && px > 0 ? clampRailPx(px) : EPG_RAIL_DEFAULT_PX
      } catch { return EPG_RAIL_DEFAULT_PX }
    }
    const railPx = ref(storedRailPx())

    const zoom = storedChoice({ key: EPG_ZOOM_KEY, options: EPG_ZOOM_LEVELS.map((l) => l.key), fallback: 'm' })
    const zoomIndex = computed(() => EPG_ZOOM_LEVELS.findIndex((l) => l.key === zoom.value))
    const zoomLevel = computed(() => EPG_ZOOM_LEVELS[zoomIndex.value])
    const pxPerMin = computed(() => zoomLevel.value.pxPerMin)
    const trackWidth = computed(() => (guide.value ? spillLengthMin(guide.value) : 24 * 60) * pxPerMin.value)
    const midnightX = computed(() => (guide.value ? dayLengthMin(guide.value) : 24 * 60) * pxPerMin.value)
    const zooming = ref(false)
    const narrow = useMediaQuery(EPG_NARROW_QUERY)

    const thumbMinCellPx = computed(() => {
      const rowRem = narrow.value ? zoomLevel.value.narrowRowRem : zoomLevel.value.rowRem
      const thumbPx = ((rowRem * 16 - EPG_CELL_INSET_PX) * 16) / 9
      return Math.round(thumbPx) + EPG_THUMB_TEXT_MIN_PX
    })

    // Minute resolution on purpose: the seconds clock ref would otherwise
    // re-render every grid cell once a second (past/on-now classes read this).
    const nowMs = computed(() => Math.floor(now.value.getTime() / 60_000) * 60_000)

    const railFilter = ref('')
    const showImages = storedFlag({ key: EPG_IMAGES_KEY, fallback: true })

    const visibleChannels = computed(() =>
      (guide.value?.channels || []).filter((c) => !c.hidden))

    // The filter hides rows with v-show instead of removing them from the
    // v-for: toggling display is a style flip, while remove-and-remount pays
    // for every programme cell again.
    const railMatchIds = computed(() => {
      const q = railFilter.value.trim().toLowerCase()
      if (!q) return null
      const set = new Set()
      for (const c of visibleChannels.value) {
        if ((c.name || '').toLowerCase().includes(q) || String(c.number ?? '').startsWith(q)) {
          set.add(String(c.id))
        }
      }
      return set
    })

    const rowShown = (ch) => !railMatchIds.value || railMatchIds.value.has(String(ch.id))

    const railItems = computed(() => {
      const shownChannels = visibleChannels.value.filter(rowShown)
      const groupShown = (pinned) => shownChannels.some((c) => Boolean(c.pinned) === pinned)
      const anyPinned = groupShown(true)
      const headedGroups = new Set()
      const groupHeading = (pinned) => ({
        kind: 'heading',
        key: pinned ? 'h-fav' : 'h-other',
        label: channelGroupLabel({ pinned, anyPinned }),
        shown: groupShown(pinned),
      })
      return visibleChannels.value.flatMap((ch) => {
        const pinned = Boolean(ch.pinned)
        const entry = { kind: 'channel', key: String(ch.id), shown: rowShown(ch), ch }
        if (headedGroups.has(pinned)) return [entry]
        headedGroups.add(pinned)
        return [groupHeading(pinned), entry]
      })
    })

    const pinnedCount = computed(() => visibleChannels.value.filter((c) => c.pinned).length)

    const railNumWidth = computed(() =>
      Math.max(2, ...visibleChannels.value.map((c) => String(c.number ?? '').length)))
    const railNum = (ch) =>
      ch.number == null ? '' : String(ch.number).padStart(railNumWidth.value, '0')

    const ticks = computed(() => {
      if (!guide.value) return []
      const stepMin = zoomLevel.value.halfHourTicks ? 30 : 60
      const { dayStart, spillEnd } = guide.value
      const midnightMin = dayLengthMin(guide.value)
      return rulerTickMinutes({ dayStart, dayEnd: spillEnd, stepMin })
        .filter((min) => min !== midnightMin)
        .map((min) => ({
          x: min * pxPerMin.value,
          label: fmtClock(dayStart + min * 60_000),
          half: min % 60 !== 0,
        }))
    })

    const nowX = computed(() => {
      if (!guide.value) return null
      const x = ((nowMs.value - guide.value.dayStart) / 60_000) * pxPerMin.value
      return x >= 0 && x <= trackWidth.value ? x : null
    })

    const scrollViewW = ref(0)

    const loadingIds = computed(() => new Set(guide.value?.loadingListings || []))

    const loadingNoteMaxPx = computed(() => Math.max(scrollViewW.value - railPx.value - 24, 120))

    const trackTailPx = computed(() => {
      if (day.value !== 0 || nowX.value == null) return 0
      return Math.max(0, Math.ceil(nowX.value + scrollViewW.value * (1 - EPG_NOW_ANCHOR) - trackWidth.value))
    })

    const todayNumber = computed(() => localDayNumber({ ms: nowMs.value, timeZone: tz.value }))

    const dayChips = computed(() => Array.from({ length: 7 }, (_, d) => {
      if (d === 0) return { day: 0, label: 'TODAY' }
      return { day: d, label: weekdayOfDayNumber(todayNumber.value + d) }
    }))

    const noonOf = (ms) => new Date(ms + 12 * 3_600_000)
    const nextDayNoon = computed(() => noonOf(guide.value?.dayEnd ?? 0))
    const nextDayLabel = computed(() => formatDate(nextDayNoon.value.getTime(), tz.value))
    const nextDayWeekday = computed(() => dateFormat({ weekday: 'short' }).format(nextDayNoon.value))
    const nextDayLongLabel = computed(() => formatDate(nextDayNoon.value.getTime(), tz.value, { long: true }))
    const lastDayLabel = computed(() => formatDate(noonOf(guide.value?.dayStart ?? 0).getTime(), tz.value))

    const dayTitle = computed(() => {
      if (!guide.value) return dayChips.value[day.value]?.label || ''
      const weekday = narrow.value ? 'short' : 'long'
      return formatDate(guide.value.dayStart + 12 * 3_600_000, tz.value, { weekday })
    })

    const scheduledByProgramId = computed(() => {
      const map = new Map()
      for (const r of state.value?.futureRecordings || []) {
        if (r?.programId != null) map.set(String(r.programId), r)
      }
      return map
    })

    const activeRecordingSet = computed(() =>
      new Set((state.value?.activeRecordingIds || []).map(String)))

    const seriesLinkSet = computed(() => {
      const set = new Set()
      for (const t of state.value?.seriesTags || []) {
        const link = t?.seriesLinkId ?? t?.id
        if (link != null) set.add(String(link))
      }
      return set
    })

    const upcoming = computed(() => {
      const list = state.value?.upcomingRecordings
        ?? (state.value?.futureRecordings || []).filter((r) => !r.pendingDelete)
      return [...list].sort((a, b) => tsOf(a.startDate) - tsOf(b.startDate))
    })

    const seriesTags = computed(() => state.value?.seriesTags || [])

    const scheduledCount = computed(() =>
      (state.value?.futureRecordings || []).filter((r) => !r.pendingDelete).length)

    const stateLine = computed(() => {
      if (!state.value) return ''
      const bits = [
        state.value.stale ? 'tvheadend unreachable' : 'tvheadend online',
        `${scheduledCount.value} scheduled`,
        `${seriesTags.value.length} series`,
      ]
      if (state.value.tunerCount) {
        bits.push(`${state.value.tunerCount} tuner${state.value.tunerCount === 1 ? '' : 's'}`)
      }
      if (state.value.storageInfo?.free) {
        bits.push(`${fmtBytes(state.value.storageInfo.free)} free`)
      }
      return bits.join(' · ')
    })

    const searchActive = computed(() => searchQ.value.trim().length >= 2)

    const searchPlaceholder = computed(() => {
      if (mode.value === 'upcoming') return 'Filter upcoming…'
      return 'Search the next 7 days…'
    })

    const listFilter = computed(() => searchQ.value.trim().toLowerCase())

    const upcomingFiltered = computed(() => {
      const q = listFilter.value
      if (!q) return upcoming.value
      return upcoming.value.filter((r) =>
        `${r.name || ''} ${r.episodeTitle || ''} ${channelName(r.channelId) || ''}`.toLowerCase().includes(q))
    })

    const canRecord = computed(() =>
      selected.value && selected.value.program.end > nowMs.value
      && (selected.value.channel?.recordable !== false))

    const canWatchLive = computed(() => {
      if (!selected.value?.channel) return false
      const { start, end } = selected.value.program
      const t = now.value.getTime()
      return Boolean(start) && start <= t && end > t
    })

    const hasCancelAction = computed(() => Boolean(selected.value)
      && ['scheduled', 'recording', 'series'].includes(cellState(selected.value.program)))

    const watchSelected = () => {
      const { program, channel } = selected.value
      closeModal()
      watchLive({ channel: liveChannelOf(channel), nowTitle: program.title })
    }

    const tsOf = tsOfMs
    const fmtClock = fmtClockTz

    const fmtDayTime = (ms) => `${formatDate(ms, tz.value)} ${fmtClock(ms)}`

    const fmtShortRange = (start, end) => `${fmtDayTime(start)}–${fmtClock(end)}`

    const ratingLabel = (p) => {
      const r = p?.rating
      return typeof r === 'string' && r && Number.isNaN(Number(r)) ? r : ''
    }

    const seLabel = (p) => {
      if (p.series_no == null && p.episode_no == null) return ''
      const s = p.series_no != null ? `S${String(p.series_no).padStart(2, '0')}` : ''
      const e = p.episode_no != null ? `E${String(p.episode_no).padStart(2, '0')}` : ''
      return `${s}${e}`
    }

    const channelById = (id) =>
      (guide.value?.channels || []).find((c) => String(c.id) === String(id)) || null

    const channelName = (id) => channelById(id)?.name || `channel ${id}`

    const hasChannelLogo = (id) => Boolean(channelById(id)?.logos?.length)


    const cellState = (p) => {
      if (p.past) return p.recorded ? 'recorded' : ''
      const scheduled = scheduledByProgramId.value.get(String(p.program_id ?? p.programId))
      if (scheduled && activeRecordingSet.value.has(String(scheduled.programId))) return 'recording'
      if (scheduled) return 'scheduled'
      if (findSeriesLink({ links: seriesLinkSet.value, seriesLink: p.series_link })) return 'series'
      return ''
    }

    const isSeriesScheduled = (p) => {
      const scheduled = scheduledByProgramId.value.get(String(p.program_id ?? p.programId))
      return Boolean(scheduled?.seriesLinkId != null
        && seriesLinkSet.value.has(String(scheduled.seriesLinkId)))
    }

    const recordingStateText = (p) => {
      const state = cellState(p)
      if (state === 'recording') return 'recording now'
      if (state === 'scheduled') {
        return isSeriesScheduled(p) ? 'series recording scheduled' : 'one-off recording scheduled'
      }
      if (state === 'series') return 'series recording set'
      if (state === 'recorded') return 'recorded'
      return ''
    }

    const cellTitle = (p) => [p.title, recordingStateText(p)].filter(Boolean).join(' · ')

    const cellKey = (ch, p) => `${ch.id}|${p.program_id}|${p.start}`

    const cellX = (t) => {
      const clamped = Math.max(t, guide.value.dayStart)
      return ((clamped - guide.value.dayStart) / 60_000) * pxPerMin.value
    }

    const cellWidth = (p) => {
      const start = Math.max(p.start, guide.value.dayStart)
      const end = Math.min(p.end, guide.value.spillEnd)
      return Math.max(((end - start) / 60_000) * pxPerMin.value - 2, 6)
    }

    const cellShowsText = (p) => cellWidth(p) > EPG_CELL_TEXT_MIN_PX

    const cellHasThumb = (p) => showImages.value && p.has_image && cellWidth(p) >= thumbMinCellPx.value

    const recordingFillPercent = (p) => {
      const span = p.end - p.start
      if (span <= 0) return 0
      return Math.min(100, Math.max(0, ((nowMs.value - p.start) / span) * 100))
    }

    const cellStyle = (p) => ({
      left: `${cellX(p.start)}px`,
      width: `${cellWidth(p)}px`,
    })

    const loadDay = async (d, { force = false } = {}) => {
      error.value = ''
      errorCode.value = ''
      if (!force && guideByDay.has(d)) {
        guide.value = guideByDay.get(d)
        return
      }
      loading.value = true
      try {
        const g = await api('GET', `/api/epg/guide?day=${d}`)
        guideByDay.set(d, g)
        if (day.value === d) guide.value = g
      } catch (err) {
        error.value = `Guide load failed: ${err.message}`
        errorCode.value = err.code || ''
      } finally {
        loading.value = false
      }
    }

    const loadState = async ({ fresh = false } = {}) => {
      stateError.value = ''
      try {
        state.value = await api('GET', `/api/epg/state${fresh ? '?fresh=1' : ''}`)
      } catch (err) {
        stateError.value = `TVHeadend state failed: ${err.message}`
      }
    }

    const scrollToMs = async (ms, { anchor = 0, leadPx = 60 } = {}) => {
      await nextTick()
      if (!scrollEl.value || !guide.value) return
      scrollViewW.value = scrollEl.value.clientWidth
      await nextTick()
      const x = ((ms - guide.value.dayStart) / 60_000) * pxPerMin.value
      const trackWidth = scrollEl.value.clientWidth - railWidthOf(scrollEl.value)
      const offset = anchor ? trackWidth * anchor : leadPx
      scrollEl.value.scrollLeft = Math.max(0, x - offset)
    }

    const scrollToNow = () => scrollToMs(Date.now(), { anchor: EPG_NOW_ANCHOR })

    const clockOfDay = (hour) =>
      localClockMs({ dayStart: guide.value?.dayStart ?? 0, hour, timeZone: tz.value })

    const rollOverToToday = async () => {
      guideByDay.clear()
      await loadDay(0, { force: true })
      if (mode.value === 'guide' && !searchActive.value) await scrollToNow()
    }

    watch(nowMs, (ms) => {
      if (day.value !== 0 || loading.value || !guide.value || ms < guide.value.dayEnd) return
      rollOverToToday()
    })

    const setDay = async (d, { atMs = null } = {}) => {
      day.value = d
      await loadDay(d)
      if (atMs != null) await scrollToMs(Math.max(atMs, guide.value?.dayStart ?? atMs), { leadPx: 0 })
      else if (d === 0) await scrollToNow()
      else await scrollToMs(clockOfDay(18))
    }

    const leftEdgeMs = () => guide.value.dayStart + (scrollEl.value.scrollLeft / pxPerMin.value) * 60_000

    const goToNextDay = () => setDay(day.value + 1, { atMs: leftEdgeMs() })

    const setMode = async (m) => {
      if (m !== mode.value) searchQ.value = ''
      mode.value = m
      if (m !== 'guide') {
        loadState()
        return
      }
      if (day.value === 0) await scrollToNow()
      else await scrollToMs(clockOfDay(18))
    }

    const jumpNow = async () => {
      if (day.value !== 0) await setDay(0)
      else await scrollToNow()
    }

    const jumpTonight = async () => {
      if (day.value !== 0) { day.value = 0; await loadDay(0) }
      await scrollToMs(clockOfDay(19))
    }

    const railWidthOf = (el) => el.querySelector('.epg-ruler-corner')?.offsetWidth || 0

    const firstVisibleRow = (el) => {
      const top = el.scrollTop + (el.querySelector('.epg-ruler')?.offsetHeight || 0)
      const row = [...el.querySelectorAll('.epg-row')]
        .find((r) => r.offsetHeight > 0 && r.offsetTop + r.offsetHeight > top)
      return row ? { el: row, offset: row.offsetTop - el.scrollTop } : null
    }

    const captureZoomAnchor = (el) => {
      const viewW = el.clientWidth - railWidthOf(el)
      const nowOnScreen = day.value === 0 && nowX.value != null
        && nowX.value >= el.scrollLeft && nowX.value <= el.scrollLeft + viewW
      const screenX = nowOnScreen ? nowX.value - el.scrollLeft : viewW / 2
      return { minutes: (el.scrollLeft + screenX) / pxPerMin.value, screenX, row: firstVisibleRow(el) }
    }

    const restoreZoomAnchor = (el, { minutes, screenX, row }) => {
      el.scrollLeft = minutes * pxPerMin.value - screenX
      if (row) el.scrollTop = row.el.offsetTop - row.offset
    }

    const changeZoom = async (step) => {
      const level = EPG_ZOOM_LEVELS[zoomIndex.value + step]
      if (!level) return
      const el = scrollEl.value
      const anchor = el && guide.value ? captureZoomAnchor(el) : null
      zooming.value = true
      zoom.value = level.key
      await nextTick()
      if (anchor) restoreZoomAnchor(el, anchor)
      requestAnimationFrame(() => { zooming.value = false })
    }

    const manualRefresh = async () => {
      guideByDay.clear()
      await Promise.all([loadDay(day.value, { force: true }), loadState({ fresh: true })])
      if (!error.value) flash({ msg: 'Guide refreshed.' })
    }

    const openProgram = (p, channel) => {
      leadTime.value = 2
      lagTime.value = 10
      episodesToKeep.value = 0
      anyChannel.value = false
      addToLibrary.value = true
      cancelChoice.value = false
      modalAction.value = ''
      setModalStatus('')
      selected.value = { program: p, channel }
      loadShowRules()
    }

    const openUpcoming = (r) => {
      openProgram({
        program_id: r.programId,
        epg_program_id: r.epgProgramId ?? null,
        title: r.name,
        episode_title: r.episodeTitle || null,
        start: tsOf(r.startDate),
        end: tsOf(r.endDate),
        series_link: r.seriesLinkId || null,
        series_no: r.seriesNo ?? null,
        episode_no: r.episodeNo ?? null,
        has_image: Boolean(r.hasImage),
        channelId: r.channelId,
      }, channelById(r.channelId))
    }

    let returnRoute = ''

    const openHandoff = () => {
      const handoff = guideHandoff.value
      if (!handoff) return
      guideHandoff.value = null
      returnRoute = handoff.returnTo || '#/dashboard'
      if (handoff.upcoming) return openUpcoming(handoff.upcoming)
      const listed = (guide.value?.programs[handoff.channelId] || [])
        .find((p) => p.start === handoff.program.start)
      openProgram(listed || handoff.program, channelById(handoff.channelId))
    }

    const closeModal = () => {
      recordDialogOverPlayer.value = false
      cancelChoice.value = false
      hdOffer.value = null
      selected.value = null
      if (!returnRoute) return
      const target = returnRoute
      returnRoute = ''
      window.location.hash = target
    }

    const hdOffer = ref(null)

    const offerHdFirst = (action) => {
      const { program, channel } = selected.value
      const hd = findHdSimulcast({
        program,
        channelId: channel?.id ?? program.channelId,
        channels: guide.value?.channels,
        programsByChannel: guide.value?.programs,
        needsSeriesLink: action === 'record-series',
      })
      if (!hd || cellState(hd.program)) return false
      hdOffer.value = { action, ...hd }
      return true
    }

    const recordOffered = (choice) => {
      const { action, program, channel } = hdOffer.value
      hdOffer.value = null
      if (choice === 'hd') selected.value = { program, channel }
      return action === 'record-series' ? recordSeries() : recordOneOff()
    }

    const recordSelected = () => offerHdFirst('record') || recordOneOff()

    const recordSelectedSeries = () => (!anyChannel.value && offerHdFirst('record-series')) || recordSeries()

    const recordOneOff = async () => {
      const { program, channel } = selected.value
      modalBusy.value = true
      modalAction.value = 'record'
      try {
        await api('POST', '/api/epg/record', {
          channel_id: channel?.id ?? program.channelId,
          program_id: program.program_id,
          epg_program_id: program.epg_program_id,
          lead_time: leadTime.value,
          lag_time: lagTime.value,
          add_to_library: addToLibrary.value,
        })
        flash({ msg: `Scheduled "${program.title}".` })
        closeModal()
        await loadState({ fresh: true })
      } catch (err) {
        setModalStatus(`Record failed: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ""
      }
    }

    const recordSeries = async () => {
      const { program, channel } = selected.value
      modalBusy.value = true
      modalAction.value = 'record-series'
      try {
        const result = await api('POST', '/api/epg/record-series', {
          series_link: program.series_link,
          channel_id: channel?.id ?? program.channelId,
          program_id: program.program_id,
          epg_program_id: program.epg_program_id,
          lead_time: leadTime.value,
          lag_time: lagTime.value,
          episodes_to_keep: episodesToKeep.value,
          any_channel: anyChannel.value,
          add_show_rule: addToLibrary.value,
        })
        const ruleNote = result.showRule ? ` Episodes go into ${result.showRule.dest_folder}.` : ''
        flash({ msg: `Series recording set for "${program.title}".${ruleNote}`, ms: ruleNote ? 6000 : undefined })
        closeModal()
        await loadState({ fresh: true })
      } catch (err) {
        setModalStatus(`Series record failed: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ""
      }
    }

    const cancelChoice = ref(false)

    const cancelSelected = async () => {
      const { program } = selected.value
      modalBusy.value = true
      modalAction.value = cancelChoice.value ? 'cancel-episode' : 'cancel'
      try {
        await api('POST', '/api/epg/cancel', { program_id: program.program_id })
        flash({ msg: `Cancelled "${program.title}".` })
        closeModal()
        await loadState({ fresh: true })
      } catch (err) {
        setModalStatus(`Cancel failed: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ""
      }
    }

    const cancelSelectedSeries = async () => {
      const { program } = selected.value
      const rec = scheduledByProgramId.value.get(String(program.program_id ?? program.programId))
      modalBusy.value = true
      modalAction.value = cancelChoice.value ? 'cancel-whole' : 'cancel-series'
      try {
        await api('POST', '/api/epg/cancel-series', {
          program_id: rec?.programId ?? null,
          series_link_id: rec?.seriesLinkId ?? findSeriesLink({ links: seriesLinkSet.value, seriesLink: program.series_link }) ?? program.series_link,
        })
        flash({ msg: `Series recording cancelled.` })
        closeModal()
        await loadState({ fresh: true })
      } catch (err) {
        setModalStatus(`Cancel failed: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ""
      }
    }

    const cancelUpcoming = async (r) => {
      if (!confirm(`Cancel the scheduled recording of "${r.name}"?`)) return
      busyId.value = r.programId
      try {
        await api('POST', '/api/epg/cancel', { program_id: r.programId })
        flash({ msg: `Cancelled "${r.name}".` })
        await loadState({ fresh: true })
      } catch (err) {
        flash({ msg: `Cancel failed: ${err.message}`, kind: 'err', ms: 8000 })
      } finally {
        busyId.value = null
      }
    }

    const reloadGuide = async () => {
      guideByDay.clear()
      await loadDay(day.value, { force: true })
    }

    const currentPins = () => (guide.value?.channels || [])
      .filter((c) => c.pinned)
      .map((c) => String(c.id))

    const reorderPins = async (pins) => {
      try {
        await api('PUT', '/api/epg/channel-prefs', { pinned_ids: pins })
        await reloadGuide()
      } catch (err) {
        flash({ msg: `Reorder failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const pinDrag = usePinDrag({ rowSelector: '.epg-row.pinned', currentPins, onReorder: reorderPins })
    const { dragPinId, dropTargetId, dropAfter, onPinPointerDown, onPinPointerMove, onPinPointerUp, onPinPointerCancel } = pinDrag

    const isSeriesRec = (r) =>
      r?.seriesLinkId != null && seriesLinkSet.value.has(String(r.seriesLinkId))

    const pinsOffscreen = ref(false)

    const updatePinsOffscreen = () => {
      const el = scrollEl.value
      if (!el) { pinsOffscreen.value = false; return }
      const rects = [...el.querySelectorAll('.epg-row.pinned')]
        .map((row) => row.getBoundingClientRect())
        .filter((r) => r.height > 0)
      if (!rects.length) { pinsOffscreen.value = false; return }
      const rulerBottom = el.getBoundingClientRect().top + el.querySelector('.epg-ruler').offsetHeight
      pinsOffscreen.value = rects[rects.length - 1].bottom < rulerBottom
    }

    const scrollRailTop = () => scrollEl.value?.scrollTo({ top: 0, behavior: 'smooth' })

    const midnightOnScreen = ref(false)

    const updateMidnightOnScreen = () => {
      const el = scrollEl.value
      if (!el || !guide.value) { midnightOnScreen.value = false; return }
      const viewW = el.clientWidth - railWidthOf(el)
      midnightOnScreen.value = midnightX.value >= el.scrollLeft && midnightX.value <= el.scrollLeft + viewW
    }

    const updateFloatingChips = () => {
      updatePinsOffscreen()
      updateMidnightOnScreen()
    }

    watch([midnightX, guide], () => nextTick(updateMidnightOnScreen))

    const railStripH = ref(0)
    const scrollbarW = ref(0)
    const syncScrollSize = () => {
      railStripH.value = scrollEl.value?.clientHeight || 0
      scrollbarW.value = scrollEl.value ? scrollEl.value.offsetWidth - scrollEl.value.clientWidth : 0
      scrollViewW.value = scrollEl.value?.clientWidth || 0
    }

    let scrollRo = null
    watch(scrollEl, (el, prev) => {
      if (prev) prev.removeEventListener('scroll', updateFloatingChips)
      if (scrollRo) { scrollRo.disconnect(); scrollRo = null }
      if (el) {
        el.addEventListener('scroll', updateFloatingChips, { passive: true })
        scrollRo = new ResizeObserver(() => { syncScrollSize(); updateFloatingChips() })
        scrollRo.observe(el)
      }
      syncScrollSize()
      updateFloatingChips()
    })
    onUnmounted(() => { if (scrollRo) scrollRo.disconnect() })

    const railResize = { active: false, startX: 0, startW: 0 }

    const onRailResizeDown = (e) => {
      e.preventDefault()
      setDragLock(true)
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      railResize.active = true
      railResize.startX = e.clientX
      railResize.startW = railPx.value
    }

    const onRailResizeMove = (e) => {
      if (!railResize.active) return
      railPx.value = clampRailPx(railResize.startW + e.clientX - railResize.startX)
    }

    const onRailResizeUp = () => {
      setDragLock(false)
      if (!railResize.active) return
      railResize.active = false
      try { localStorage.setItem(EPG_RAIL_KEY, String(railPx.value)) } catch { /* private mode */ }
    }

    const togglePin = async (ch) => {
      if (pinDrag.didDrag()) return
      const pinnedIds = (guide.value?.channels || []).filter((c) => c.pinned).map((c) => String(c.id))
      try {
        await togglePinnedChannel({ pinnedIds, channelId: ch.id })
        await reloadGuide()
      } catch (err) {
        flash({ msg: `Favourite failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const openChannelsModal = () => {
      channelsModal.value = true
    }

    const onChannelPrefsSaved = async () => {
      channelsModal.value = false
      await reloadGuide()
      flash({ msg: CHANNELS_SAVED_TEXT })
    }

    let listingsTimer = null
    const refreshWhileListingsLoad = () => {
      clearTimeout(listingsTimer)
      if (!guide.value?.loadingListings?.length) return
      listingsTimer = setTimeout(async () => {
        const d = day.value
        try {
          const g = await api('GET', `/api/epg/guide?day=${d}`)
          if (!g.loadingListings?.length) guideByDay.clear()
          guideByDay.set(d, g)
          if (day.value === d) guide.value = g
        } catch {
          refreshWhileListingsLoad()
        }
      }, LISTINGS_REFRESH_MS)
    }
    watch(guide, refreshWhileListingsLoad)
    onUnmounted(() => clearTimeout(listingsTimer))

    const tooltip = ref(null)
    const tooltipEl = ref(null)
    const hover = { cell: null, anchor: null, timer: 0, frame: 0, x: 0, y: 0 }

    const programmeByKey = computed(() => {
      const map = new Map()
      for (const ch of guide.value?.channels || []) {
        for (const p of guide.value.programs[ch.id] || []) map.set(cellKey(ch, p), { programme: p, channel: ch })
      }
      return map
    })

    const fmtWeekdayClock = (ms) => `${dateFormat({ weekday: 'short' }).format(new Date(ms))} ${fmtClock(ms)}`

    const fmtProgrammeRange = (p) => {
      const crossesMidnight = dayKey(p.start) !== dayKey(p.end - 1)
      return crossesMidnight
        ? `${fmtWeekdayClock(p.start)}–${fmtWeekdayClock(p.end)}`
        : `${fmtClock(p.start)}–${fmtClock(p.end)}`
    }

    const cellIsTruncated = (cell) => {
      const title = cell.querySelector('.epg-cell-title')
      if (!title) return true
      return title.scrollWidth > title.clientWidth + 1
    }

    const clampToViewport = (value, size, viewport) =>
      Math.min(Math.max(value, EPG_TOOLTIP_EDGE_PX), viewport - EPG_TOOLTIP_EDGE_PX - size)

    const besidePointer = ({ width, height }) => {
      const right = hover.x + EPG_TOOLTIP_GAP_PX
      const below = hover.y + EPG_TOOLTIP_GAP_PX
      const fitsRight = right + width <= window.innerWidth - EPG_TOOLTIP_EDGE_PX
      const fitsBelow = below + height <= window.innerHeight - EPG_TOOLTIP_EDGE_PX
      return {
        x: fitsRight ? right : hover.x - EPG_TOOLTIP_GAP_PX - width,
        y: fitsBelow ? below : hover.y - EPG_TOOLTIP_GAP_PX - height,
      }
    }

    const besideCell = ({ height }) => {
      const rect = hover.anchor.getBoundingClientRect()
      const below = rect.bottom + EPG_TOOLTIP_EDGE_PX
      const fitsBelow = below + height <= window.innerHeight - EPG_TOOLTIP_EDGE_PX
      return { x: rect.left, y: fitsBelow ? below : rect.top - EPG_TOOLTIP_EDGE_PX - height }
    }

    const placeTooltip = () => {
      hover.frame = 0
      const el = tooltipEl.value
      if (!el) return
      const size = { width: el.offsetWidth, height: el.offsetHeight }
      const { x, y } = hover.anchor ? besideCell(size) : besidePointer(size)
      const left = clampToViewport(x, size.width, window.innerWidth)
      const top = clampToViewport(y, size.height, window.innerHeight)
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    }

    const schedulePlacement = () => {
      if (!hover.frame) hover.frame = requestAnimationFrame(placeTooltip)
    }

    const hideTooltip = () => {
      clearTimeout(hover.timer)
      cancelAnimationFrame(hover.frame)
      hover.timer = 0
      hover.frame = 0
      tooltip.value = null
    }

    const forgetHoveredCell = () => {
      hideTooltip()
      hover.cell = null
      hover.anchor = null
    }

    const showTooltipFor = async (cell) => {
      const entry = programmeByKey.value.get(cell.dataset.key)
      if (!entry) return
      tooltip.value = entry
      await nextTick()
      placeTooltip()
    }

    const enterCell = (cell) => {
      hideTooltip()
      hover.cell = cell
      hover.anchor = null
      if (!cell || !cellIsTruncated(cell)) return
      hover.timer = setTimeout(() => showTooltipFor(cell), EPG_TOOLTIP_DELAY_MS)
    }

    const onGridPointer = (e) => {
      if (e.pointerType !== 'mouse') return
      hover.x = e.clientX
      hover.y = e.clientY
      const cell = e.target.closest?.('.epg-cell') || null
      if (cell !== hover.cell) return enterCell(cell)
      if (tooltip.value && !hover.anchor) schedulePlacement()
    }

    const onGridPointerOut = (e) => {
      if (e.pointerType !== 'mouse' || hover.anchor) return
      if (hover.cell?.contains(e.relatedTarget)) return
      forgetHoveredCell()
    }

    const onGridFocusIn = (e) => {
      const cell = e.target.closest?.('.epg-cell')
      if (!cell || !cell.matches(':focus-visible') || !cellIsTruncated(cell)) return forgetHoveredCell()
      hideTooltip()
      hover.cell = cell
      hover.anchor = cell
      showTooltipFor(cell)
    }

    const onGridFocusOut = () => {
      if (hover.anchor) forgetHoveredCell()
    }

    const onAnyScroll = () => {
      if (hover.anchor && tooltip.value) return schedulePlacement()
      forgetHoveredCell()
    }

    watch([selected, channelsModal, zoom, guide, mode], forgetHoveredCell)

    let searchTimer = null
    watch(searchQ, () => {
      if (searchTimer) clearTimeout(searchTimer)
      if (mode.value !== 'guide' || !searchActive.value) { searchResults.value = []; return }
      searching.value = true
      searchTimer = setTimeout(async () => {
        try {
          const r = await api('GET', `/api/epg/search?q=${encodeURIComponent(searchQ.value.trim())}`)
          searchResults.value = r.results || []
        } catch {
          searchResults.value = []
        } finally {
          searching.value = false
        }
      }, EPG_SEARCH_DEBOUNCE_MS)
    })

    watch(searchActive, async (active, wasActive) => {
      if (active || !wasActive || mode.value !== 'guide') return
      if (day.value === 0) await scrollToNow()
      else await scrollToMs(clockOfDay(18))
    })

    const onKeydown = (e) => {
      if (e.key !== 'Escape') return
      if (hdOffer.value) hdOffer.value = null
      else if (selected.value) closeModal()
      else if (channelsModal.value) channelsModal.value = false
    }

    watch(guideHandoff, (handoff) => handoff && openHandoff())

    let statePollTimer = null
    onMounted(async () => {
      window.addEventListener('keydown', onKeydown)
      window.addEventListener('scroll', onAnyScroll, { capture: true, passive: true })
      loadState()
      await loadDay(0)
      openHandoff()
      await scrollToNow()
      statePollTimer = setInterval(loadState, EPG_STATE_POLL_MS)
    })
    onUnmounted(() => {
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('scroll', onAnyScroll, { capture: true })
      hideTooltip()
      if (statePollTimer) clearInterval(statePollTimer)
      if (searchTimer) clearTimeout(searchTimer)
    })

    return {
      mode, modes, setMode, day, dayChips, dayTitle, setDay, LISTINGS_LOADING_TEXT,
      loadingIds, loadingNoteMaxPx,
      guide, loading, error, errorCode, loadDay, state, stateError, stateLine,
      scrollEl, railPx, trackWidth, trackTailPx, railStripH, scrollbarW, railNumWidth, ticks, nowX, nowMs,
      zoom, zoomIndex, zoomLevelCount: EPG_ZOOM_LEVELS.length, zooming, thumbMinCellPx, changeZoom,
      tooltip, tooltipEl, hideTooltip, onGridPointer, onGridPointerOut, onGridFocusIn, onGridFocusOut,
      recordingStateText, fmtProgrammeRange, cellKey, cellShowsText,
      visibleChannels, railNum, railFilter, pinnedCount, pinsOffscreen, scrollRailTop,
      midnightX, midnightOnScreen, goToNextDay, nextDayLabel, nextDayWeekday, nextDayLongLabel, lastDayLabel,
      cellState, cellStyle, cellWidth, cellTitle, isSeriesScheduled, isSeriesRec, recordingFillPercent,
      jumpNow, jumpTonight, manualRefresh,
      searchQ, searchActive, searchResults, searching, searchPlaceholder, upcomingFiltered,
      selected, openProgram, openUpcoming, closeModal, modalBusy, modalAction, canRecord,
      canWatchLive, watchSelected, hasCancelAction,
      modalStatusText, modalStatusKind,
      leadTime, lagTime, episodesToKeep, anyChannel, addToLibrary, libraryNote,
      minutesLabel: (count) => formatMinutes(count, { long: true }), leadOptions: EPG_LEAD_OPTIONS, lagOptions: EPG_LAG_OPTIONS, keepOptions: EPG_KEEP_OPTIONS,
      recordSelected, recordSelectedSeries, hdOffer, recordOffered, cancelSelected, cancelSelectedSeries, cancelChoice,
      upcoming, cancelUpcoming,
      isActiveRecording: (r) => activeRecordingSet.value.has(String(r.programId)),
      busyId, channelsModal, openChannelsModal, onChannelPrefsSaved,
      togglePin, railItems, narrow, showImages, cellHasThumb,
      dropTargetId, dropAfter, dragPinId,
      onPinPointerDown, onPinPointerMove, onPinPointerUp, onPinPointerCancel,
      onRailResizeDown, onRailResizeMove, onRailResizeUp,
      channelById, channelName, hasChannelLogo, fmtClock, fmtDayTime, fmtShortRange, seLabel, ratingLabel, tsOf,
      flashText, flashKind,
    }
  },
}

const live = reactive({
  open: false,
  channel: null,
  nowTitle: '',
  sessionId: null,
  phase: 'idle',
  message: '',
  holders: [],
  conflict: null,
  tuningStartedAt: 0,
  behindSeconds: 0,
  bufferSeconds: 0,
  skipHint: null,
})

let liveVideo = null
let liveHls = null
let liveAttached = false
let livePollTimer = null
let liveRun = 0

const liveChannelOf = (channel) => ({
  id: channel.id,
  name: channel.name,
  hasLogo: (channel.logos || []).length > 0,
})

const watchLive = ({ channel, nowTitle }) => {
  if (live.open && live.channel?.id === channel.id && live.phase !== 'ended') return
  if (playback.open) stopPlayback()
  stopLive()
  Object.assign(live, {
    open: true, channel, nowTitle, sessionId: null,
    phase: 'tuning', message: '', holders: [], conflict: null, tuningStartedAt: Date.now(),
  })
  liveVideo?.play()?.catch(() => {})
  startLiveSession(liveRun)
}

const stopLive = () => {
  liveRun += 1
  clearTimeout(livePollTimer)
  detachLiveVideo()
  if (live.sessionId) api('DELETE', `/api/live/${live.sessionId}`).catch(() => {})
  Object.assign(live, { open: false, sessionId: null, phase: 'idle', message: '', holders: [], conflict: null })
}

const startLiveSession = async (run) => {
  try {
    const r = await api('POST', '/api/live', { channel_id: live.channel.id })
    if (run !== liveRun) {
      api('DELETE', `/api/live/${r.session.id}`).catch(() => {})
      return
    }
    live.sessionId = r.session.id
    live.bufferSeconds = r.session.bufferSeconds || 0
    live.conflict = r.conflict
    if (r.session.status === 'ended') return endLive(run, r.session.reason)
    pollLive(run)
  } catch (err) {
    if (run !== liveRun) return
    live.phase = 'ended'
    live.message = liveStartErrorText(err)
    live.holders = err.data?.holders || []
  }
}

const pollLive = async (run) => {
  if (run !== liveRun) return
  try {
    const params = new URLSearchParams({ channel: live.channel.id, session: live.sessionId })
    const r = await api('GET', `/api/live/preflight?${params}`)
    if (run !== liveRun) return
    live.conflict = r.conflict
    const session = r.session
    if (!session || session.id !== live.sessionId || session.status === 'ended') {
      return endLive(run, session?.reason)
    }
    if (session.status === 'live' && !liveAttached) await attachLiveVideo(run, session.playlist)
  } catch {
    if (run !== liveRun) return
  }
  livePollTimer = setTimeout(() => pollLive(run), liveAttached ? LIVE_POLL_PLAYING_MS : LIVE_POLL_TUNING_MS)
}

const playsHlsOnlyNatively = () =>
  !('MediaSource' in window) && liveVideo.canPlayType('application/vnd.apple.mpegurl') !== ''

const attachLiveVideo = async (run, playlist) => {
  liveAttached = true
  live.phase = 'live'
  if (!playsHlsOnlyNatively()) return attachHlsJs(run, playlist)
  liveVideo.addEventListener('error', () => {
    if (run !== liveRun || !liveAttached || liveHls) return
    clearVideoSource()
    attachHlsJs(run, playlist)
  }, { once: true })
  liveVideo.src = playlist
  liveVideo.play()?.catch(() => {})
}

const attachHlsJs = async (run, playlist, { rebuilt = false } = {}) => {
  const { default: Hls } = await import('/vendor/hls.mjs')
  if (run !== liveRun) return
  if (!Hls.isSupported()) return endLive(run, { code: 'unsupported' })
  liveHls = new Hls(LIVE_HLS_CONFIG)
  let recovered = false
  liveHls.on(Hls.Events.ERROR, (event, data) => {
    if (!data.fatal || run !== liveRun) return
    if (data.type !== Hls.ErrorTypes.MEDIA_ERROR) return endLive(run, { code: 'playback', detail: data.details })
    if (!recovered) {
      recovered = true
      return liveHls.recoverMediaError()
    }
    if (rebuilt) return endLive(run, { code: 'playback', detail: data.details })
    liveHls.destroy()
    liveHls = null
    attachHlsJs(run, playlist, { rebuilt: true })
  })
  liveHls.loadSource(playlist)
  liveHls.attachMedia(liveVideo)
  liveVideo.play()?.catch(() => {})
}

const endLive = (run, reason) => {
  if (run !== liveRun) return
  clearTimeout(livePollTimer)
  detachLiveVideo()
  if (live.sessionId) api('DELETE', `/api/live/${live.sessionId}`).catch(() => {})
  live.sessionId = null
  live.phase = 'ended'
  live.message = liveReasonText(reason)
}

const detachLiveVideo = () => {
  liveHls?.destroy()
  liveHls = null
  liveAttached = false
  live.behindSeconds = 0
  if (!liveVideo) return
  liveVideo.pause()
  clearVideoSource()
}

const clearVideoSource = () => {
  liveVideo.removeAttribute('src')
  liveVideo.load()
}

const liveReasonText = (reason) => {
  const detail = reason?.detail ? `: ${reason.detail}` : '.'
  if (!reason) return 'Stopped: the stream ended.'
  if (reason.code === 'preempted') return `Stopped: the recording "${reason.recording}" took the tuner.`
  if (reason.code === 'no-input') return 'Stopped: TVHeadend gets no signal for this channel.'
  if (reason.code === 'gone') return 'Stopped: TVHeadend ended the stream.'
  if (reason.code === 'idle') return 'Stopped: nobody was watching.'
  if (reason.code === 'shutdown') return 'Stopped: Freetvarr restarted.'
  if (reason.code === 'no-tuner') return 'No free tuner.'
  if (reason.code === 'no-source') return "Stopped: TVHeadend can't tune this channel. It isn't broadcasting, or every tuner is busy."
  if (reason.code === 'ffmpeg') return `ffmpeg failed${detail}`
  if (reason.code === 'upstream') return `TVHeadend refused the stream${detail}`
  if (reason.code === 'playback') return `Playback failed${detail}`
  if (reason.code === 'unsupported') return 'This browser cannot play live TV.'
  return 'Stopped.'
}

const liveStartErrorText = (err) => {
  if (err.code === 'no-tuner') return 'No free tuner. Every tuner is busy on another multiplex:'
  if (err.code === 'off-air') return err.message
  return `Error: ${err.message}`
}

const liveHolderText = (h) => `${h.tuner} · ${h.mux} · ${h.holders.join(', ') || 'in use'}`

const fmtCountdown = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

const sendLiveBeacon = ({ method, suffix = '' }) => {
  if (!live.sessionId) return
  fetch(`/api/live/${live.sessionId}${suffix}`, {
    method,
    keepalive: true,
    headers: { 'x-csrf-token': csrfToken || '' },
  }).catch(() => {})
}

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return sendLiveBeacon({ method: 'POST', suffix: '/hold' })
  sendLiveBeacon({ method: 'DELETE' })
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') return sendLiveBeacon({ method: 'POST', suffix: '/hold' })
  if (!live.sessionId) return
  clearTimeout(livePollTimer)
  pollLive(liveRun)
})

const FULLSCREEN_EXIT_RESUME_MS = 1_500

let resumeAfterFullscreenUntil = 0

const resumeAfterFullscreen = () => {
  if (!live.open || live.phase === 'ended' || !liveVideo) return
  liveVideo.play()?.catch(() => {})
}

const onLiveFullscreenExit = () => {
  resumeAfterFullscreenUntil = Date.now() + FULLSCREEN_EXIT_RESUME_MS
  setTimeout(resumeAfterFullscreen, 100)
}

const finiteOrNull = (seconds) => (Number.isFinite(seconds) ? seconds : null)

const liveEdgeOf = (video) => {
  const { seekable } = video
  return seekable.length ? finiteOrNull(seekable.end(seekable.length - 1)) : null
}

const trackBehindLive = () => {
  const target = liveVideo?.readyState >= HAVE_CURRENT_DATA ? liveTargetSecond() : null
  const behind = target == null ? null : finiteOrNull(target - liveVideo.currentTime)
  live.behindSeconds = behind == null ? 0 : Math.max(0, behind)
}

const oldestKeptSecond = () => {
  const fromHls = finiteOrNull(liveHls?.latestLevelDetails?.fragments?.[0]?.start)
  if (fromHls != null) return fromHls
  const { seekable } = liveVideo
  return seekable.length ? finiteOrNull(seekable.start(0)) : null
}

const liveTargetSecond = () => {
  const fromHls = finiteOrNull(liveHls?.liveSyncPosition)
  if (fromHls != null) return fromHls
  const edge = liveEdgeOf(liveVideo)
  return edge == null ? null : Math.max(0, edge - NATIVE_LIVE_HOLD_BACK_S)
}

const keepSeekInsideBuffer = () => {
  const oldest = oldestKeptSecond()
  if (oldest == null) return
  const floor = oldest + SEEK_FLOOR_MARGIN_S
  if (liveVideo.currentTime < floor) liveVideo.currentTime = floor
}

const createSkipHintFlasher = (target) => {
  let timer = null
  return ({ side, seconds }) => {
    target.skipHint = { side, label: skipLabel({ side, seconds }), spoken: skipSpoken({ side, seconds }), key: Date.now() }
    clearTimeout(timer)
    timer = setTimeout(() => { target.skipHint = null }, SKIP_HINT_MS)
  }
}

const flashLiveSkipHint = createSkipHintFlasher(live)

let liveTapState = emptyTapState()
let liveTapStart = null
let liveClickPlan = 'pass'
let liveSingleClickTimer = null

const canSkip = () => live.phase === 'live' && live.bufferSeconds > 0 && liveAttached

const tapZoneOf = ({ video, event, bottomInsetPx }) => {
  const box = video.getBoundingClientRect()
  return zoneOf({
    x: event.clientX - box.left,
    y: event.clientY - box.top,
    width: box.width,
    height: box.height,
    bottomInsetPx,
  })
}

const onLivePointerDown = (e) => {
  liveTapStart = e.isPrimary && e.target === liveVideo
    ? { x: e.clientX, y: e.clientY, at: Date.now() }
    : null
}

const onLivePointerUp = (e) => {
  const start = liveTapStart
  liveTapStart = null
  liveClickPlan = 'pass'
  if (!start || !canSkip()) return
  const tap = {
    startX: start.x, startY: start.y, endX: e.clientX, endY: e.clientY,
    ms: Date.now() - start.at, pointerType: e.pointerType,
  }
  if (!isTap(tap)) return
  const side = tapZoneOf({ video: liveVideo, event: e, bottomInsetPx: NATIVE_CONTROL_BAR_PX })
  const result = registerLiveTap({ side, force: false })
  liveClickPlan = nativeClickPlan({ tap: result.kind, pointerType: e.pointerType })
  clearTimeout(liveSingleClickTimer)
  skipLive(result)
}

const onLiveClick = (e) => {
  const plan = liveClickPlan
  liveClickPlan = 'pass'
  if (plan === 'pass' || e.target !== liveVideo) return
  e.preventDefault()
  e.stopPropagation()
  if (plan === 'toggle-later') liveSingleClickTimer = setTimeout(toggleLivePause, DOUBLE_TAP_MS)
}

const toggleLivePause = () => {
  if (!liveAttached) return
  if (liveVideo.paused) return liveVideo.play()?.catch(() => {})
  liveVideo.pause()
}

const onLiveDoubleClick = (e) => {
  if (e.target !== liveVideo || !canSkip()) return
  if (!tapZoneOf({ video: liveVideo, event: e, bottomInsetPx: NATIVE_CONTROL_BAR_PX })) return
  e.preventDefault()
  e.stopPropagation()
}

const registerLiveTap = ({ side, force }) => {
  const step = registerTap(liveTapState, { side, at: Date.now(), position: liveVideo.currentTime, force })
  liveTapState = step.state
  return step.result
}

const skipLive = (result) => {
  if (result.kind !== 'skip') return
  const oldest = oldestKeptSecond()
  const direction = result.side === 'back' ? -1 : 1
  const { to, applied } = clampSkip({
    base: result.base,
    delta: direction * result.total,
    floor: oldest == null ? null : oldest + SEEK_FLOOR_MARGIN_S,
    ceiling: liveTargetSecond(),
  })
  if (!applied) return
  liveVideo.currentTime = to
  flashLiveSkipHint({ side: result.side, seconds: applied })
  trackBehindLive()
}

const skipLiveByKey = (side) => {
  if (!canSkip()) return false
  skipLive(registerLiveTap({ side, force: true }))
  return true
}

const jumpToLive = () => {
  if (!liveVideo) return
  const target = liveTargetSecond()
  if (target != null) liveVideo.currentTime = target
  liveVideo.play()?.catch(() => {})
}

const onLivePause = () => {
  if (Date.now() < resumeAfterFullscreenUntil) setTimeout(resumeAfterFullscreen, 100)
}

const TvIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5.5 1.5 8 4l2.5-2.5"/>
      <rect x="1.5" y="4" width="13" height="10" rx="1.5"/>
      <path d="M6.75 7.25v3.5l2.9-1.75z" fill="currentColor"/>
    </svg>
  `,
}

const RecordIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6"/>
      <circle cx="8" cy="8" r="2.75" fill="currentColor" stroke="none"/>
    </svg>
  `,
}

const StopIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1"/>
    </svg>
  `,
}

const GoLiveIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3.5 3.5v9l7-4.5z"/>
      <rect x="11" y="3.5" width="1.75" height="9" rx="0.5"/>
    </svg>
  `,
}

const CrossIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8"/>
    </svg>
  `,
}

const RefreshIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12.7 10.21A5 5 0 1 1 8.5 3.53"/>
      <path d="M6.75 1.25 9.25 3.5 6.75 5.75"/>
    </svg>
  `,
}

const SlidersIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2 3.5h7M12 3.5h2M2 8h2M7 8h7M2 12.5h4.5M9.5 12.5H14"/>
      <circle cx="10.5" cy="3.5" r="1.5"/>
      <circle cx="5.5" cy="8" r="1.5"/>
      <circle cx="8" cy="12.5" r="1.5"/>
    </svg>
  `,
}

const FilterIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2.25 3h11.5l-4.5 5.25v4.5l-2.5 1.25V8.25z"/>
    </svg>
  `,
}

const ImageIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5"/>
      <circle cx="5.75" cy="6.5" r="1.25"/>
      <path d="M14 10.5 10.5 7 4 13"/>
    </svg>
  `,
}

const ArrowLeftIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M13.5 8h-11M6.5 4l-4 4 4 4"/>
    </svg>
  `,
}

const ArrowRightIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2.5 8h11M9.5 4l4 4-4 4"/>
    </svg>
  `,
}

const ChevronRightIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 3.5l4.5 4.5L6 12.5"/>
    </svg>
  `,
}

const CalendarIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/>
      <path d="M2.5 6.75h11M5.5 2v3M10.5 2v3"/>
    </svg>
  `,
}

const ArrowUpIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 13.5v-11M4 6.5l4-4 4 4"/>
    </svg>
  `,
}

const ArrowDownIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 2.5v11M4 9.5l4 4 4-4"/>
    </svg>
  `,
}

const PlayIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5.5 3.75v8.5L12.75 8z"/>
    </svg>
  `,
}

const PauseIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="4" y="3.5" width="2.75" height="9" rx="0.5"/>
      <rect x="9.25" y="3.5" width="2.75" height="9" rx="0.5"/>
    </svg>
  `,
}

const FullscreenIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2.75 6V2.75H6M10 2.75h3.25V6M13.25 10v3.25H10M6 13.25H2.75V10"/>
    </svg>
  `,
}

const AirplayIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4.5 11.5H3a1.25 1.25 0 0 1-1.25-1.25v-6.5A1.25 1.25 0 0 1 3 2.5h10a1.25 1.25 0 0 1 1.25 1.25v6.5A1.25 1.25 0 0 1 13 11.5h-1.5"/>
      <path d="M8 9.5l3.25 4h-6.5z" fill="currentColor"/>
    </svg>
  `,
}

const PlusIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 3v10M3 8h10"/>
    </svg>
  `,
}

const MinusIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 8h10"/>
    </svg>
  `,
}

const CheckIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 8.5l3.25 3.25L13 5"/>
    </svg>
  `,
}

const PencilIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2.5 13.5l.75-3.25 7.5-7.5 2.5 2.5-7.5 7.5zM9.5 4l2.5 2.5"/>
    </svg>
  `,
}

const StarIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.25l2.03 4.3 4.72.58-3.47 3.25.9 4.67L8 11.75l-4.18 2.3.9-4.67L1.25 6.13l4.72-.58z"/>
    </svg>
  `,
}

const StepMarkIcon = {
  props: { state: { type: String, default: 'pending' } },
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path v-if="state === 'done'" d="M3 8.5l3.25 3.25L13 5"/>
      <circle v-else-if="state === 'active'" cx="8" cy="8" r="4" fill="currentColor" stroke="none"/>
      <path v-else-if="state === 'failed'" d="M4 4l8 8M12 4l-8 8"/>
      <path v-else-if="state === 'warn'" d="M8 3v6.25M8 12.75v.25"/>
      <path v-else-if="state === 'skipped'" d="M4 8h8"/>
      <circle v-else cx="8" cy="8" r="3.75"/>
    </svg>
  `,
}

const SortArrow = {
  props: { dir: { type: String, default: null } },
  template: `
    <arrow-down-icon v-if="dir === 'desc'" class="sort-arrow" />
    <arrow-up-icon v-else-if="dir === 'asc'" class="sort-arrow" />
  `,
}

const SignalBarsIcon = {
  template: `
    <svg viewBox="0 0 10 4" class="signal-bars" fill="currentColor" aria-hidden="true">
      <rect x="0" y="0" width="4" height="4"/>
      <rect x="5.5" y="0" width="4" height="4"/>
    </svg>
  `,
}

const EyeIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/>
      <circle cx="8" cy="8" r="2"/>
    </svg>
  `,
}

const EyeOffIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/>
      <circle cx="8" cy="8" r="2"/>
      <path d="M2.5 13.5l11-11"/>
    </svg>
  `,
}

const SearchIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.25"/>
      <path d="M10.25 10.25l3.25 3.25"/>
    </svg>
  `,
}

const PulseIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M1.5 8.5h2.75L6 4l3.5 8.5 1.75-4h3.25"/>
    </svg>
  `,
}

const BoltIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 1.75 3.5 9.25H8l-1 5 5.5-7.5H8z"/>
    </svg>
  `,
}

const DownloadIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 2.5V10M4.75 7 8 10.25 11.25 7M3 13.5h10"/>
    </svg>
  `,
}

const TrashIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 5h10M6.5 5V3h3v2M4.5 5l.7 8.5h5.6L11.5 5M6.5 7.5v4M9.5 7.5v4"/>
    </svg>
  `,
}

const ExternalLinkIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/>
    </svg>
  `,
}

const CopyIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1"/>
      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>
    </svg>
  `,
}

const InfoIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25"/>
      <path d="M8 7.25v4"/>
      <circle cx="8" cy="4.9" r="0.85" fill="currentColor" stroke="none"/>
    </svg>
  `,
}

const StaleBuildBanner = {
  template: `
    <div v-if="staleBuild" class="stale-build" role="status">
      <div class="max-w-6xl mx-auto px-4 md:px-6 py-2 flex items-center gap-3">
        <span class="panel-title hidden sm:inline shrink-0">Update</span>
        <span class="stale-build-text">A new version of Freetvarr is ready.</span>
        <button type="button" class="btn btn-sm btn-primary shrink-0" @click="reloadPage"><refresh-icon /> APPLY &amp; RELOAD</button>
      </div>
    </div>
  `,
  setup() {
    const reloadPage = () => window.location.reload()
    return { staleBuild, reloadPage }
  },
}

const LivePlayer = {
  template: `
    <teleport to="body">
    <transition name="epg-sheet">
    <div v-show="live.open" class="epg-modal-backdrop live-backdrop">
      <section class="panel epg-modal live-modal" role="dialog" aria-label="Live TV">
        <header class="panel-header live-header">
          <channel-logo class="shrink-0" :channel-id="live.channel?.id" :has-logo="Boolean(live.channel?.hasLogo)" />
          <div class="flex-1 min-w-0">
            <span class="panel-title block truncate">{{ live.channel?.name }}</span>
            <span v-if="live.nowTitle" class="block truncate text-xs text-ink-dim mt-1">{{ live.nowTitle }}</span>
          </div>
          <button type="button" class="btn btn-icon" @click="stopLive" aria-label="Stop and close"><cross-icon /></button>
        </header>
        <div ref="frameEl" class="live-frame" @pointerdown="onLivePointerDown" @pointerup="onLivePointerUp" @click.capture="onLiveClick" @dblclick.capture="onLiveDoubleClick">
          <video ref="videoEl" :class="['live-video', { 'is-veiled': chips !== 'hidden' }]" playsinline controls></video>
          <div v-if="chips !== 'hidden'" :key="chipsRun" :class="['live-chips', chips]" aria-hidden="true">
            <span v-for="n in 3" :key="n" class="live-chip-orbit" :style="{ '--i': n - 1 }">
              <span class="live-chip-arm"><i class="live-chip"></i></span>
            </span>
          </div>
          <div v-if="chips === 'ended'" class="live-chips-row" aria-hidden="true">
            <i v-for="n in 3" :key="n" class="live-chip"></i>
          </div>
          <span v-if="chips === 'tuning' || chips === 'ended'" class="live-chip-caption">{{ live.channel?.name }} · {{ statusText }}</span>
          <button type="button" class="btn btn-icon live-landscape-close" @click="stopLive" aria-label="Stop and close"><cross-icon /></button>
          <div v-if="live.skipHint" :key="live.skipHint.key" :class="['live-skip-hint', live.skipHint.side]" aria-hidden="true">
            <span>{{ live.skipHint.label }}</span>
          </div>
          <span class="sr-only" aria-live="polite">{{ live.skipHint?.spoken || '' }}</span>
        </div>
        <div class="panel-body space-y-3">
          <ul v-if="live.holders.length" class="space-y-1 font-mono text-xs text-ink-dim">
            <li v-for="h in live.holders" :key="h.tuner">{{ liveHolderText(h) }}</li>
          </ul>
          <div class="epg-modal-actions flex items-center justify-between gap-3">
            <span :class="['status-readout', 'min-w-0', statusKind]">{{ statusText }}</span>
            <div v-if="live.phase === 'ended'" class="flex shrink-0 gap-2">
              <button type="button" class="btn" @click="retryLive"><refresh-icon /> RETRY</button>
              <button type="button" class="btn" @click="stopLive"><cross-icon /> CLOSE</button>
            </div>
            <div v-else class="flex shrink-0 gap-2">
              <button v-if="isBehindLive" type="button" class="btn" @click="jumpToLive"><go-live-icon /> GO LIVE</button>
              <button type="button" class="btn" :disabled="recordButton.disabled" :title="recordButton.title" @click="recordFromLive"><record-icon /> {{ recordButton.label }}</button>
              <button type="button" class="btn btn-danger" @click="stopLive"><stop-icon /> STOP</button>
            </div>
          </div>
        </div>
      </section>
    </div>
    </transition>
    </teleport>
  `,
  setup() {
    const videoEl = ref(null)
    const frameEl = ref(null)
    const chips = ref(live.phase === 'tuning' ? 'tuning' : 'hidden')
    const chipsRun = ref(0)
    let chipsTimer = null
    let chipsShownAt = 0
    let handOffPending = false

    const showChips = (state) => {
      clearTimeout(chipsTimer)
      handOffPending = false
      if (state === 'tuning' && chips.value !== 'tuning') {
        chipsRun.value += 1
        chipsShownAt = Date.now()
      }
      chips.value = state
    }

    const animateChipsAway = () => {
      handOffPending = false
      if (chips.value !== 'tuning' || live.phase !== 'live') return
      chips.value = 'handoff'
      chipsTimer = setTimeout(() => { chips.value = 'hidden' }, CHIPS_HANDOFF_MS)
    }

    const handOffToVideo = () => {
      if (chips.value !== 'tuning' || live.phase !== 'live' || handOffPending) return
      handOffPending = true
      const wait = Math.max(0, CHIPS_MIN_SHOWN_MS - (Date.now() - chipsShownAt))
      chipsTimer = setTimeout(animateChipsAway, wait)
    }

    watch(now, trackBehindLive)

    watch(() => live.phase, (phase) => {
      if (phase === 'tuning') return showChips('tuning')
      if (phase === 'ended') return showChips('ended')
      if (phase === 'idle') return showChips('hidden')
    })

    const isBehindLive = computed(() => live.phase === 'live' && live.behindSeconds >= BEHIND_LIVE_SHOWN_S)

    const statusText = computed(() => {
      if (live.phase === 'ended') return live.message
      if (live.phase === 'tuning') {
        const slow = now.value.getTime() - live.tuningStartedAt > TUNING_SLOW_MS
        return slow ? 'TUNING… STILL WAITING FOR A SIGNAL' : 'TUNING…'
      }
      const lead = isBehindLive.value ? `${fmtCountdown(live.behindSeconds * 1000)} BEHIND LIVE` : 'LIVE'
      if (!live.conflict) return lead
      const wait = fmtCountdown(live.conflict.startsAt - now.value.getTime())
      return `${lead} · "${live.conflict.title}" needs this tuner at ${fmtClockTz(live.conflict.startsAt)} (in ${wait})`
    })

    const statusKind = computed(() => {
      if (live.phase === 'ended' || live.conflict) return 'err'
      return live.phase === 'live' ? 'ok' : 'info'
    })

    const onKeydown = (e) => {
      if (!live.open || recordDialogOverPlayer.value) return
      if (e.key === 'Escape') return stopLive()
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.target.closest?.('button, select, textarea, input')) return
      if (skipLiveByKey(e.key === 'ArrowLeft' ? 'back' : 'forward')) e.preventDefault()
    }

    onMounted(() => {
      liveVideo = videoEl.value
      liveVideo.addEventListener('webkitendfullscreen', onLiveFullscreenExit)
      liveVideo.addEventListener('pause', onLivePause)
      liveVideo.addEventListener('seeked', trackBehindLive)
      liveVideo.addEventListener('pause', trackBehindLive)
      liveVideo.addEventListener('seeking', keepSeekInsideBuffer)
      liveVideo.addEventListener('loadeddata', handOffToVideo)
      liveVideo.addEventListener('playing', handOffToVideo)
      window.addEventListener('keydown', onKeydown)
    })
    onUnmounted(() => {
      clearTimeout(chipsTimer)
      window.removeEventListener('keydown', onKeydown)
    })

    const retryLive = () => watchLive({ channel: live.channel, nowTitle: live.nowTitle })

    const nowProgram = ref(null)

    const loadNowProgram = async () => {
      const channelId = live.channel?.id
      nowProgram.value = null
      if (!channelId) return
      const result = await api('GET', '/api/epg/now?all=1').catch(() => null)
      if (live.channel?.id !== channelId) return
      nowProgram.value = nowProgramFor({ entries: result?.entries, channelId })
    }

    watch(() => live.open && live.channel?.id, (id) => id && loadNowProgram(), { immediate: true })

    watch(now, () => {
      const program = nowProgram.value
      if (live.open && program && program.end <= now.value.getTime()) loadNowProgram()
    })

    const recordButton = computed(() => liveRecordButton({
      program: nowProgram.value,
      nowMs: now.value.getTime(),
      recording: isRecordingChannel(live.channel?.id),
    }))

    const recordFromLive = () => {
      if (recordButton.value.disabled) return
      recordDialogOverPlayer.value = true
      openInGuide({
        channelId: live.channel.id,
        program: nowProgram.value,
        returnTo: window.location.hash || '#/dashboard',
      })
    }

    return {
      recordButton, recordFromLive,
      live, videoEl, chips, chipsRun, stopLive, retryLive, statusText, statusKind, liveHolderText,
      isBehindLive, jumpToLive, frameEl, onLivePointerDown, onLivePointerUp, onLiveClick, onLiveDoubleClick,
    }
  },
}

const LIVE_POLL_TUNING_MS = 1_000
const CHIPS_HANDOFF_MS = 440
const CHIPS_MIN_SHOWN_MS = 1_800
const TUNING_SLOW_MS = 15_000
const LIVE_HLS_CONFIG = {
  workerPath: '/vendor/hls.worker.js',
  liveSyncDurationCount: 2,
  backBufferLength: 30,
}
const LIVE_POLL_PLAYING_MS = 10_000
const BEHIND_LIVE_SHOWN_S = 10
const SEEK_FLOOR_MARGIN_S = 4
const NATIVE_LIVE_HOLD_BACK_S = 6
const HAVE_CURRENT_DATA = 2
const NATIVE_CONTROL_BAR_PX = 48
const SKIP_HINT_MS = 1_600

const playback = reactive({
  open: false,
  recording: null,
  sessionId: null,
  offset: 0,
  duration: 0,
  position: 0,
  phase: 'idle',
  message: '',
  resumed: false,
  started: false,
  paused: true,
  waiting: false,
  scrubbing: false,
  scrubValue: 0,
  skipHint: null,
  airplay: false,
  adBreaks: [],
})

let playVideo = null
let playHls = null
let playRun = 0
let playHeartbeatTimer = null
let lastSavedPosition = null
let autoRestarts = 0

const playRecording = (recording) => {
  if (live.open) stopLive()
  stopPlayback()
  lastSavedPosition = recording.playback_position_s ?? null
  Object.assign(playback, {
    open: true, recording, sessionId: null, offset: 0, duration: recording.duration_s || 0,
    position: 0, phase: 'starting', message: '', resumed: false, started: false,
    paused: false, waiting: false, scrubbing: false, skipHint: null, adBreaks: [],
  })
  playVideo?.play()?.catch(() => {})
  startPlaybackAt(null)
}

const stopPlayback = () => {
  if (playback.open) savePlaybackPosition()
  playRun += 1
  clearTimeout(playHeartbeatTimer)
  clearTimeout(playSingleTapTimer)
  detachPlayVideo()
  if (playback.sessionId) api('DELETE', `/api/play/${playback.sessionId}`).catch(() => {})
  Object.assign(playback, { open: false, sessionId: null, phase: 'idle', message: '' })
}

const startPlaybackAt = async (offset) => {
  const run = ++playRun
  const replace = playback.sessionId
  clearTimeout(playHeartbeatTimer)
  detachPlayVideo()
  playback.phase = 'starting'
  playback.message = ''
  if (offset != null) playback.position = offset
  const recordingId = encodeURIComponent(playback.recording.recording_id)
  try {
    const r = await api('POST', `/api/recordings/${recordingId}/play`, {
      ...(offset == null ? {} : { offset }),
      ...(replace ? { replace } : {}),
    })
    if (run !== playRun) {
      api('DELETE', `/api/play/${r.session.id}`).catch(() => {})
      return
    }
    Object.assign(playback, {
      sessionId: r.session.id,
      offset: r.session.offset,
      duration: r.session.duration || playback.duration,
      position: r.session.offset,
      phase: 'playing',
      waiting: true,
    })
    if (offset == null) playback.resumed = Boolean(r.resumed)
    playback.adBreaks = r.adBreaks || []
    attachPlayVideo(run, r.session.playlist)
    schedulePlayHeartbeat(run)
  } catch (err) {
    if (run !== playRun) return
    playback.sessionId = null
    endPlayback(run, `Error: ${err.message}`)
  }
}

const attachPlayVideo = async (run, playlist) => {
  if (playsNativeHlsOnly(playVideo)) {
    playVideo.src = playlist
    playVideo.play()?.catch(() => {})
    return
  }
  const { default: Hls } = await import('/vendor/hls.mjs')
  if (run !== playRun) return
  if (!Hls.isSupported()) return endPlayback(run, 'This browser cannot play recordings.')
  playHls = new Hls(PLAY_HLS_CONFIG)
  let recovered = false
  playHls.on(Hls.Events.ERROR, (event, data) => {
    if (!data.fatal || run !== playRun) return
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
      recovered = true
      return playHls.recoverMediaError()
    }
    recoverPlayback(run, `Playback failed: ${data.details}`)
  })
  playHls.loadSource(playlist)
  playHls.attachMedia(playVideo)
  playVideo.play()?.catch(() => {})
}

const playsNativeHlsOnly = (video) =>
  !('MediaSource' in window) && video.canPlayType('application/vnd.apple.mpegurl') !== ''

const recoverPlayback = (run, message) => {
  if (run !== playRun) return
  if (autoRestarts >= PLAY_MAX_AUTO_RESTARTS) return endPlayback(run, message)
  autoRestarts += 1
  playback.sessionId = null
  startPlaybackAt(Math.floor(playback.position))
}

const endPlayback = (run, message) => {
  if (run !== playRun) return
  clearTimeout(playHeartbeatTimer)
  detachPlayVideo()
  if (playback.sessionId) api('DELETE', `/api/play/${playback.sessionId}`).catch(() => {})
  playback.sessionId = null
  playback.phase = 'ended'
  playback.message = message
}

const detachPlayVideo = () => {
  playHls?.destroy()
  playHls = null
  playback.waiting = false
  if (!playVideo) return
  playVideo.pause()
  playVideo.removeAttribute('src')
  playVideo.load()
}

const schedulePlayHeartbeat = (run) => {
  clearTimeout(playHeartbeatTimer)
  playHeartbeatTimer = setTimeout(() => playHeartbeat(run), PLAY_HEARTBEAT_MS)
}

const playHeartbeat = async (run) => {
  if (run !== playRun || !playback.sessionId) return
  try {
    await api('POST', `/api/play/${playback.sessionId}/heartbeat`)
  } catch (err) {
    if (run !== playRun) return
    if (err.status === 404) return onPlaybackSessionGone(run)
  }
  if (playback.started && !playback.paused) savePlaybackPosition()
  schedulePlayHeartbeat(run)
}

const onPlaybackSessionGone = (run) => {
  if (run !== playRun) return
  playback.sessionId = null
  if (!playback.paused) recoverPlayback(run, 'Stopped: the stream ended.')
}

const savePlaybackPosition = ({ keepalive = false } = {}) => {
  const recording = playback.recording
  if (!recording || !playback.started) return
  const seconds = Math.round(playback.position)
  if (seconds === lastSavedPosition) return
  lastSavedPosition = seconds
  recording.playback_position_s = seconds
  const url = `/api/recordings/${encodeURIComponent(recording.recording_id)}/position`
  if (!keepalive) return api('POST', url, { seconds }).catch(() => {})
  fetch(url, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken || '' },
    body: JSON.stringify({ seconds }),
  }).catch(() => {})
}

const producedEndOf = () => {
  const last = playHls?.latestLevelDetails?.fragments?.at(-1)
  if (last) return last.start + last.duration
  const { seekable } = playVideo
  return seekable.length ? finiteOrNull(seekable.end(seekable.length - 1)) : null
}

const seekPlaybackTo = (target) => {
  if (!playback.open || playback.phase === 'ended') return startPlaybackAt(Math.max(0, Math.floor(target)))
  if (!playback.sessionId || playback.phase !== 'playing') return startPlaybackAt(Math.max(0, Math.floor(target)))
  const plan = seekPlan({
    target,
    offset: playback.offset,
    producedEnd: producedEndOf(),
    duration: playback.duration,
  })
  if (plan.kind === 'restart') return startPlaybackAt(plan.offset)
  playVideo.currentTime = plan.time
  playback.position = playback.offset + plan.time
  if (playVideo.paused) playVideo.play()?.catch(() => {})
}

const togglePlayback = () => {
  if (playback.phase === 'ended') return startPlaybackAt(Math.floor(playback.position))
  if (!playback.sessionId && playback.phase === 'playing') return startPlaybackAt(Math.floor(playback.position))
  if (!playVideo || playback.phase !== 'playing') return
  if (playVideo.ended) return seekPlaybackTo(0)
  if (playVideo.paused) return playVideo.play()?.catch(() => {})
  playVideo.pause()
}

const flashPlaybackSkipHint = createSkipHintFlasher(playback)

const skipPlayback = ({ side, total, base }) => {
  const direction = side === 'back' ? -1 : 1
  const { to, applied } = clampSkip({
    base,
    delta: direction * total,
    floor: 0,
    ceiling: playback.duration ? playback.duration - SEEK_EDGE_MARGIN_S : null,
  })
  if (!applied) return
  flashPlaybackSkipHint({ side, seconds: applied })
  seekPlaybackTo(to)
}

const skipCurrentAd = () => {
  const current = adBreakAt({ breaks: playback.adBreaks, time: playback.position })
  if (current) seekPlaybackTo(current.end)
}

const startPlaybackOver = () => {
  playback.resumed = false
  seekPlaybackTo(0)
}

let playTapState = emptyTapState()
let playTapStart = null
let playSingleTapTimer = null

const registerPlayTap = ({ side, force }) => {
  const step = registerTap(playTapState, { side, at: Date.now(), position: playback.position, force })
  playTapState = step.state
  return step.result
}

const onPlayPointerDown = (e) => {
  playTapStart = e.isPrimary && e.target === playVideo
    ? { x: e.clientX, y: e.clientY, at: Date.now() }
    : null
}

const onPlayPointerUp = (e) => {
  const start = playTapStart
  playTapStart = null
  if (!start || playback.phase !== 'playing') return
  const tap = {
    startX: start.x, startY: start.y, endX: e.clientX, endY: e.clientY,
    ms: Date.now() - start.at, pointerType: e.pointerType,
  }
  if (!isTap(tap)) return
  const side = tapZoneOf({ video: playVideo, event: e, bottomInsetPx: 0 })
  const result = registerPlayTap({ side, force: false })
  const togglesOnSingleTap = e.pointerType !== 'touch'
  clearTimeout(playSingleTapTimer)
  if (result.kind === 'skip') return skipPlayback(result)
  if (!togglesOnSingleTap) return
  if (result.kind === 'center') return togglePlayback()
  playSingleTapTimer = setTimeout(togglePlayback, DOUBLE_TAP_MS)
}

const skipPlaybackByKey = (side) => {
  const result = registerPlayTap({ side, force: true })
  if (result.kind === 'skip') skipPlayback(result)
}

const sendPlaybackBeacon = () => {
  if (!playback.sessionId) return
  fetch(`/api/play/${playback.sessionId}`, {
    method: 'DELETE',
    keepalive: true,
    headers: { 'x-csrf-token': csrfToken || '' },
  }).catch(() => {})
}

window.addEventListener('pagehide', (event) => {
  if (!playback.open) return
  savePlaybackPosition({ keepalive: true })
  if (!event.persisted) sendPlaybackBeacon()
})

document.addEventListener('visibilitychange', () => {
  if (!playback.open) return
  if (document.visibilityState === 'hidden') return savePlaybackPosition({ keepalive: true })
  if (playback.sessionId) playHeartbeat(playRun)
})

const RecordingPlayer = {
  template: `
    <teleport to="body">
    <transition name="epg-sheet">
    <div v-show="playback.open" class="epg-modal-backdrop live-backdrop">
      <section class="panel epg-modal live-modal play-modal" role="dialog" aria-label="Recording player">
        <header class="panel-header live-header">
          <channel-logo v-if="recording?.channel_id" class="shrink-0" :channel-id="recording.channel_id" has-logo />
          <div class="flex-1 min-w-0">
            <span class="panel-title block truncate">{{ recording?.title }}</span>
            <span v-if="subtitle" class="block truncate text-xs text-ink-dim mt-1">{{ subtitle }}</span>
          </div>
          <button type="button" class="btn btn-icon" @click="stopPlayback" aria-label="Close"><cross-icon /></button>
        </header>
        <div ref="stageEl" class="play-stage">
          <div class="live-frame" @pointerdown="onPlayPointerDown" @pointerup="onPlayPointerUp">
            <video ref="videoEl" :class="['live-video', { 'is-veiled': playback.phase !== 'playing' }]" playsinline x-webkit-airplay="allow" preload="auto"></video>
            <span v-if="overlayText" class="play-caption">{{ overlayText }}</span>
            <button type="button" class="btn btn-icon live-landscape-close" @click="stopPlayback" aria-label="Close"><cross-icon /></button>
            <div v-if="playback.skipHint" :key="playback.skipHint.key" :class="['live-skip-hint', playback.skipHint.side]" aria-hidden="true">
              <span>{{ playback.skipHint.label }}</span>
            </div>
            <span class="sr-only" aria-live="polite">{{ playback.skipHint?.spoken || '' }}</span>
            <button v-if="inAdBreak" type="button" class="btn play-skip-ad" @click="skipCurrentAd">SKIP AD</button>
          </div>
          <div class="play-controls">
            <div class="play-scrub">
              <span class="play-time">{{ fmtPlayTime(shownPosition) }}</span>
              <input type="range" class="play-range" min="0" step="1"
                :max="scrubMax" :value="Math.floor(shownPosition)"
                :style="{ '--fill': fillPercent }"
                @input="onScrubInput" @change="onScrubCommit"
                aria-label="Position">
              <span class="play-time">{{ fmtPlayTime(playback.duration) }}</span>
            </div>
            <div class="play-buttons">
              <button type="button" class="btn btn-icon play-toggle" @click="togglePlayback" :aria-label="playback.paused ? 'Play' : 'Pause'">
                <play-icon v-if="playback.paused" /><pause-icon v-else />
              </button>
              <span class="flex-1"></span>
              <button v-if="playback.resumed" type="button" class="btn btn-sm" @click="startPlaybackOver">START OVER</button>
              <button v-if="playback.airplay" type="button" class="btn btn-icon" @click="showAirplay" aria-label="AirPlay"><airplay-icon /></button>
              <button type="button" class="btn btn-icon" @click="toggleFullscreen" aria-label="Full screen"><fullscreen-icon /></button>
            </div>
          </div>
        </div>
        <div class="panel-body">
          <div class="epg-modal-actions flex items-center justify-between gap-3">
            <span :class="['status-readout', 'min-w-0', statusKind]">{{ statusText }}</span>
            <div class="flex shrink-0 gap-2">
              <button v-if="playback.phase === 'ended'" type="button" class="btn" @click="togglePlayback"><refresh-icon /> RETRY</button>
              <button type="button" class="btn" @click="stopPlayback"><cross-icon /> CLOSE</button>
            </div>
          </div>
        </div>
      </section>
    </div>
    </transition>
    </teleport>
  `,
  setup() {
    const videoEl = ref(null)
    const stageEl = ref(null)
    const recording = computed(() => playback.recording)

    const subtitle = computed(() => {
      const r = playback.recording
      if (!r) return ''
      const aired = r.aired_at ? fmtTime(r.aired_at) : ''
      return [r.episode_title, r.channel_name, aired].filter(Boolean).join(' · ')
    })

    const inAdBreak = computed(() =>
      playback.phase === 'playing' && adBreakAt({ breaks: playback.adBreaks, time: playback.position }) !== null)

    const shownPosition = computed(() => (playback.scrubbing ? playback.scrubValue : playback.position))
    const scrubMax = computed(() => Math.max(1, Math.floor(playback.duration || 0)))
    const fillPercent = computed(() => `${Math.min(100, (shownPosition.value / scrubMax.value) * 100)}%`)

    const statusText = computed(() => {
      if (playback.phase === 'ended') return playback.message
      if (playback.phase === 'starting') {
        return playback.position > 0 ? `LOADING AT ${fmtPlayTime(playback.position)}…` : 'LOADING…'
      }
      if (playback.waiting) return 'BUFFERING…'
      return playback.paused ? 'PAUSED' : 'PLAYING'
    })

    const statusKind = computed(() => {
      if (playback.phase === 'ended') return 'err'
      return playback.phase === 'playing' && !playback.waiting ? 'ok' : 'info'
    })

    const overlayText = computed(() => {
      if (playback.phase === 'ended') return playback.message
      if (playback.phase === 'starting' || playback.waiting) return statusText.value
      return ''
    })

    const onScrubInput = (e) => {
      playback.scrubbing = true
      playback.scrubValue = Number(e.target.value)
    }

    const onScrubCommit = (e) => {
      playback.scrubbing = false
      seekPlaybackTo(Number(e.target.value))
    }

    const toggleFullscreen = () => {
      if (document.fullscreenElement) return document.exitFullscreen?.().catch(() => {})
      if (stageEl.value?.requestFullscreen) return stageEl.value.requestFullscreen().catch(() => {})
      playVideo?.webkitEnterFullscreen?.()
    }

    const showAirplay = () => playVideo?.webkitShowPlaybackTargetPicker?.()

    const onTimeUpdate = () => {
      if (playback.phase !== 'playing') return
      playback.position = playback.offset + playVideo.currentTime
    }

    const onPlaying = () => {
      playback.started = true
      playback.waiting = false
      playback.paused = false
      autoRestarts = 0
    }

    const onPause = () => {
      playback.paused = true
      if (playback.phase === 'playing') savePlaybackPosition()
    }

    const onEnded = () => {
      playback.paused = true
      playback.position = playback.duration || playback.position
      savePlaybackPosition()
    }

    const onKeydown = (e) => {
      if (!playback.open) return
      if (e.key === 'Escape') return stopPlayback()
      if (e.target.closest?.('button, select, textarea, input:not(.play-range)')) return
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault()
        return togglePlayback()
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        skipPlaybackByKey(e.key === 'ArrowLeft' ? 'back' : 'forward')
      }
    }

    onMounted(() => {
      playVideo = videoEl.value
      playVideo.addEventListener('timeupdate', onTimeUpdate)
      playVideo.addEventListener('playing', onPlaying)
      playVideo.addEventListener('play', () => { playback.paused = false })
      playVideo.addEventListener('pause', onPause)
      playVideo.addEventListener('waiting', () => { playback.waiting = true })
      playVideo.addEventListener('ended', onEnded)
      playVideo.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => {
        playback.airplay = e.availability === 'available'
      })
      window.addEventListener('keydown', onKeydown)
    })
    onUnmounted(() => window.removeEventListener('keydown', onKeydown))

    return {
      playback, recording, subtitle, videoEl, stageEl, shownPosition, scrubMax, fillPercent,
      statusText, statusKind, overlayText, fmtPlayTime, inAdBreak, skipCurrentAd,
      stopPlayback, togglePlayback, startPlaybackOver, onScrubInput, onScrubCommit,
      toggleFullscreen, showAirplay, onPlayPointerDown, onPlayPointerUp,
    }
  },
}

const PLAY_HLS_CONFIG = {
  workerPath: '/vendor/hls.worker.js',
  startPosition: 0,
  maxBufferLength: 30,
  backBufferLength: 60,
}
const PLAY_HEARTBEAT_MS = 15_000
const PLAY_MAX_AUTO_RESTARTS = 2

const VIEW_MAP = {
  dashboard: DashboardView,
  live: LiveView,
  guide: EpgView,
  series: SeriesView,
  syncs: SyncsView,
  recordings: RecordingsView,
  settings: SettingsView,
  doctor: DoctorView,
  welcome: WelcomeView,
}

const TAB_FOR_ROUTE = { doctor: 'settings' }

const TABS = [
  { key: 'dashboard',  label: 'DASHBOARD'  },
  { key: 'live',       label: 'LIVE TV'    },
  { key: 'guide',      label: 'TV GUIDE'   },
  { key: 'series',     label: 'SERIES'     },
  { key: 'syncs',      label: 'SYNCS'      },
  { key: 'recordings', label: 'RECORDINGS' },
  { key: 'settings',   label: 'SETTINGS'   },
]

const App = {
  template: `
    <div class="min-h-dvh flex flex-col">
      <header ref="appHeader" class="app-header sticky top-0 z-20 backdrop-blur-md bg-surface-deep/85 border-b border-hairline">
        <div class="max-w-6xl mx-auto px-4 md:px-6">
          <div class="flex items-center justify-between gap-4 py-3">
            <a href="#/dashboard" class="no-hover-underline flex items-center gap-3 no-underline text-ink">
              <svg viewBox="0 0 15.5 3" :class="['brand-mark', 'w-[39px]', 'h-[8px]', 'shrink-0', { syncing: syncStatus.activeSyncId }]" aria-hidden="true">
                <rect x="0"    y="0" width="4" height="3" fill="#1eb6ff"/>
                <rect x="5.75" y="0" width="4" height="3" fill="#ff8a00"/>
                <rect x="11.5" y="0" width="4" height="3" fill="#e2b03c"/>
              </svg>
              <span class="font-mono font-semibold text-lg tracking-[0.1em] text-ink">Freetvarr</span>
              <span class="hidden sm:inline text-xs font-mono uppercase tracking-[0.2em] text-ink-mute translate-y-[2px]"><span class="text-signal-orange">//</span> Self-hosted free-to-air TV</span>
            </a>
            <div class="flex items-center gap-5">
              <a v-if="recordingCount" href="#/dashboard" class="no-hover-underline flex items-center gap-2" :title="recordingCount + ' recording now in TVHeadend'">
                <span class="led-dot sm live"></span>
                <span class="font-mono text-xs tracking-[0.18em] text-signal-orange">REC</span>
              </a>
              <div v-if="syncStatus.activeSyncId || !recordingCount" class="flex items-center gap-2">
                <span :class="['led-dot', 'sm', syncStatus.activeSyncId ? 'live' : 'idle']"></span>
                <span :class="['font-mono', 'text-xs', 'tracking-[0.18em]', syncStatus.activeSyncId ? 'text-signal-orange' : 'text-ink-mute']">
                  {{ syncStatus.activeSyncId ? 'SYNC' : 'IDLE' }}
                </span>
                <span v-if="syncStatus.activeSyncId" class="hidden md:inline text-xs font-mono text-ink-dim">
                  · #{{ syncStatus.activeSyncId }}
                </span>
              </div>
              <div class="hidden md:flex items-center gap-2 font-mono text-xs">
                <span class="text-ink-mute uppercase tracking-[0.18em]">{{ tzShortName }}</span>
                <span class="text-plex-yellow">{{ clockReadout }}</span>
              </div>
            </div>
          </div>
          <nav class="tab-strip">
            <a v-for="t in tabs" :key="t.key"
              :href="'#/' + t.key"
              :data-active="isActiveTab(t.key)"
              :class="['tab-led', 'block', 'whitespace-nowrap', 'px-1', 'py-2', 'font-mono', 'text-sm', 'tracking-[0.2em]', isActiveTab(t.key) ? 'text-ink' : 'text-ink-dim hover:text-ink']">
              {{ t.label }}
            </a>
          </nav>
        </div>
        <stale-build-banner />
      </header>

      <main :class="['flex-1', route === 'guide' ? 'max-w-none main-guide' : 'max-w-6xl', 'w-full', 'mx-auto', 'px-4', 'py-5', 'md:px-6', 'md:py-8']">
        <component :is="currentView" :key="route + ':' + refreshTick" />
      </main>

      <footer class="border-t border-hairline">
        <div class="max-w-6xl mx-auto px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-ink-mute">
          <span><a href="/#dashboard" class="no-underline text-ink">Freetvarr</a> <a v-if="appVersion" :href="releaseUrl(appVersion)" target="_blank" rel="noopener noreferrer" class="text-ink-dim" :title="'Freetvarr ' + appVersion + ' on GitHub'">{{ appVersion }}</a> · Self-hosted free-to-air TV</span>
          <a
            href="https://github.com/furey/freetvarr"
            target="_blank"
            rel="noopener noreferrer"
            class="icon-link"
            aria-label="View source on GitHub"
            title="View source on GitHub">
            <svg viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor" aria-hidden="true">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
            </svg>
          </a>
        </div>
      </footer>
      <live-player />
      <recording-player />
    </div>
  `,
  setup() {
    const currentView = computed(() => VIEW_MAP[route.value] || DashboardView)
    const isActiveTab = (key) => (TAB_FOR_ROUTE[route.value] || route.value) === key
    watch(route, async () => {
      await nextTick()
      document.querySelector('.tab-strip [data-active="true"]')
        ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    }, { immediate: true })
    const appVersion = computed(() => serverAbout.value.version || '')
    const appHeader = ref(null)
    const publishHeaderHeight = () => {
      document.documentElement.style.setProperty('--app-header-h', `${appHeader.value?.offsetHeight ?? 0}px`)
    }
    const headerObserver = new ResizeObserver(publishHeaderHeight)
    onMounted(() => {
      publishHeaderHeight()
      headerObserver.observe(appHeader.value)
    })
    onUnmounted(() => headerObserver.disconnect())
    return {
      appHeader, route, refreshTick, tabs: TABS, currentView, isActiveTab,
      syncStatus, clockReadout, tzShortName, recordingCount,
      appVersion, releaseUrl,
    }
  },
}

const welcomeDismissed = () => {
  try { return localStorage.getItem(WELCOME_DISMISSED_KEY) === '1' } catch { return false }
}

checkForNewBuild()

fetch('/api/settings')
  .then((r) => noteBuild(r).json())
  .then((s) => {
    if (s.tz) tz.value = s.tz
    const hashIsExplicit = (window.location.hash || '').replace(/^#\/?/, '').toLowerCase()
    if (!s.tvh_url && !welcomeDismissed() && hashIsExplicit !== 'welcome') {
      window.history.replaceState(null, '', '#/welcome')
      route.value = 'welcome'
    }
  })
  .catch(() => {})

loadSyncStatus().then(ensureSyncPolling)
pollRecordingNow()

const PULL_TRIGGER_PX = 60
const PULL_HOLD_PX = 52
const PULL_SLOP_PX = 6
const PULL_TICKS = 8
const PULL_MIN_SPIN_MS = 600
const PULL_FADE_MS = 200
const PULL_SETTLE_MS = 350
const PULL_SPRING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

const PULL_REFRESH_SPINNER = `<span class="pull-refresh-spinner">${
  Array.from({ length: PULL_TICKS }, (_, i) => `<i style="--i:${i}"></i>`).join('')
}</span>`

const isStandaloneApp = () =>
  window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches

const hasScrolledAncestor = (el) => {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (node.scrollTop > 0) return true
  }
  return false
}

const pullBlocked = (e) => window.scrollY > 0
  || e.touches.length > 1
  || Boolean(e.target.closest?.('.epg-modal-backdrop, .epg-row.pinned .epg-rail-cell, .live-row.pinned .live-row-handle'))
  || hasScrolledAncestor(e.target)

const clamp01 = (n) => Math.min(1, Math.max(0, n))

const rubberBand = (dragged, span = window.innerHeight) => (1 - 1 / ((dragged * 0.55) / span + 1)) * span

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const refreshInPlace = async () => {
  refreshTick.value += 1
  await Promise.all([loadSyncStatus(), pollRecordingNow(), wait(PULL_MIN_SPIN_MS)])
}

const refreshFromPull = async () => {
  await checkForNewBuild()
  if (shouldReloadOnPull({ loaded: loadedBuild, latest: latestBuild.value })) return window.location.reload()
  await refreshInPlace()
}

const installPullToRefresh = ({ onRefresh }) => {
  if (!isStandaloneApp()) return
  const page = document.getElementById('app')
  const indicator = document.createElement('div')
  indicator.className = 'pull-refresh'
  indicator.setAttribute('aria-hidden', 'true')
  indicator.innerHTML = PULL_REFRESH_SPINNER
  document.body.append(indicator)
  let start = null
  let claimed = false
  let committed = false
  let offset = 0
  let refreshing = false
  let frame = 0
  const settleTransition = () => (prefersReducedMotion()
    ? 'transform 150ms linear'
    : `transform ${PULL_SETTLE_MS}ms ${PULL_SPRING}`)
  const render = (animate) => {
    const transition = animate ? settleTransition() : 'none'
    page.style.transition = transition
    indicator.style.transition = transition
    page.style.transform = offset ? `translate3d(0, ${offset}px, 0)` : ''
    const bar = page.querySelector('.settings-save-bar')
    if (bar) {
      bar.style.transition = transition
      bar.style.transform = offset ? `translate3d(0, ${-offset}px, 0)` : ''
    }
    indicator.style.transform = `translate3d(-50%, ${offset / 2}px, 0)`
    indicator.style.setProperty('--pull-progress', clamp01(offset / PULL_TRIGGER_PX))
  }
  const place = (px, { animate = false } = {}) => {
    offset = px
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => render(animate))
  }
  const finish = async () => {
    indicator.classList.add('done')
    await wait(PULL_FADE_MS)
    place(0, { animate: true })
    await wait(PULL_SETTLE_MS)
    indicator.classList.remove('refreshing', 'done')
    document.body.classList.remove('pull-refreshing')
    refreshing = false
  }
  const commit = () => {
    committed = true
    indicator.classList.add('refreshing')
  }
  const runRefresh = async () => {
    refreshing = true
    document.body.classList.add('pull-refreshing')
    place(PULL_HOLD_PX, { animate: true })
    await onRefresh().catch(() => {})
    await finish()
  }
  const release = () => {
    start = null
    if (committed) {
      committed = false
      return runRefresh()
    }
    place(0, { animate: true })
  }
  window.addEventListener('touchstart', (e) => {
    if (refreshing || pullBlocked(e)) return
    const touch = e.touches[0]
    start = { x: touch.clientX, y: touch.clientY }
    claimed = false
    committed = false
  }, { passive: true })
  window.addEventListener('touchmove', (e) => {
    if (!start) return
    if (e.touches.length > 1 || document.body.classList.contains('epg-drag-lock')) {
      committed = false
      indicator.classList.remove('refreshing')
      return release()
    }
    const touch = e.touches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (!claimed) {
      if (Math.abs(dx) < PULL_SLOP_PX && Math.abs(dy) < PULL_SLOP_PX) return
      if (Math.abs(dx) > dy) {
        start = null
        return
      }
      claimed = true
    }
    e.preventDefault()
    place(rubberBand(Math.max(0, dy - PULL_SLOP_PX)))
    if (!committed && offset >= PULL_TRIGGER_PX) commit()
  }, { passive: false })
  window.addEventListener('touchend', (e) => {
    if (!start || e.touches.length > 0) return
    release()
  })
  window.addEventListener('touchcancel', () => {
    if (start) release()
  })
}

installPullToRefresh({ onRefresh: refreshFromPull })

const app = createApp(App)
app.directive('no-autofill', noAutofill)
app.component('summary-line', SummaryLine)
app.component('progress-block', ProgressBlock)
app.component('programme-image', ProgrammeImage)
app.component('channel-logo', ChannelLogo)
app.component('toggle-switch', ToggleSwitch)
app.component('time-zone-field', TimeZoneField)
app.component('guide-combobox', GuideCombobox)
app.component('manual-option', ManualOption)
app.component('plex-library-setup', PlexLibrarySetup)
app.component('channel-setup-step', ChannelSetupStep)
app.component('guide-setup-step', GuideSetupStep)
app.component('channel-identity', ChannelIdentity)
app.component('star-icon', StarIcon)
app.component('step-mark-icon', StepMarkIcon)
app.component('sort-arrow', SortArrow)
app.component('signal-bars-icon', SignalBarsIcon)
app.component('recording-card', RecordingCard)
app.component('recording-now-panel', RecordingNowPanel)
app.component('live-player', LivePlayer)
app.component('recording-player', RecordingPlayer)
app.component('pause-icon', PauseIcon)
app.component('fullscreen-icon', FullscreenIcon)
app.component('airplay-icon', AirplayIcon)
app.component('stale-build-banner', StaleBuildBanner)
app.component('channels-modal', ChannelsModal)
app.component('info-button', InfoButton)
app.component('series-folder-editor', FolderEditor)
app.component('filter-sheet', FilterSheet)
app.component('header-button', HeaderButton)
app.component('zoom-control', ZoomControl)
app.component('filter-icon', FilterIcon)
app.component('image-icon', ImageIcon)
app.component('versions-row', VersionsRow)
app.component('copy-row', CopyRow)
app.component('tv-apps-panel', TvAppsPanel)
app.component('copy-icon', CopyIcon)
app.component('info-icon', InfoIcon)
app.component('eye-icon', EyeIcon)
app.component('eye-off-icon', EyeOffIcon)
app.component('doctor-spinner', DoctorSpinner)
app.directive('autofocus', {
  mounted: (el, binding) => {
    if (binding.value !== false) el.focus()
  },
})
app.component('tv-icon', TvIcon)
app.component('cross-icon', CrossIcon)
app.component('record-icon', RecordIcon)
app.component('stop-icon', StopIcon)
app.component('go-live-icon', GoLiveIcon)
app.component('refresh-icon', RefreshIcon)
app.component('sliders-icon', SlidersIcon)
app.component('arrow-left-icon', ArrowLeftIcon)
app.component('arrow-right-icon', ArrowRightIcon)
app.component('arrow-up-icon', ArrowUpIcon)
app.component('chevron-right-icon', ChevronRightIcon)
app.component('calendar-icon', CalendarIcon)
app.component('arrow-down-icon', ArrowDownIcon)
app.component('play-icon', PlayIcon)
app.component('plus-icon', PlusIcon)
app.component('minus-icon', MinusIcon)
app.component('check-icon', CheckIcon)
app.component('pencil-icon', PencilIcon)
app.component('search-icon', SearchIcon)
app.component('pulse-icon', PulseIcon)
app.component('bolt-icon', BoltIcon)
app.component('download-icon', DownloadIcon)
app.component('trash-icon', TrashIcon)
app.component('external-link-icon', ExternalLinkIcon)
app.mount('#app')
