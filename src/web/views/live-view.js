import { ref, computed, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { watchRowLabel } from '/live-info.js'
import { OFF_AIR_MESSAGE, channelGroupLabel } from '/components/channel-identity.js'
import { togglePinnedChannel } from '/components/channels-modal.js'
import { api, fetchSettings } from '/shared/api.js'
import { useMediaQuery, useFlash } from '/shared/composables.js'
import { EPG_NARROW_QUERY, CHANNELS_SAVED_TEXT } from '/shared/constants.js'
import { onNowPercent, onNowMeta } from '/shared/format.js'
import { watchLive } from '/shared/live-session.js'
import { usePinDrag } from '/shared/pin-drag.js'
import { isRecordingChannel } from '/shared/recording-now.js'
import { storedFlag, storedChoice } from '/shared/storage.js'
import { openInGuide } from '/shared/store.js'
import { fmtClockTz } from '/shared/time.js'

export const LiveView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">LIVE TV</span>
            <info-button title="LIVE TV" doc="guide/live-tv#in-freetvarr">
              <p>Every channel in TVHeadend, with what is on now and next. Tap a channel to watch it in the browser. Tap <strong>INFO</strong> to open the programme's details in the <strong>TV GUIDE</strong>.</p>
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
            Connect TVHeadend in <a href="#/settings/system/tvheadend">Settings</a> to watch live TV.
          </p>
          <div v-else-if="error" class="flex flex-wrap items-center gap-3">
            <span class="status-readout err">Guide unavailable: {{ error }}</span>
            <button type="button" class="btn btn-sm" @click="load"><refresh-icon /> RETRY</button>
          </div>
          <list-skeleton v-else-if="!data" class="live-skeleton" :rows="8" logo :thumb="showImages" />
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
                    :number="paddedNumber(e.channel.number)" @pin="togglePin(e.channel)" />
                </div>
                <div class="live-row-now">
                  <button type="button" class="on-now-open live-now-open row-play" :title="e.channel.offAir ? OFF_AIR_MESSAGE : null"
                    :aria-label="watchRowLabel({ channel: e.channel, now: e.now })" @click="watchLive({ channel: e.channel, nowTitle: e.now?.title || '' })">
                    <template v-if="e.now">
                    <span v-if="showImages" class="live-now-thumb">
                      <programme-image :event-id="e.now.has_image ? e.now.program_id : null"
                        :channel-id="e.channel.id" :has-logo="e.channel.hasLogo" :title="e.now.title" />
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
                    </template>
                    <span v-else class="text-sm text-ink-mute">No guide data</span>
                  </button>
                </div>
                <button v-if="e.next" type="button" class="on-now-open row-over live-row-next font-mono text-xs text-ink-dim min-w-0 truncate"
                  :aria-label="'Show details for ' + e.next.title" @click="openDetails(e, e.next)">
                  next: <span class="text-xs font-semibold font-sans text-ink">{{ e.next.title }}</span> {{ fmtClockTz(e.next.start) }}
                </button>
                <button v-if="e.now" type="button" class="btn btn-sm row-info row-over live-row-info"
                  :aria-label="'Programme info for ' + e.now.title" @click="openDetails(e, e.now)">INFO</button>
                <span v-else class="row-info live-row-info" aria-hidden="true"></span>
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

    const channelNumberWidth = computed(() =>
      Math.max(2, ...(data.value?.entries || []).map((e) => String(e.channel.number ?? '').length)))
    const paddedNumber = (number) => (number == null ? '' : String(number).padStart(channelNumberWidth.value, '0'))

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
        const settings = await fetchSettings().catch(() => ({}))
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
      paddedNumber,
      OFF_AIR_MESSAGE, load, togglePin, onChannelPrefsSaved, openDetails, watchLive, watchRowLabel,
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
