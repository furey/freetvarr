import { ref, computed, nextTick, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { watchRowLabel } from '/live-info.js'
import { OFF_AIR_MESSAGE, channelGroupLabel } from '/components/channel-identity.js'
import { togglePinnedChannel } from '/components/channels-modal.js'
import { api, fetchSettings } from '/shared/api.js'
import { onNowPercent } from '/shared/format.js'
import { animateImagesToggle, viewportWithin } from '/shared/guide-images-motion.js'
import { groupsOf, matchesFilter, timeLeftLabel, nextLabel } from '/live-list.js'
import { KindFilterMenu, useKindFilter } from '/components/kind-filter-menu.js'
import { MOVIE_CHIP_TEXT, showsMovieChip } from '/kind-filter.js'
import { watchLive } from '/shared/live-session.js'
import { canEditOrderOf } from '/guide-rail.js'
import { useFavouriteOrderSave, useOrderEditing, useSortable } from '/shared/pin-drag.js'
import { SORT_PART_COMPONENTS } from '/components/sort-parts.js'
import { arrangeByOrder } from '/sortable-math.js'
import { useFlash, useMediaQuery } from '/shared/composables.js'
import { CHANNELS_SAVED_TEXT, PHONE_LAYOUT_QUERY } from '/shared/constants.js'
import { lineupOf, rememberLineup } from '/shared/channel-twins.js'
import { isRecordingChannel } from '/shared/recording-now.js'
import { storedFlag, storedChoice } from '/shared/storage.js'
import { useProgrammeSheet } from '/shared/programme-sheet-store.js'
import { now, fmtClockTz } from '/shared/time.js'
import { viewStoreOf } from '/shared/view-store.js'
import { LIVE_CACHE } from '/view-cache.js'

export const LiveView = {
  components: { ...SORT_PART_COMPONENTS, KindFilterMenu },
  template: `
    <div ref="pageEl" class="ui-page live-page">
      <page-header title="Live TV" />
      <div class="live-toolbar">
        <button type="button" class="ui-chip live-scope" :aria-pressed="String(pinnedOnly)" @click="pinnedOnly = !pinnedOnly">Favourites</button>
        <label class="live-filter" data-kind-filter-anchor>
          <search-icon />
          <input v-no-autofill v-model="filterQ" type="search" placeholder="Filter channels or shows" aria-label="Filter channels or shows"
            v-bind="kindFilter.fieldAttrs.value" @keydown="kindFilter.onKeydown" @focus="kindFilter.onFocus" @blur="kindFilter.onBlur" />
        </label>
        <toggle-switch compact class="live-images-toggle" :model-value="showImages" @update:model-value="toggleImages">Images</toggle-switch>
        <ui-segmented compact class="live-zoom" aria-label="Zoom" v-model="zoom"
          :options="zoomLevels.map((level) => ({ value: level, label: level.toUpperCase(), ariaLabel: zoomLabels[level] }))" />
        <button type="button" class="ui-icon-button live-settings" aria-label="Channel settings" title="Channel settings"
          :disabled="!data" @click="openChannelsModal"><sliders-icon /></button>
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
      <div :class="['live-groups', 'live-zoom-' + zoom, { 'live-images-off': !showImages, 'live-images-leaving': imagesLeaving }]" ref="groupsEl">
        <section v-for="g in groups" :key="g.key" class="live-group" :aria-label="g.label">
          <div class="live-group-head">
            <h2 class="ui-group-label">{{ g.label }}</h2>
            <button v-if="g.key === 'pinned' && narrow && g.entries.length >= 2" type="button" class="sort-edit-order"
              @click="openOrderEditor">Edit order</button>
            <sort-edit-toggle v-else-if="g.key === 'pinned' && canEditOrder" :on="editingOrder" @toggle="toggleOrderEditing" />
          </div>
          <ul :class="['live-list', { 'is-sortable': g.key === 'pinned' && canSort }]">
            <li v-for="(e, i) in g.entries" :key="e.channel.id" :data-channel-id="e.channel.id"
              :data-sort-id="g.key === 'pinned' && canSort ? String(e.channel.id) : null"
              :class="['live-row', { pinned: e.channel.pinned, 'is-off-air': e.channel.offAir }]">
              <button v-if="g.key === 'pinned' && !narrow" type="button" class="sort-handle live-sort-handle" data-sort-handle
                aria-roledescription="sortable" title="Drag to reorder" :inert="!canSort"
                :aria-label="'Reorder ' + e.channel.name + ', position ' + (i + 1) + ' of ' + g.entries.length + '. Press Space to pick up.'"
                @pointerdown="canSort && sort.onPointerDown(String(e.channel.id), $event)"
                @keydown="canSort && sort.onKeydown(String(e.channel.id), $event)"
                @blur="sort.onBlur(String(e.channel.id))"><sort-grip-icon /></button>
              <div class="live-row-lead">
                <button type="button" :class="['live-star', { pinned: e.channel.pinned }]" :aria-pressed="String(Boolean(e.channel.pinned))"
                  :title="e.channel.pinned ? 'Remove from favourites' : 'Add to favourites'"
                  :aria-label="e.channel.pinned ? 'Remove ' + e.channel.name + ' from favourites' : 'Add ' + e.channel.name + ' to favourites'"
                  @click="togglePin(e.channel)"><star-icon /></button>
                <span class="live-logo"><channel-logo :channel-id="e.channel.id" :has-logo="e.channel.hasLogo" /><channel-twin-tag :channel-id="e.channel.id" /></span>
                <span class="live-number">{{ paddedNumber(e.channel.number) }}</span>
              </div>
              <button type="button" class="live-watch" :title="e.channel.offAir ? OFF_AIR_MESSAGE : null"
                :aria-label="watchRowLabel({ channel: e.channel, now: e.now })" @click="watchLive({ channel: e.channel, nowTitle: e.now?.title || '' })">
                <span class="live-thumb">
                  <programme-image v-if="e.now" :event-id="e.now.has_image ? e.now.program_id : null"
                    :channel-id="e.channel.id" :has-logo="e.channel.hasLogo" :title="e.now.title" />
                </span>
                <span v-if="e.now" class="live-row-text">
                  <span class="live-title-line">
                    <span class="live-title">{{ e.now.title }}</span>
                    <span v-if="showsMovieChip(e.now)" class="channels-format programme-kind-chip">{{ MOVIE_CHIP_TEXT }}</span>
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
                <span class="live-next-line"><span class="live-next-title">{{ nextLabel({ next: e.next, clockText: fmtClockTz }) }}</span><span
                  v-if="showsMovieChip(e.next)" class="channels-format programme-kind-chip">{{ MOVIE_CHIP_TEXT }}</span></span>
              </button>
              <button v-if="e.now" type="button" class="ui-icon-button is-plain live-row-info" :aria-label="'Programme info for ' + e.now.title"
                @click="openDetails(e, e.now)"><info-icon /></button>
              <span v-else class="live-row-info-gap" aria-hidden="true"></span>
            </li>
          </ul>
        </section>
      </div>
      <sort-announcer :message="sort.announcement.value" :keyboard-active="sort.keyboardActive.value" />
      <kind-filter-menu :filter="kindFilter" />
      <teleport to="body">
      <transition name="epg-sheet">
      <channels-modal v-if="channelsModal" :channels="data?.channels || []" :hidden-ids="data?.hiddenIds || []"
        :sort="data?.sort" :hide-sd-simulcasts="data?.hideSdSimulcasts" :hide-sd-channels="data?.hideSdChannels"
        :start-mode="channelsModalMode" @close="channelsModal = false" @saved="onChannelPrefsSaved" />
      </transition>
      </teleport>
    </div>
  `,
  setup() {
    const { flash } = useFlash()
    const data = ref(liveStore.cached())
    const error = ref('')
    const tvhConfigured = ref(null)
    const filterQ = ref('')
    const pinnedOnly = storedFlag({ key: LIVE_FAVOURITES_ONLY_KEY, fallback: false })
    const showImages = storedFlag({ key: LIVE_IMAGES_KEY, fallback: true })
    const groupsEl = ref(null)
    const imagesLeaving = ref(false)
    const toggleImages = () => animateImagesToggle({
      scrollEl: groupsEl.value,
      textSelector: '.live-watch .live-row-text',
      thumbOf: (text) => text.parentElement.querySelector(':scope > .live-thumb'),
      viewOf: viewportWithin,
      stagger: 'rows',
      flip: async () => {
        showImages.value = !showImages.value
        imagesLeaving.value = !showImages.value
        await nextTick()
        return !showImages.value
      },
      settle: () => { imagesLeaving.value = false },
    })
    const zoom = storedChoice({ key: LIVE_ZOOM_KEY, options: LIVE_ZOOM_LEVELS, fallback: 'm' })
    const channelsModal = ref(false)
    const channelsModalMode = ref('channels')
    const narrow = useMediaQuery(PHONE_LAYOUT_QUERY)
    const pageEl = ref(null)
    let pollTimer = null
    let boundaryTimer = null

    const kindFilter = useKindFilter({ query: filterQ, nameLabel: (q) => `Channels or shows named “${q}”` })

    const groups = computed(() => groupsOf({
      entries: (data.value?.entries || []).filter((entry) => matchesFilter({ entry, query: filterQ.value, kind: kindFilter.activeKind.value })),
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
        const live = await api('GET', '/api/epg/now?all=1')
        data.value = live
        liveStore.keep(live)
        rememberLineup(lineupOf(live))
        error.value = ''
        scheduleBoundaryReload()
      } catch (err) {
        error.value = err.message
      }
    }

    const currentPins = () => (data.value?.channels || []).filter((c) => c.pinned).map((c) => String(c.id))

    const channelNameOf = (id) => (data.value?.channels || []).find((c) => String(c.id) === String(id))?.name || 'Channel'

    const applyPinOrder = (pins) => {
      if (!data.value) return
      data.value = {
        ...data.value,
        entries: arrangeByOrder({ items: data.value.entries || [], order: pins, idOf: (e) => String(e.channel.id) }),
        channels: arrangeByOrder({ items: data.value.channels || [], order: pins, idOf: (c) => String(c.id) }),
      }
    }

    const orderSave = useFavouriteOrderSave({ currentPins, applyOrder: applyPinOrder, reload: load })

    const sortableIds = () => (groups.value.find((g) => g.key === 'pinned')?.entries || []).map((e) => String(e.channel.id))
    const canEditOrder = computed(() => canEditOrderOf({ narrow: narrow.value, filter: filterQ.value, pinnedCount: sortableIds().length }))
    const { editing: editingOrder, sortable: canSort, toggle: toggleOrderEditing, stop: stopOrderEditing } = useOrderEditing({ canEdit: canEditOrder })
    const onKeydown = (event) => {
      if (event.key !== 'Escape' || channelsModal.value) return
      if (stopOrderEditing()) event.preventDefault()
    }

    const sort = useSortable({
      listEl: () => pageEl.value?.querySelector('.live-list.is-sortable'),
      ids: sortableIds,
      nameOf: channelNameOf,
      onDrop: orderSave.onDrop,
    })

    const openChannelsModal = () => {
      channelsModalMode.value = 'channels'
      channelsModal.value = true
    }

    const openOrderEditor = () => {
      channelsModalMode.value = 'order'
      channelsModal.value = true
    }

    const togglePin = async (channel) => {
      const pinnedIds = currentPins()
      try {
        await togglePinnedChannel({ pinnedIds, channelId: channel.id })
        await load()
      } catch (err) {
        flash({ msg: `Favourite failed: ${err.message}`, kind: 'error' })
      }
    }

    const onChannelPrefsSaved = async () => {
      channelsModal.value = false
      await load()
      flash({ msg: CHANNELS_SAVED_TEXT })
    }

    const { openProgramme } = useProgrammeSheet()
    const openDetails = (e, programme) => openProgramme({ channelId: e.channel.id, programme, channelHint: e.channel })

    const onVisibility = () => {
      if (document.visibilityState === 'visible') load()
    }

    onMounted(() => {
      load()
      pollTimer = setInterval(load, LIVE_LIST_POLL_MS)
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('keydown', onKeydown)
    })
    onUnmounted(() => {
      clearInterval(pollTimer)
      clearTimeout(boundaryTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKeydown)
    })

    return {
      data, error, tvhConfigured, filterQ, pinnedOnly, showImages, toggleImages, imagesLeaving, groupsEl, channelsModal, groups, favouritesHint, emptyText,
      paddedNumber, timeLeftOf, nextLabel, zoomLevels: LIVE_ZOOM_LEVELS, zoomLabels: LIVE_ZOOM_LABELS,
      OFF_AIR_MESSAGE, load, togglePin, onChannelPrefsSaved, openDetails, watchLive, watchRowLabel,
      zoom, pageEl, narrow, canSort, canEditOrder, editingOrder, toggleOrderEditing, sort, channelsModalMode, openChannelsModal, openOrderEditor,
      isRecordingChannel, onNowPercent, fmtClockTz, kindFilter, showsMovieChip, MOVIE_CHIP_TEXT,
    }
  },
}

const liveStore = viewStoreOf(LIVE_CACHE)
const LIVE_LIST_POLL_MS = 30_000
const LIVE_BOUNDARY_MIN_MS = 5_000
const LIVE_BOUNDARY_GRACE_MS = 2_000
const LIVE_IMAGES_KEY = 'freetvarr.liveImages'
const LIVE_FAVOURITES_ONLY_KEY = 'freetvarr.liveFavouritesOnly'
const LIVE_ZOOM_KEY = 'freetvarr.liveZoom'

const LIVE_ZOOM_LEVELS = ['s', 'm', 'l']
const LIVE_ZOOM_LABELS = { s: 'Small rows', m: 'Medium rows', l: 'Large rows' }
