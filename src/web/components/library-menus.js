import { ref, computed, watch, nextTick, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { artFallbackStyle } from '/art-fallback.js'
import { deleteConfirmOf, deleteOutcomeOf, deleteRefusalOf } from '/delete-copy.js'
import { menuPendingLabelOf } from '/library-menus.js'
import { dialogBlocksOf } from '/dialog-blocks.js'
import { overlayStack } from '/overlay-stack.js'
import { holdAtLeast } from '/pending.js'
import { episodeHeading } from '/show-page.js'
import { keepFocusInside } from '/components/ui-sheet.js'
import { api } from '/shared/api.js'
import { stopPlayback } from '/shared/playback-session.js'
import { playback } from '/shared/player-shared.js'
import { refreshAfterRecordingChange } from '/shared/recording-now.js'
import { toast } from '/shared/toast.js'
import { stampedShowImage } from '/shared/artwork-stamps.js'

export const MenuIcon = {
  props: { name: { type: String, required: true } },
  template: `
    <svg width="20" height="20" viewBox="0 0 24 24" :fill="filled ? 'currentColor' : 'none'" stroke="currentColor"
      :stroke-width="filled ? 0 : 2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <component v-for="(shape, i) in shapes" :key="i" :is="shape.tag" v-bind="shape.attrs" />
    </svg>
  `,
  setup(props) {
    const shapes = computed(() => MENU_ICONS[props.name] || [])
    const filled = computed(() => props.name === 'play')
    return { shapes, filled }
  },
}

export const LibraryMenuSheet = {
  components: { MenuIcon },
  props: {
    open: Boolean,
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    artSrc: { type: String, default: '' },
    fallbackSrc: { type: String, default: '' },
    artTitle: { type: String, default: '' },
    artShape: { type: String, default: 'wide' },
    groups: { type: Array, default: () => [] },
    tip: { type: String, default: '' },
    busy: Boolean,
    pendingKey: { type: String, default: '' },
  },
  emits: ['close', 'choose'],
  template: `
    <ui-sheet :open="open" :title="title" :subtitle="subtitle" @close="$emit('close')">
      <template #header-lead>
        <span :class="['library-menu-art', 'ui-art-fallback', 'is-' + artShape]" :style="artStyle" aria-hidden="true">
          <img v-if="artUrl" :key="artUrl" :src="artUrl" alt="" @error="artTried += 1" />
          <span v-else class="ui-art-title library-menu-art-title">{{ artTitle || title }}</span>
        </span>
      </template>
      <div class="library-menu">
        <div v-for="(group, g) in groups" :key="g" class="ui-group library-menu-group">
          <button v-for="item in group" :key="item.key" type="button"
            :class="['ui-group-row', 'library-menu-item', { 'is-danger': item.danger, 'is-pending': pendingKey === item.key }]"
            :disabled="busy || item.disabled" :aria-busy="pendingKey === item.key" @click="$emit('choose', item.key)">
            <span v-if="pendingKey === item.key" class="spinner library-menu-spinner" aria-hidden="true"></span><menu-icon v-else :name="item.icon" :class="'is-' + item.icon" />
            <span class="library-menu-label">{{ pendingKey === item.key ? menuPendingLabelOf(item.key) : item.label }}</span>
            <small v-if="item.detail" class="library-menu-detail">{{ item.detail }}</small>
          </button>
        </div>
        <p v-if="tip" class="library-menu-tip">{{ tip }}</p>
      </div>
    </ui-sheet>
  `,
  setup(props) {
    const artTried = ref(0)
    watch(() => [props.artSrc, props.fallbackSrc], () => { artTried.value = 0 })
    const artUrls = computed(() => [...new Set([props.artSrc, props.fallbackSrc].filter(Boolean).map(stampedShowImage))])
    const artUrl = computed(() => artUrls.value[artTried.value] || '')
    const artStyle = computed(() => artFallbackStyle(props.artTitle || props.title))
    return { artTried, artUrl, artStyle, menuPendingLabelOf }
  },
}

export const LibraryInfoSheet = {
  props: {
    open: Boolean,
    info: { type: Object, default: null },
  },
  emits: ['close'],
  template: `
    <ui-sheet :open="open && Boolean(info)" :title="info?.title || ''" :subtitle="info?.subtitle || ''" @close="$emit('close')">
      <template v-if="info">
        <p v-if="info.text" class="library-info-text">{{ info.text }}</p>
        <dl class="ui-group library-info-rows">
          <div v-for="row in info.rows" :key="row.label" class="ui-group-row library-info-row">
            <dt class="library-info-label">{{ row.label }}</dt>
            <dd :class="['library-info-value', { 'ui-mono': row.mono }]">{{ row.value }}</dd>
          </div>
        </dl>
      </template>
      <template #footer>
        <button type="button" class="ui-button ui-button-block" @click="$emit('close')">Close</button>
      </template>
    </ui-sheet>
  `,
}

export const DeleteConfirm = {
  components: { MenuIcon },
  props: {
    request: { type: Object, default: null },
  },
  emits: ['cancel', 'done'],
  template: `
    <teleport to="body">
      <transition name="library-dialog">
        <div v-if="request" class="library-dialog-backdrop" :style="{ zIndex }" @click.self="cancel">
          <section ref="dialog" class="library-dialog" role="alertdialog" aria-modal="true" :aria-labelledby="titleId"
            :aria-describedby="bodyId" tabindex="-1">
            <div v-if="request.variant === 'episode' && lead" class="library-dialog-episode">
              <span class="library-dialog-thumb ui-art-fallback" :style="leadStyle">
                <img v-if="lead.image && !leadFailed" :src="lead.image" alt="" @error="leadFailed = true" />
              </span>
              <span class="library-dialog-episode-text">
                <span class="library-dialog-episode-title">{{ leadTitle }}</span>
                <span class="library-dialog-episode-meta">{{ request.leadMeta }}</span>
              </span>
            </div>
            <h2 :id="titleId" class="library-dialog-title">{{ copy ? copy.title : loadingTitle }}</h2>
            <div :id="bodyId" class="library-dialog-body">
              <p v-if="loadError" class="library-dialog-note is-error" role="alert"><menu-icon name="warning" /><span>{{ loadError }}</span></p>
              <template v-else-if="!copy">
                <span class="ui-skeleton is-row library-dialog-skeleton"></span>
                <span class="ui-skeleton is-row library-dialog-skeleton"></span>
              </template>
              <template v-else>
                <div class="library-dialog-block is-deleted">
                  <h3 class="library-dialog-block-title">What gets deleted</h3>
                  <ul>
                    <li v-for="line in copy.deleted" :key="line.title"><menu-icon name="trash" /><span><b>{{ line.title }}</b><small v-if="line.detail">{{ line.detail }}</small></span></li>
                  </ul>
                </div>
                <p v-if="copy.missingNote" class="library-dialog-note"><menu-icon name="warning" /><span>{{ copy.missingNote }}</span></p>
                <div v-if="copy.stays.length" class="library-dialog-block is-kept">
                  <h3 class="library-dialog-block-title">What stays</h3>
                  <ul>
                    <li v-for="line in copy.stays" :key="line.title"><menu-icon name="check" /><span><b>{{ line.title }}</b><small v-if="line.detail">{{ line.detail }}</small></span></li>
                  </ul>
                </div>
                <label v-if="copy.offersStopSeries" class="library-dialog-check">
                  <input v-model="stopSeries" type="checkbox" :disabled="busy" />
                  <span class="library-dialog-check-box" aria-hidden="true"><menu-icon name="check" /></span>
                  <span>Stop recording this show too</span>
                </label>
                <p v-if="refusal" class="library-dialog-note" role="alert"><menu-icon name="warning" /><span>{{ refusal }}</span></p>
                <p class="library-dialog-undo">You can't undo this.</p>
              </template>
            </div>
            <div class="library-dialog-buttons">
              <button ref="cancelButton" type="button" class="library-dialog-cancel" :disabled="busy" @click="cancel">Cancel</button>
              <button type="button" :class="['library-dialog-go', { 'is-pending': busy }]" :disabled="busy || !copy || !preview?.count"
                :aria-busy="busy" @click="confirm">
                <span v-if="busy" class="spinner" aria-hidden="true"></span>{{ busy ? copy?.busyLabel : (copy?.confirmLabel || 'Delete') }}
              </button>
            </div>
          </section>
        </div>
      </transition>
    </teleport>
  `,
  setup(props, { emit }) {
    const dialog = ref(null)
    const cancelButton = ref(null)
    const zIndex = ref(null)
    const preview = ref(null)
    const loadError = ref('')
    const refusal = ref('')
    const busy = ref(false)
    const stopSeries = ref(false)
    const leadFailed = ref(false)
    const titleId = `library-dialog-title-${++dialogCount}`
    const bodyId = `${titleId}-body`
    let loadRun = 0

    const ids = computed(() => (props.request?.episodes || []).map((episode) => episode.recordingId))
    const lead = computed(() => props.request?.episodes?.[0] || null)
    const leadTitle = computed(() => (lead.value ? episodeHeading(lead.value) : ''))
    const leadStyle = computed(() => artFallbackStyle(props.request?.show?.title || ''))
    const loadingTitle = computed(() => (props.request?.variant === 'episode' ? 'Delete this episode?' : 'Delete episodes?'))
    const copy = computed(() => (preview.value && props.request
      ? deleteConfirmOf({
        variant: props.request.variant,
        show: props.request.show,
        preview: preview.value,
        episodes: props.request.episodes.filter((episode) => preview.value.items.some((item) => item.recordingId === episode.recordingId)),
        totalCount: props.request.totalCount,
        stopSeries: stopSeries.value,
      })
      : null))

    const loadPreview = async () => {
      const run = ++loadRun
      loadError.value = ''
      try {
        const result = await api('POST', '/api/library/delete/preview', { recording_ids: ids.value })
        if (run === loadRun) preview.value = result
      } catch (err) {
        if (run === loadRun) loadError.value = `Could not check what to delete: ${err.message}`
      }
    }

    const onOpen = () => {
      preview.value = null
      refusal.value = ''
      stopSeries.value = false
      leadFailed.value = false
      loadPreview()
    }

    const cancel = () => {
      if (!busy.value) emit('cancel')
    }

    const stopPlayingTarget = () => {
      const playingId = playback.open ? playback.recording?.recording_id : null
      if (playingId && ids.value.includes(playingId)) stopPlayback()
    }

    const stopSeriesRecording = async () => {
      const autorecs = props.request.show.rule?.autorecs || []
      if (!autorecs.length) return ''
      try {
        await api('POST', '/api/epg/cancel-series', {
          series_link_ids: autorecs.map((autorec) => autorec.seriesLinkId),
          stop_recording_now: false,
          title_match_id: null,
        })
        return ''
      } catch (err) {
        return `The series recording is still on: ${err.message}`
      }
    }

    const confirm = async () => {
      busy.value = true
      refusal.value = ''
      stopPlayingTarget()
      try {
        const body = await holdAtLeast({
          task: () => api('POST', '/api/library/delete', {
            recording_ids: preview.value.items.map((item) => item.recordingId),
            expected_count: preview.value.count,
          }),
        })
        const seriesFailure = copy.value.offersStopSeries && stopSeries.value ? await stopSeriesRecording() : ''
        const labelsById = Object.fromEntries(props.request.episodes.map((episode) => [episode.recordingId, episodeHeading(episode)]))
        const outcome = deleteOutcomeOf({ body, labelsById })
        refreshAfterRecordingChange()
        busy.value = false
        emit('done', {
          ...outcome,
          failures: seriesFailure ? [...outcome.failures, seriesFailure] : outcome.failures,
          stoppedSeries: Boolean(copy.value.offersStopSeries && stopSeries.value && !seriesFailure),
        })
      } catch (err) {
        const refused = deleteRefusalOf(err)
        refusal.value = refused.message
        busy.value = false
        if (refused.recheck) loadPreview()
      }
    }

    useAlertDialog({ dialog, isOpen: () => Boolean(props.request), onOpen, cancel: () => cancel(), zIndex, initialFocus: () => cancelButton.value })

    return {
      dialog, cancelButton, zIndex, preview, loadError, refusal, busy, stopSeries, leadFailed, titleId, bodyId,
      lead, leadTitle, leadStyle, loadingTitle, copy, cancel, confirm,
    }
  },
}

export const ActionConfirm = {
  components: { MenuIcon },
  props: {
    request: { type: Object, default: null },
  },
  emits: ['cancel', 'done'],
  template: `
    <teleport to="body">
      <transition name="library-dialog">
        <div v-if="request && copy" class="library-dialog-backdrop" :style="{ zIndex }" @click.self="cancel">
          <section ref="dialog" class="library-dialog" role="alertdialog" aria-modal="true" :aria-labelledby="titleId"
            :aria-describedby="bodyId" tabindex="-1">
            <div v-if="request.lead" class="library-dialog-episode">
              <span class="library-dialog-thumb ui-art-fallback" :style="leadStyle">
                <img v-if="request.lead.image && !leadFailed" :src="request.lead.image" alt="" @error="leadFailed = true" />
              </span>
              <span class="library-dialog-episode-text">
                <span class="library-dialog-episode-title">{{ request.lead.title }}</span>
                <span class="library-dialog-episode-meta">{{ request.lead.meta }}</span>
              </span>
            </div>
            <h2 :id="titleId" class="library-dialog-title">{{ copy.title }}</h2>
            <div :id="bodyId" class="library-dialog-body">
              <div v-for="block in blocks" :key="block.key" :class="['library-dialog-block', block.className]">
                <h3 class="library-dialog-block-title">{{ block.heading }}</h3>
                <ul>
                  <li v-for="line in block.lines" :key="line.title"><menu-icon :name="line.icon || block.icon" /><span><b>{{ line.title }}</b><small v-if="line.detail">{{ line.detail }}</small></span></li>
                </ul>
              </div>
              <p v-if="copy.note" class="library-dialog-note"><menu-icon :name="copy.noteIcon || 'clock'" /><span>{{ copy.note }}</span></p>
              <p v-if="refusal" class="library-dialog-note is-error" role="alert"><menu-icon name="warning" /><span>{{ refusal }}</span></p>
              <p v-if="copy.undo" :class="['library-dialog-undo', { 'is-quiet': !copy.danger }]">{{ copy.undo }}</p>
            </div>
            <div class="library-dialog-buttons">
              <button ref="cancelButton" type="button" class="library-dialog-cancel" :disabled="busy" @click="cancel">Cancel</button>
              <button type="button" :class="['library-dialog-go', { 'is-safe': !copy.danger, 'is-pending': busy }]" :disabled="busy"
                :aria-busy="busy" @click="confirm">
                <span v-if="busy" class="spinner" aria-hidden="true"></span>{{ busy ? copy.busyLabel : copy.goLabel }}
              </button>
            </div>
          </section>
        </div>
      </transition>
    </teleport>
  `,
  setup(props, { emit }) {
    const dialog = ref(null)
    const cancelButton = ref(null)
    const zIndex = ref(null)
    const busy = ref(false)
    const refusal = ref('')
    const leadFailed = ref(false)
    const titleId = `library-dialog-title-${++dialogCount}`
    const bodyId = `${titleId}-body`

    const copy = computed(() => {
      const source = props.request?.copy
      return typeof source === 'function' ? source() : source || null
    })
    const blocks = computed(() => dialogBlocksOf(copy.value))
    const leadStyle = computed(() => artFallbackStyle(props.request?.lead?.fallbackTitle || props.request?.lead?.title || ''))

    const onOpen = () => {
      busy.value = false
      refusal.value = ''
      leadFailed.value = false
    }

    const cancel = () => {
      if (!busy.value) emit('cancel')
    }

    const confirm = async () => {
      busy.value = true
      refusal.value = ''
      try {
        const result = await holdAtLeast({ task: () => props.request.run() })
        busy.value = false
        emit('done', result)
      } catch (err) {
        refusal.value = err.message
        busy.value = false
      }
    }

    useAlertDialog({
      dialog,
      isOpen: () => Boolean(props.request),
      onOpen,
      cancel,
      zIndex,
      initialFocus: () => (copy.value?.danger ? cancelButton.value : dialog.value),
    })

    return { dialog, cancelButton, zIndex, busy, refusal, leadFailed, titleId, bodyId, copy, blocks, leadStyle, cancel, confirm }
  },
}

const useAlertDialog = ({ dialog, isOpen, onOpen, cancel, zIndex, initialFocus = () => dialog.value }) => {
  let layerId = null
  let returnFocus = null

  const onKeydown = (event) => {
    if (!overlayStack.isTop(layerId)) return
    if (event.key === 'Tab') return keepFocusInside({ event, root: dialog.value })
    if (event.key !== 'Escape') return
    event.stopImmediatePropagation()
    cancel()
  }

  const setOpen = async (open) => {
    window.removeEventListener('keydown', onKeydown, true)
    if (!open) {
      overlayStack.remove(layerId)
      layerId = null
      try { document.body.classList.toggle('sheet-open', overlayStack.size() > 0) } catch {}
      returnFocus?.focus?.()
      return
    }
    const layer = overlayStack.push({ onBack: cancel })
    layerId = layer.id
    zIndex.value = layer.zIndex
    try { document.body.classList.add('sheet-open') } catch {}
    returnFocus = document.activeElement
    window.addEventListener('keydown', onKeydown, true)
    onOpen()
    await nextTick()
    initialFocus()?.focus()
  }

  watch(isOpen, setOpen)
  onUnmounted(() => {
    if (isOpen()) setOpen(false)
  })
}

export const useLibraryToast = () => {
  const showToast = ({ kind = 'ok', title, detail = '', failures = [] }) =>
    toast({ text: title, detail: [detail, ...failures].filter(Boolean).join('\n'), kind })
  const showFlash = ({ msg, kind = 'ok' }) => showToast({ kind, title: msg })
  return { showToast, showFlash }
}

export const openPlexLink = async ({ url, onMissing }) => {
  const tab = window.open('about:blank', '_blank')
  try {
    const result = await api('GET', url)
    if (!result.url) {
      tab?.close()
      return onMissing(result.reason || 'Plex has not found this yet')
    }
    if (!tab) return window.open(result.url, '_blank', 'noopener')
    tab.opener = null
    tab.location.href = result.url
  } catch (err) {
    tab?.close()
    onMissing(err.message)
  }
}

let dialogCount = 0


const path = (d) => ({ tag: 'path', attrs: { d } })
const circle = (cx, cy, r) => ({ tag: 'circle', attrs: { cx, cy, r } })
const rect = (x, y, width, height) => ({ tag: 'rect', attrs: { x, y, width, height } })
const dot = (r) => ({ tag: 'circle', attrs: { cx: 12, cy: 12, r, fill: 'currentColor', stroke: 'none' } })

const MENU_ICONS = {
  play: [path('M7 4v16l13-8z')],
  check: [path('M20 6 9 17l-5-5')],
  unwatched: [{ tag: 'circle', attrs: { cx: 12, cy: 12, r: 9, 'stroke-dasharray': '3.2 3.2' } }],
  options: [circle(12, 12, 3), path('M12 2v3M12 19v3M2 12h3M19 12h3')],
  pause: [rect(6, 5, 4, 14), rect(14, 5, 4, 14)],
  info: [circle(12, 12, 9), path('M12 11v6M12 7.5v.5')],
  tag: [path('M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z'), { tag: 'circle', attrs: { cx: 7.5, cy: 7.5, r: 0.5, fill: 'currentColor' } }],
  movie: [path('M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'), path('M3 11 2.3 8.4a1.6 1.6 0 0 1 1.1-2l13.3-3.6a1.6 1.6 0 0 1 2 1.1L19.4 6.6z'), path('m6.3 5.3 3.3 3.9M12.2 3.7l3.3 3.9')],
  'not-movie': [path('M7 11H3v8a2 2 0 0 0 2 2h12M15 11h6v6'), path('M3 11l-.7-2.6a1.6 1.6 0 0 1 .8-1.9M9.5 4.6l7.2-1.9a1.6 1.6 0 0 1 2 1.1l.7 2.7-5.8 1.6'), path('m12.2 3.7 2.6 3.1'), path('m2 2 20 20')],
  external: [path('M14 4h6v6M20 4l-9 9M18 14v6H4V6h6')],
  picture: [{ tag: 'rect', attrs: { x: 3, y: 3, width: 18, height: 18, rx: 2 } }, circle(9, 9, 2), path('m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21')],
  refresh: [path('M21 12a9 9 0 1 1-3-6.7L21 8'), path('M21 3v5h-5')],
  restart: [path('M3 12a9 9 0 1 0 3-6.7L3 8'), path('M3 3v5h5')],
  trash: [path('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13')],
  'check-list': [path('M4 12h10M4 6h16M4 18h7'), path('m16 15 2 2 4-4')],
  ads: [circle(6, 6, 3), circle(6, 18, 3), path('M8.6 7.6 20 18M8.6 16.4 20 6')],
  warning: [path('M12 3 2 20h20z'), path('M12 10v4M12 17v.5')],
  clock: [circle(12, 12, 9), path('M12 7v5l3 2')],
  stop: [{ tag: 'rect', attrs: { x: 6, y: 6, width: 12, height: 12, rx: 1.5 } }],
  record: [dot(6)],
  series: [circle(12, 12, 9), dot(4.5)],
  show: [{ tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 13, rx: 2 } }, path('M8 21h8M12 17v4')],
  skip: [circle(12, 12, 9), path('m5.6 5.6 12.8 12.8')],
  plus: [path('M12 5v14M5 12h14')],
  move: [path('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'), path('M8.5 13h7M13 10.5l2.5 2.5-2.5 2.5')],
}
