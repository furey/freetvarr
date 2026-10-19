import { ref, computed, watch, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { DOUBLE_TAP_MS } from '/double-tap.js'
import {
  soundButtonOf,
  shownLayoutOf,
  slotOf,
  snapCorner,
  insetBoxAt,
  clampInsetBox,
  watchingTitle,
  PICTURES,
} from '/multi-view.js'
import { pickerRowsOf, streamsLimitReached } from '/tuner-status.js'
import { PLAYER_ICON_COMPONENTS } from '/components/player-icons.js'
import { TunerCells, TunerExplainerSheet, useTunerStatusWhile, tunerMeter } from '/components/tuner-list.js'
import { api } from '/shared/api.js'
import {
  multi,
  portraitPhone,
  setCompanionVideo,
  slotClassOf,
  tapPictureSound,
  swapMultiPictures,
  makeMainPicture,
  setMultiLayout,
  setInsetCorner,
  stopWatchingPicture,
  fullScreenPicture,
} from '/shared/multi-session.js'
import { live } from '/shared/player-shared.js'
import { fmtClockTz } from '/shared/time.js'

export const MultiViewLayer = {
  components: { ...PLAYER_ICON_COMPONENTS, 'tuner-cells': TunerCells, 'tuner-explainer-sheet': TunerExplainerSheet },
  props: {
    primaryTitle: { type: String, default: '' },
    primaryMeta: { type: String, default: '' },
  },
  emits: ['change-channel', 'close'],
  template: `
    <div ref="layerEl" :class="['mv-layer', 'is-' + shownLayout]">
      <video ref="companionEl" :class="['live-video', 'pl-video', 'mv-companion', secondarySlotClass, { 'is-veiled': multi.secondary.phase !== 'live' }]"
        playsinline muted controlslist="nofullscreen"></video>
      <header class="mv-top">
        <button type="button" class="pl-round" aria-label="Stop both and close" @click="$emit('close')"><arrow-left-icon /></button>
        <h2 class="mv-title">{{ title }}</h2>
        <div v-if="!portraitPhone" class="ui-segmented mv-layouts" role="group" aria-label="Layout">
          <button type="button" class="ui-segment" aria-label="Side by side" :aria-pressed="String(multi.view.layout === 'split')" @click="setMultiLayout('split')">
            <split-layout-icon /><span class="mv-segment-label">Side by side</span>
          </button>
          <button type="button" class="ui-segment" aria-label="Big and small" :aria-pressed="String(multi.view.layout === 'inset')" @click="setMultiLayout('inset')">
            <inset-layout-icon /><span class="mv-segment-label">Big and small</span>
          </button>
        </div>
        <button type="button" class="pl-round" :aria-label="swapLabel" @click="swapMultiPictures">
          <swap-vertical-icon v-if="portraitPhone" /><swap-icon v-else />
        </button>
        <button v-if="multi.tunerLoaded && multi.tunerStatus.total" type="button" class="mv-meter"
          :aria-label="meter.text + ' in use. How tuners work'" @click="explainerOpen = true">
          <tuner-cells :cells="meter.cells" /><span class="mv-meter-text">{{ meter.text }}</span>
        </button>
      </header>
      <div v-for="picture in pictures" :key="picture.id" :class="['mv-picture', picture.slotClass, { 'is-audible': picture.sound.audible, 'is-dragging': dragging && picture.slot === 'inset' }]"
        @pointerdown="onPicturePointerDown($event, picture)" @pointermove="onPicturePointerMove" @pointerup="onPicturePointerUp($event, picture)"
        @pointercancel="cancelDrag">
        <div class="mv-picture-top">
          <span class="ui-live-badge"><span class="ui-live-dot" aria-hidden="true"></span>Live</span>
          <span class="mv-picture-actions">
            <button type="button" :class="['mv-sound', { 'is-on': picture.sound.audible }]" :aria-pressed="String(picture.sound.audible)"
              :aria-label="picture.sound.ariaLabel" @click="tapPictureSound(picture.id)">
              <speaker-icon v-if="picture.sound.audible" /><speaker-muted-icon v-else />{{ picture.sound.label }}
            </button>
            <button type="button" class="mv-more" :aria-label="'More for ' + picture.name" @click="menuFor = picture.id"><more-dots-icon /></button>
          </span>
        </div>
        <p v-if="picture.status" class="mv-picture-status" role="status">{{ picture.status }}</p>
        <div class="mv-picture-text">
          <p class="mv-picture-title">{{ picture.title }}</p>
          <p v-if="picture.meta" class="mv-picture-meta">{{ picture.meta }}</p>
        </div>
      </div>
      <footer class="mv-bottom">
        <p class="mv-hint">{{ hint }}</p>
        <p v-if="portraitPhone" class="mv-rotate"><phone-rotate-icon />Turn your phone sideways for side by side or big and small</p>
      </footer>
      <ui-sheet :open="Boolean(menuFor)" :title="menuTitle" @close="menuFor = null">
        <div class="ui-group">
          <button type="button" class="ui-group-row" @click="chooseMenu('full')"><span class="ui-group-row-main"><span class="ui-group-row-title">Full screen</span></span></button>
          <button type="button" class="ui-group-row" @click="chooseMenu('change')"><span class="ui-group-row-main"><span class="ui-group-row-title">Change channel</span></span></button>
          <button type="button" class="ui-group-row" @click="chooseMenu('stop')"><span class="ui-group-row-main"><span class="ui-group-row-title">Stop watching</span></span></button>
        </div>
      </ui-sheet>
      <tuner-explainer-sheet :open="explainerOpen" @close="explainerOpen = false" />
    </div>
  `,
  setup(props, { emit }) {
    const layerEl = ref(null)
    const companionEl = ref(null)
    const menuFor = ref(null)
    const explainerOpen = ref(false)
    const frameSize = ref({ width: 0, height: 0 })
    const secondaryAiring = ref(null)
    const dragging = ref(false)
    const dragBox = ref(null)
    let dragStart = null
    let lastInsetTapAt = 0

    useTunerStatusWhile(() => multi.active)

    const shownLayout = computed(() => shownLayoutOf({ layout: multi.view.layout, portraitPhone: portraitPhone.value }))
    const title = computed(() => watchingTitle(2))
    const meter = tunerMeter
    const secondarySlotClass = computed(() => slotClassOf('secondary'))
    const swapLabel = computed(() => (shownLayout.value === 'inset' ? 'Swap big and small' : 'Swap pictures'))

    const secondaryTitle = computed(() => secondaryAiring.value?.title || multi.secondary.channel?.name || '')
    const secondaryMeta = computed(() => {
      const end = secondaryAiring.value?.end
      return [multi.secondary.channel?.name, end ? `until ${fmtClockTz(end)}` : ''].filter(Boolean).join(' · ')
    })

    const statusOf = ({ phase, message }) => {
      if (phase === 'tuning') return 'Tuning…'
      if (phase === 'ended') return message
      return ''
    }

    const pictures = computed(() => PICTURES.map((id) => {
      const isPrimary = id === 'primary'
      const name = isPrimary ? live.channel?.name || '' : multi.secondary.channel?.name || ''
      const slot = slotOf({ state: multi.view, picture: id, portraitPhone: portraitPhone.value })
      return {
        id,
        name,
        slot,
        slotClass: `mv-slot-${slot}`,
        title: isPrimary ? props.primaryTitle : secondaryTitle.value,
        meta: isPrimary ? props.primaryMeta : secondaryMeta.value,
        status: isPrimary ? statusOf(live) : statusOf(multi.secondary),
        sound: soundButtonOf({ audible: multi.view.audible, picture: id, channelName: name }),
      }
    }))

    const hint = computed(() => {
      const sound = 'Tap Muted to hear a picture; the other mutes. Tap Sound to mute both. You hear the picture with the mint frame.'
      if (shownLayout.value === 'inset') return `${sound} Drag the small picture to any corner; double-tap it to make it the big picture.`
      return sound
    })

    const menuTitle = computed(() => pictures.value.find((p) => p.id === menuFor.value)?.name || 'Picture')

    const chooseMenu = (action) => {
      const picture = menuFor.value
      menuFor.value = null
      if (action === 'full') return fullScreenPicture(picture)
      if (action === 'stop') return stopWatchingPicture(picture)
      emit('change-channel', picture)
    }

    const insetWidth = () => (frameSize.value.width < 700 ? 220 : 340)

    const placeInset = () => {
      const { width, height } = frameSize.value
      if (shownLayout.value !== 'inset' || !width) {
        multi.insetBox = null
        return
      }
      multi.insetBox = insetBoxAt({
        corner: multi.view.insetCorner,
        frameWidth: width,
        frameHeight: height,
        insetWidth: insetWidth(),
        margin: 16,
        topReserve: height < 500 ? 56 : 72,
        bottomReserve: height < 500 ? 8 : 48,
      })
    }

    watch([shownLayout, () => multi.view.insetCorner, frameSize], placeInset, { immediate: true })

    const isInsetPicture = (picture) => picture.slot === 'inset'

    const onPicturePointerDown = (e, picture) => {
      if (!isInsetPicture(picture) || !e.isPrimary || e.target.closest('button') || !multi.insetBox) return
      dragStart = { x: e.clientX, y: e.clientY, box: { ...multi.insetBox }, moved: false }
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }

    const onPicturePointerMove = (e) => {
      if (!dragStart) return
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      if (!dragStart.moved && Math.hypot(dx, dy) < DRAG_START_PX) return
      dragStart.moved = true
      dragging.value = true
      dragBox.value = clampInsetBox({
        ...dragStart.box,
        left: dragStart.box.left + dx,
        top: dragStart.box.top + dy,
        frameWidth: frameSize.value.width,
        frameHeight: frameSize.value.height,
      })
      multi.insetBox = dragBox.value
    }

    const onPicturePointerUp = (e, picture) => {
      const start = dragStart
      dragStart = null
      if (!isInsetPicture(picture) || !start) return
      if (start.moved) return dropInset()
      if (e.target.closest('button')) return
      const tappedAt = Date.now()
      if (tappedAt - lastInsetTapAt < DOUBLE_TAP_MS) {
        lastInsetTapAt = 0
        return makeMainPicture(picture.id)
      }
      lastInsetTapAt = tappedAt
    }

    const dropInset = () => {
      const box = dragBox.value
      dragging.value = false
      dragBox.value = null
      if (!box) return
      setInsetCorner(snapCorner({
        centreX: box.left + box.width / 2,
        centreY: box.top + box.height / 2,
        width: frameSize.value.width,
        height: frameSize.value.height,
      }))
      placeInset()
    }

    const cancelDrag = () => {
      dragStart = null
      dragging.value = false
      dragBox.value = null
      placeInset()
    }

    const loadSecondaryAiring = async (channelId) => {
      secondaryAiring.value = null
      if (!channelId) return
      const params = new URLSearchParams({ channel: channelId, at: String(Date.now()) })
      const result = await api('GET', `/api/epg/channel-now?${params}`).catch(() => null)
      if (String(multi.secondary.channel?.id) === String(channelId)) secondaryAiring.value = result?.now || null
    }

    watch(() => multi.secondary.channel?.id, loadSecondaryAiring, { immediate: true })

    let resizeObserver = null
    onMounted(() => {
      setCompanionVideo(companionEl.value)
      const frame = layerEl.value?.parentElement
      if (!frame) return
      const measure = () => { frameSize.value = { width: frame.clientWidth, height: frame.clientHeight } }
      measure()
      resizeObserver = new ResizeObserver(measure)
      resizeObserver.observe(frame)
    })
    onUnmounted(() => {
      resizeObserver?.disconnect()
      multi.insetBox = null
    })

    return {
      layerEl, companionEl, multi, portraitPhone, shownLayout, title, meter, secondarySlotClass, swapLabel,
      pictures, hint, menuFor, menuTitle, chooseMenu, explainerOpen, dragging,
      onPicturePointerDown, onPicturePointerMove, onPicturePointerUp, cancelDrag,
      tapPictureSound, swapMultiPictures, setMultiLayout,
    }
  },
}

export const MultiviewSheet = {
  components: { 'tuner-cells': TunerCells, 'tuner-explainer-sheet': TunerExplainerSheet },
  props: {
    open: Boolean,
    target: { type: String, default: 'add' },
    watchingTitle: { type: String, default: '' },
  },
  emits: ['choose', 'close'],
  template: `
    <ui-sheet :open="open" :title="isAdding ? 'Multiview' : 'Change channel'" :subtitle="subtitle" @close="$emit('close')">
      <div class="mv-sheet-meter">
        <button type="button" class="mv-sheet-meter-button" :aria-label="meterText + ' How tuners work'" @click="explainerOpen = true">
          <tuner-cells :cells="meter.cells" /><span>{{ meterText }}</span>
        </button>
        <button type="button" class="mv-sheet-how" @click="explainerOpen = true">How this works</button>
      </div>
      <p v-if="!entries" class="ui-meta">Loading channels…</p>
      <template v-for="group in groups" :key="group.label">
        <section v-if="group.rows.length" class="mv-sheet-group">
          <h3 class="ui-group-label">{{ group.label }}</h3>
          <div class="ui-group">
            <button v-for="row in group.rows" :key="row.entry.channel.id" type="button" class="ui-group-row is-tall mv-channel-row"
              :disabled="row.tag.disabled" @click="$emit('choose', row.entry.channel)">
              <span class="mv-channel-tile"><channel-logo :channel-id="row.entry.channel.id" :has-logo="Boolean(row.entry.channel.hasLogo)" /></span>
              <span class="ui-group-row-main">
                <span class="ui-group-row-title">{{ row.entry.channel.name }}</span>
                <span class="ui-group-row-meta">{{ airingText(row.entry) }}</span>
                <span v-if="row.hint" class="ui-group-row-meta mv-channel-hint">{{ row.hint }}</span>
              </span>
              <span v-if="row.tag.text" :class="['mv-tag', 'is-' + row.tag.tone]">{{ row.tag.text }}</span>
            </button>
          </div>
        </section>
      </template>
      <p v-if="multi.tunerStatus.muxSharing" class="ui-meta">"No extra tuner" means the channel shares a multiplex with one already tuned, so it costs nothing extra.</p>
      <tuner-explainer-sheet :open="explainerOpen" @close="explainerOpen = false" />
    </ui-sheet>
  `,
  setup(props) {
    const entries = ref(null)
    const explainerOpen = ref(false)
    const isAdding = computed(() => props.target === 'add')

    useTunerStatusWhile(() => props.open)

    watch(() => props.open, async (open) => {
      if (!open) return
      const result = await api('GET', '/api/epg/now?all=1').catch(() => null)
      entries.value = (result?.entries || []).filter((entry) => entry.channel && !entry.channel.offAir)
    })

    const statusForTarget = computed(() => {
      const status = multi.tunerStatus
      if (isAdding.value || !status.streams) return status
      return { ...status, streams: { ...status.streams, inUse: Math.max(0, status.streams.inUse - 1) } }
    })

    const rows = computed(() => pickerRowsOf({
      entries: entries.value || [],
      status: statusForTarget.value,
      excludeIds: [live.channel?.id, multi.secondary.channel?.id].filter(Boolean),
      conflictText: (conflict) => `${conflict.title} needs a tuner at ${fmtClockTz(conflict.startsAt)}`,
    }))

    const groups = computed(() => [
      { label: 'Favourites', rows: rows.value.favourites },
      { label: 'Other channels', rows: rows.value.others },
    ])

    const meter = tunerMeter
    const meterText = computed(() => (streamsLimitReached(statusForTarget.value.streams)
      ? 'Every live stream is in use.'
      : `${meter.value.freeText} Recordings always come first.`))

    const subtitle = computed(() => (isAdding.value
      ? `Pick a second channel to watch with ${props.watchingTitle}.`
      : 'Pick a channel for this picture.'))

    const airingText = (entry) => {
      if (!entry.now) return 'No guide information'
      return `${entry.now.title} · until ${fmtClockTz(entry.now.end)}`
    }

    return { entries, explainerOpen, isAdding, groups, meter, meterText, subtitle, airingText, multi }
  },
}

const DRAG_START_PX = 6
