import { ref, computed, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { watchRowLabel } from '/live-info.js'
import { OFF_AIR_MESSAGE, channelGroupLabel } from '/components/channel-identity.js'
import { togglePinnedChannel } from '/components/channels-modal.js'
import { api, fetchSettings } from '/shared/api.js'
import { useFlash } from '/shared/composables.js'
import { CHANNELS_SAVED_TEXT } from '/shared/constants.js'
import { onNowPercent } from '/shared/format.js'
import { groupsOf, matchesFilter, timeLeftLabel, nextLabel } from '/live-list.js'
import { watchLive } from '/shared/live-session.js'
import { usePinDrag } from '/shared/pin-drag.js'
import { isRecordingChannel } from '/shared/recording-now.js'
import { storedFlag, storedChoice } from '/shared/storage.js'
import { openInGuide } from '/shared/store.js'
import { now, fmtClockTz } from '/shared/time.js'

export const LiveView = {
  template: `
    <div class="ui-page live-page">
      <page-header title="Live TV">
        <template #actions>
          <span v-if="flashText" :class="['status-readout', flashKind]" role="status">{{ flashText }}</span>
        </template>
      </page-header>
      <div class="live-toolbar">
        <div class="ui-segmented live-scope" role="group" aria-label="Channels shown">
          <button type="button" class="ui-segment" :aria-pressed="String(!pinnedOnly)" @click="pinnedOnly = false">All channels</button>
          <button type="button" class="ui-segment" :aria-pressed="String(pinnedOnly)" @click="pinnedOnly = true">Favourites</button>
        </div>
        <label class="live-filter">
          <search-icon />
          <input v-no-autofill v-model="filterQ" type="search" placeholder="Filter channels or shows" aria-label="Filter channels or shows" />
        </label>
        <button type="button" class="live-images-toggle" role="switch" :aria-checked="String(showImages)" @click="showImages = !showImages">
          Images<span class="live-images-track" aria-hidden="true"></span>
        </button>
        <div class="ui-segmented is-compact live-zoom" role="group" aria-label="Zoom">
          <span class="ui-segmented-label">Zoom</span>
          <button v-for="level in zoomLevels" :key="level" type="button" class="ui-segment"
            :aria-pressed="String(zoom === level)" :aria-label="zoomLabels[level]" @click="zoom = level">{{ level.toUpperCase() }}</button>
        </div>
        <button type="button" class="ui-icon-button live-settings" aria-label="Channel settings" title="Channel settings"
          :disabled="!data" @click="channelsModal = true"><sliders-icon /></button>
      </div>
      <p v-if="tvhConfigured === false" class="live-note">
        Connect TVHeadend in <a href="#/settings/system/tvheadend">Settings</a> to watch live TV.
      </p>
      <div v-else-if="error" class="live-note live-error">
        <span class="status-readout err">Guide unavailable: {{ error }}</span>
        <button type="button" class="ui-button ui-button-secondary ui-button-sm" @click="load"><refresh-icon /> Retry</button>
      </div>
      <list-skeleton v-else-if="!data" class="live-skeleton" :rows="8" logo :thumb="showImages" />
      <p v-else-if="!groups.length && favouritesHint" class="live-note">No favourites yet. Tap <star-icon class="icon-inline" /> next to a channel to add it.</p>
      <p v-else-if="!groups.length" class="live-note">{{ emptyText }}</p>
      <div :class="['live-groups', 'live-zoom-' + zoom]">
        <section v-for="g in groups" :key="g.key" class="live-group" :aria-label="g.label">
          <h2 class="ui-group-label">{{ g.label }}</h2>
          <ul class="live-list">
            <li v-for="e in g.entries" :key="e.channel.id" :data-channel-id="e.channel.id"
              :class="['live-row', { pinned: e.channel.pinned, 'is-off-air': e.channel.offAir, 'epg-drop-target': dropTargetId === String(e.channel.id), 'epg-drop-after': dropAfter && dropTargetId === String(e.channel.id), 'epg-dragging': dragPinId === String(e.channel.id) }]">
              <div class="live-row-handle" :title="e.channel.pinned ? 'Drag to reorder favourites' : null"
                @pointerdown="onPinPointerDown(e.channel, $event)"
                @pointermove="onPinPointerMove"
                @pointerup="onPinPointerUp"
                @pointercancel="onPinPointerCancel">
                <button type="button" :class="['live-star', { pinned: e.channel.pinned }]" :aria-pressed="String(Boolean(e.channel.pinned))"
                  :title="e.channel.pinned ? 'Remove from favourites' : 'Add to favourites'"
                  :aria-label="e.channel.pinned ? 'Remove ' + e.channel.name + ' from favourites' : 'Add ' + e.channel.name + ' to favourites'"
                  @click="togglePin(e.channel)"><star-icon /></button>
                <span class="live-logo"><channel-logo :channel-id="e.channel.id" :has-logo="e.channel.hasLogo" /></span>
                <span class="live-number">{{ paddedNumber(e.channel.number) }}</span>
              </div>
              <button type="button" class="live-watch" :title="e.channel.offAir ? OFF_AIR_MESSAGE : null"
                :aria-label="watchRowLabel({ channel: e.channel, now: e.now })" @click="watchLive({ channel: e.channel, nowTitle: e.now?.title || '' })">
                <span v-if="showImages" class="live-thumb">
                  <programme-image v-if="e.now" :event-id="e.now.has_image ? e.now.program_id : null"
                    :channel-id="e.channel.id" :has-logo="e.channel.hasLogo" :title="e.now.title" />
                </span>
                <span v-if="e.now" class="live-row-text">
                  <span class="live-title-line">
                    <span class="live-title">{{ e.now.title }}</span>
                    <span v-if="isRecordingChannel(e.channel.id)" class="ui-live-badge"><span class="ui-live-dot"></span>REC</span>
                  </span>
                  <span class="live-meta"><span class="live-meta-channel">{{ e.channel.name }} · </span>{{ timeLeftOf(e) }}<span v-if="e.next" class="live-meta-next"> · Next {{ e.next.title }}</span></span>
                  <span class="ui-progress is-live live-progress"><span class="ui-progress-fill" :style="{ width: onNowPercent(e.now) + '%' }"></span></span>
                </span>
                <span v-else class="live-row-text">
                  <span class="live-title-line"><span class="live-title is-quiet">No guide data</span></span>
                  <span class="live-meta">{{ e.channel.offAir ? 'Off air' : e.channel.name }}</span>
                </span>
              </button>
              <button v-if="e.next" type="button" class="live-next" :aria-label="'Show details for ' + e.next.title"
                @click="openDetails(e, e.next)">
                <span class="live-next-label">Next</span>
                <span class="live-next-title">{{ nextLabel({ next: e.next, clockText: fmtClockTz }) }}</span>
              </button>
              <button v-if="e.now" type="button" class="ui-icon-button is-plain live-row-info" :aria-label="'Programme info for ' + e.now.title"
                @click="openDetails(e, e.now)"><info-icon /></button>
              <span v-else class="live-row-info-gap" aria-hidden="true"></span>
            </li>
          </ul>
        </section>
      </div>
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
    const channelsModal = ref(false)
    let pollTimer = null
    let boundaryTimer = null

    const groups = computed(() => groupsOf({
      entries: (data.value?.entries || []).filter((entry) => matchesFilter({ entry, query: filterQ.value })),
      favouritesOnly: pinnedOnly.value,
      groupLabelOf: channelGroupLabel,
    }))

    const timeLeftOf = (e) => {
      const left = timeLeftLabel({ program: e.now, nowMs: now.value.getTime(), clockText: fmtClockTz })
      return e.channel.offAir ? `${left} · Off air` : left
    }

    const channelNumberWidth = computed(() =>
      Math.max(2, ...(data.value?.entries || []).map((e) => String(e.channel.number ?? '').length)))
    const paddedNumber = (number) => (number == null ? '' : String(number).padStart(channelNumberWidth.value, '0'))

    const favouritesHint = computed(() => pinnedOnly.value && !filterQ.value.trim())

    const emptyText = computed(() => {
      if (filterQ.value.trim()) return `No channels or shows match "${filterQ.value.trim()}".`
      return 'No channels to show. Open channel settings to unhide some.'
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

    const pinDrag = usePinDrag({ rowSelector: '.live-row.pinned', currentPins, onReorder: reorderPins, grabSelector: '.live-star, .live-logo' })

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
      data, error, tvhConfigured, filterQ, pinnedOnly, showImages, channelsModal, groups, favouritesHint, emptyText,
      paddedNumber, timeLeftOf, nextLabel, zoomLevels: LIVE_ZOOM_LEVELS, zoomLabels: LIVE_ZOOM_LABELS,
      OFF_AIR_MESSAGE, load, togglePin, onChannelPrefsSaved, openDetails, watchLive, watchRowLabel,
      zoom,
      dragPinId: pinDrag.dragPinId, dropTargetId: pinDrag.dropTargetId, dropAfter: pinDrag.dropAfter,
      onPinPointerDown: pinDrag.onPinPointerDown, onPinPointerMove: pinDrag.onPinPointerMove,
      onPinPointerUp: pinDrag.onPinPointerUp, onPinPointerCancel: pinDrag.onPinPointerCancel,
      isRecordingChannel, onNowPercent, fmtClockTz, flashText, flashKind,
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
const LIVE_ZOOM_LABELS = { s: 'Small rows', m: 'Medium rows', l: 'Large rows' }
