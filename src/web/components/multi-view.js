import { ref, reactive, computed, watch, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { DOUBLE_TAP_MS } from '/double-tap.js'
import { controlsHideMsOf, holdsControlsForFocus, isControlTarget } from '/controls-hide.js'
import {
  pictureControlsAfter,
  pictureBadgeOf,
  resumeLabelOf,
  pictureOverlayOf,
  multiHintOf,
  pictureMenuOf,
  endedActionsOf,
} from '/multi-picture.js'
import { liveEdgeOf, steadyBehindMinutesOf, percentWithin } from '/player-labels.js'
import { canRewind } from '/live-edge.js'
import {
  soundButtonOf,
  shownLayoutOf,
  slotOf,
  snapCorner,
  insetBoxAt,
  clampInsetBox,
  watchingTitle,
  tileBoxesOf,
  splitBoxesOf,
  stripShareOf,
  isStripSideways,
  slotCountOf,
  pictureLimitOf,
  mainPictureOf,
  PICTURES,
  COMPANIONS,
  SMALL_TILE_WIDTH,
} from '/multi-view.js'
import {
  SIZE_RULES,
  sizeKeyOf,
  ruleOfKey,
  clampShare,
  shareAtPosition,
  keyActionOf,
  insetGrowthOf,
  innerCornerOf,
  percentOf,
  ratioTextOf,
} from '/multi-resize.js'
import { pickerRowsOf, streamsLimitReached } from '/tuner-status.js'
import { RefreshIcon } from '/components/icons.js'
import { PLAYER_CHROME_COMPONENTS } from '/components/player-chrome.js'
import { TunerCells, TunerExplainerSheet, useTunerStatusWhile, tunerMeter } from '/components/tuner-list.js'
import { api } from '/shared/api.js'
import {
  multi,
  portraitPhone,
  compactScreen,
  canAddPicture,
  setCompanionVideo,
  slotClassOf,
  slotStyleOf,
  tapPictureSound,
  swapMultiPictures,
  makeMainPicture,
  setMultiLayout,
  setInsetCorner,
  stopWatchingPicture,
  fullScreenPicture,
  togglePicturePause,
  trackCompanions,
  seekCompanionTo,
  goLiveCompanion,
  startCompanionOver,
  pictureStateOf,
  multiSizes,
  setMultiSize,
  resetMultiSize,
} from '/shared/multi-session.js'
import { returnToLive, seekLiveTo, seekLiveAndPlay } from '/shared/live-session.js'
import { lineupOf, rememberLineup } from '/shared/channel-twins.js'
import { live } from '/shared/player-shared.js'
import { fmtClockTz, now } from '/shared/time.js'

export const MultiViewLayer = {
  components: {
    ...PLAYER_CHROME_COMPONENTS, 'tuner-cells': TunerCells, 'tuner-explainer-sheet': TunerExplainerSheet, 'refresh-icon': RefreshIcon,
  },
  props: {
    primaryTitle: { type: String, default: '' },
    primaryMeta: { type: String, default: '' },
  },
  emits: ['change-channel', 'add-channel', 'close'],
  template: `
    <div ref="layerEl" :class="['mv-layer', 'is-' + shownLayout, { 'is-resizing': resizing, 'is-handles-shown': Boolean(controlsFor) }]">
      <video v-for="id in COMPANIONS" :key="id" :ref="(el) => setCompanionVideo(id, el)"
        :class="['live-video', 'pl-video', 'mv-companion', companionSlotClass(id), {
          'is-veiled': pictureStateOf(id).phase !== 'live', 'is-unused': !multi.view.order.includes(id),
        }]"
        :style="slotStyleOf(id)" playsinline muted controlslist="nofullscreen"></video>
      <div ref="areaEl" class="mv-area" aria-hidden="true"></div>
      <header class="mv-top">
        <button type="button" class="pl-round" :aria-label="closeLabel" @click="$emit('close')"><arrow-left-icon /></button>
        <h2 class="mv-title">{{ title }}</h2>
        <div v-if="!portraitPhone || count > 2" class="ui-segmented mv-layouts" role="group" aria-label="Layout">
          <button type="button" class="ui-segment" :aria-label="splitLabel" :aria-pressed="String(multi.view.layout === 'split')" @click="setMultiLayout('split')">
            <grid-layout-icon v-if="count > 2" /><split-layout-icon v-else /><span class="mv-segment-label">{{ splitLabel }}</span>
          </button>
          <button type="button" class="ui-segment" aria-label="Big and small" :aria-pressed="String(multi.view.layout === 'inset')" @click="setMultiLayout('inset')">
            <strip-layout-icon v-if="count > 2" /><inset-layout-icon v-else /><span class="mv-segment-label">Big and small</span>
          </button>
        </div>
        <button v-if="isResized" type="button" class="mv-reset" aria-label="Reset size" @click="resetSize">
          <refresh-icon /><span class="mv-segment-label">Reset size</span>
        </button>
        <button v-if="count === 2" type="button" class="pl-round" :aria-label="swapLabel" @click="swapMultiPictures">
          <swap-vertical-icon v-if="portraitPhone" /><swap-icon v-else />
        </button>
        <button v-if="canAddPicture" type="button" class="mv-add" aria-label="Add channel" @click="$emit('add-channel')">
          <plus-icon /><span class="mv-segment-label">Add channel</span>
        </button>
        <button v-if="multi.tunerLoaded && multi.tunerStatus.total" type="button" class="mv-meter"
          :aria-label="meter.text + ' in use. How tuners work'" @click="explainerOpen = true">
          <tuner-cells :cells="meter.cells" /><span class="mv-meter-text">{{ meter.text }}</span>
        </button>
      </header>
      <div v-for="picture in pictures" :key="picture.id" :ref="(el) => setPictureEl(picture.id, el)"
        :class="['mv-picture', picture.slotClass, {
          'mv-slot-small': picture.small,
          'is-audible': picture.sound.audible, 'is-dragging': dragging && picture.slot === 'inset',
          'is-controls-shown': picture.overlay.controls, 'is-paused': picture.overlay.dim, 'is-resting': picture.overlay.resume,
        }]"
        :style="picture.style"
        @pointerdown="onPicturePointerDown($event, picture)" @pointermove="onPicturePointerMove($event, picture)"
        @pointerup="onPicturePointerUp($event, picture)" @pointerleave="onPicturePointerLeave($event, picture)"
        @pointercancel="cancelDrag" @focusin="revealFor(picture.id)">
        <span class="mv-picture-dim" aria-hidden="true"></span>
        <div class="mv-picture-top">
          <span v-if="picture.playing" :class="['mv-badge', 'is-' + picture.badge.kind]">
            <span v-if="picture.badge.kind === 'live'" class="mv-badge-dot" aria-hidden="true"></span>
            <pause-icon v-else-if="picture.badge.kind === 'paused'" />{{ picture.badge.text }}
          </span>
          <span v-else></span>
          <span class="mv-picture-actions">
            <button type="button" :class="['mv-sound', { 'is-on': picture.sound.audible }]" :aria-pressed="String(picture.sound.audible)"
              :aria-label="picture.sound.ariaLabel" @click="tapPictureSound(picture.id)">
              <speaker-icon v-if="picture.sound.audible" /><speaker-muted-icon v-else /><span class="mv-sound-label">{{ picture.sound.label }}</span>
            </button>
            <button type="button" class="mv-more" :aria-label="'More for ' + picture.name" @click="menuFor = picture.id"><more-dots-icon /></button>
          </span>
        </div>
        <div v-if="picture.status" class="mv-picture-status" role="status">
          <p class="mv-picture-status-text">{{ picture.status }}</p>
          <div v-if="picture.endedActions.length" class="mv-ended-actions">
            <button v-for="action in picture.endedActions" :key="action.key" type="button"
              :class="['btn', 'btn-sm', { 'btn-primary': action.key === 'change' }]" @click="chooseFor(picture.id, action.key)">{{ action.label }}</button>
          </div>
        </div>
        <template v-if="picture.playing">
          <player-center-controls class="mv-centre" :paused="picture.paused" :show-start-over="picture.hasBar"
            start-over-title="Start over: back to when you tuned in" @start-over="startOver(picture.id)" @toggle-pause="togglePause(picture.id)">
            <template #end>
              <span v-if="picture.edge.atEdge" class="pl-live-status"><i aria-hidden="true"></i>LIVE</span>
              <template v-else>
                <button type="button" class="pl-go-live" :aria-label="'Go live on ' + picture.name" @click="goLive(picture.id)"><go-live-icon /><span class="mv-go-live-text">Go live</span></button>
                <span class="pl-centre-label">{{ picture.edge.label }}</span>
              </template>
            </template>
          </player-center-controls>
          <div class="mv-resume">
            <button type="button" class="pl-control is-large" :aria-label="'Play ' + picture.name" tabindex="-1"
              @click="togglePause(picture.id)"><play-icon /></button>
            <span class="pl-centre-label">{{ picture.resumeLabel }}</span>
          </div>
        </template>
        <div class="mv-picture-text">
          <p class="mv-picture-title">{{ picture.title }}</p>
          <p v-if="picture.meta" class="mv-picture-meta">{{ picture.meta }}</p>
        </div>
        <div v-if="picture.playing" class="mv-picture-bottom">
          <p class="mv-picture-title">{{ picture.title }}</p>
          <player-scrubber v-if="picture.hasBar" :min="picture.from" :max="picture.to" :value="picture.position"
            :fill-percent="picture.fill" :start-text="picture.startText" :end-text="picture.endText"
            :aria-label="'Position in the live buffer for ' + picture.name"
            @scrub="onScrub(picture.id, $event)" @commit="onScrubCommit(picture.id, $event)" />
        </div>
      </div>
      <button v-if="addSlot" type="button" :class="['mv-add-slot', 'mv-slot-tile', { 'mv-slot-small': addSlot.small }]" :style="addSlot.style"
        @click="$emit('add-channel')">
        <span class="mv-add-slot-icon" aria-hidden="true"><plus-icon /></span>
        <span class="mv-add-slot-label">Add channel</span>
        <span v-if="meter.freeText" class="mv-add-slot-meta">{{ meter.freeText }}</span>
      </button>
      <div v-for="limit in limitOutlines" :key="limit.key" :class="['mv-resize-limit', 'is-' + limit.key]" :style="limit.style" aria-hidden="true">
        <span class="mv-resize-limit-label">{{ limit.label }}</span>
      </div>
      <div v-if="barHandle" :class="['mv-resizer', { 'is-active': resizing }]" :style="barHandle.style"
        role="separator" aria-orientation="vertical" tabindex="0" :aria-label="barHandle.label"
        :aria-valuemin="handleRange.min" :aria-valuemax="handleRange.max" :aria-valuenow="handleRange.now"
        @pointerdown="onResizePointerDown" @pointermove="onResizePointerMove" @pointerup="finishResize"
        @lostpointercapture="finishResize" @pointercancel="cancelResize" @dblclick="resetSize" @keydown="onResizeKeydown">
        <span class="mv-resize-pill"><resize-arrows-icon /></span>
      </div>
      <div v-if="cornerHandle" :class="['mv-corner-grip', 'is-' + cornerHandle.corner, { 'is-active': resizing }]" :style="cornerHandle.style"
        role="separator" tabindex="0" aria-label="Resize the small picture"
        :aria-valuemin="handleRange.min" :aria-valuemax="handleRange.max" :aria-valuenow="handleRange.now"
        @pointerdown="onResizePointerDown" @pointermove="onResizePointerMove" @pointerup="finishResize"
        @lostpointercapture="finishResize" @pointercancel="cancelResize" @dblclick="resetSize" @keydown="onResizeKeydown">
        <span class="mv-resize-pill"><corner-grip-icon :corner="cornerHandle.corner" /></span>
      </div>
      <span v-if="resizeChip" class="mv-resize-chip" :style="resizeChip.style" aria-hidden="true">{{ resizeChip.text }}</span>
      <footer class="mv-bottom">
        <p class="mv-hint">{{ hint }}</p>
        <p v-if="portraitPhone && count === 2" class="mv-rotate"><phone-rotate-icon />Turn your phone sideways for side by side or big and small</p>
      </footer>
      <ui-sheet :open="Boolean(menuFor)" :title="menuTitle" @close="menuFor = null">
        <div class="ui-group">
          <button v-for="item in menuItems" :key="item.key" type="button" class="ui-group-row" @click="chooseMenu(item.key)">
            <span class="ui-group-row-main"><span class="ui-group-row-title">{{ item.label }}</span></span>
          </button>
        </div>
      </ui-sheet>
      <tuner-explainer-sheet :open="explainerOpen" @close="explainerOpen = false" />
    </div>
  `,
  setup(props, { emit }) {
    const layerEl = ref(null)
    const areaEl = ref(null)
    const menuFor = ref(null)
    const explainerOpen = ref(false)
    const frameSize = ref({ width: 0, height: 0 })
    const area = ref(null)
    const airings = reactive(Object.fromEntries(COMPANIONS.map((id) => [id, null])))
    const dragging = ref(false)
    const dragBox = ref(null)
    let dragStart = null
    let lastInsetTapAt = 0

    useTunerStatusWhile(() => multi.active)

    const count = computed(() => multi.view.order.length)
    const shownLayout = computed(() => shownLayoutOf({
      layout: multi.view.layout, portraitPhone: portraitPhone.value, count: count.value,
    }))
    const isTiled = computed(() => count.value > 2)
    const title = computed(() => watchingTitle(count.value))
    const closeLabel = computed(() => (count.value > 2 ? 'Stop all and close' : 'Stop both and close'))
    const splitLabel = computed(() => (count.value > 2 ? 'Grid' : 'Side by side'))
    const meter = tunerMeter
    const swapLabel = computed(() => (shownLayout.value === 'inset' ? 'Swap big and small' : 'Swap pictures'))

    const companionSlotClass = (id) => (multi.view.order.includes(id) ? slotClassOf(id) : '')

    const companionTitleOf = (id) => airings[id]?.title || multi.companions[id].channel?.name || ''
    const companionMetaOf = (id) => {
      const end = airings[id]?.end
      return [multi.companions[id].channel?.name, end ? `until ${fmtClockTz(end)}` : ''].filter(Boolean).join(' · ')
    }

    const statusOf = ({ phase, message }) => {
      if (phase === 'tuning') return 'Tuning…'
      if (phase === 'ended') return message
      return ''
    }

    const controlsFor = ref(null)
    const scrub = ref(null)
    const behindMinutes = reactive(Object.fromEntries(PICTURES.map((id) => [id, 0])))
    const pictureEls = {}
    let hideTimer = null

    const setPictureEl = (id, el) => { pictureEls[id] = el }

    const playbackOf = (id) => {
      if (id === 'primary') {
        return {
          phase: live.phase,
          paused: live.paused || live.stuck,
          bufferSeconds: live.bufferSeconds,
          from: live.bufferFrom,
          to: live.bufferTo,
          position: live.position,
          behindSeconds: live.behindSeconds,
        }
      }
      const state = multi.companions[id]
      return {
        phase: state.phase,
        paused: state.paused,
        bufferSeconds: state.bufferSeconds,
        from: state.bufferFrom,
        to: state.bufferTo,
        position: state.position,
        behindSeconds: state.behindSeconds,
      }
    }

    const shownPositionOf = (id, playback) => (scrub.value?.picture === id ? scrub.value.value : playback.position)

    for (const id of PICTURES) {
      watch(() => {
        const playback = playbackOf(id)
        if (scrub.value?.picture !== id || playback.to == null) return playback.behindSeconds
        return playback.to - scrub.value.value
      }, (seconds) => {
        const previous = scrub.value?.picture === id ? 0 : behindMinutes[id]
        behindMinutes[id] = playbackOf(id).phase === 'live' ? steadyBehindMinutesOf({ seconds, previous }) : 0
      }, { immediate: true })
    }

    watch(now, trackCompanions)

    const slotCount = computed(() => slotCountOf({ count: count.value, canAdd: canAddPicture.value }))

    const resize = ref(null)
    const resizing = computed(() => Boolean(resize.value))
    const resizable = computed(() => !compactScreen.value
      && (shownLayout.value !== 'strip' || Boolean(area.value && isStripSideways(area.value))))
    const sizeKey = computed(() => sizeKeyOf({ layout: shownLayout.value, count: count.value, resizable: resizable.value }))
    const sizeRule = computed(() => ruleOfKey(sizeKey.value))
    const chosenShare = computed(() => {
      if (!sizeKey.value) return null
      if (resize.value?.key === sizeKey.value) return resize.value.share
      return multiSizes.value[sizeKey.value] ?? null
    })
    const isResized = computed(() => Boolean(sizeKey.value) && multiSizes.value[sizeKey.value] != null)

    const layoutBoxes = computed(() => {
      if (!area.value) return []
      if (isTiled.value) {
        const share = shownLayout.value === 'strip' ? chosenShare.value : null
        return tileBoxesOf({ layout: shownLayout.value, slots: slotCount.value, area: area.value, share })
      }
      if (shownLayout.value !== 'split') return []
      return splitBoxesOf({ area: area.value, centreY: frameSize.value.height / 2, share: chosenShare.value ?? SIZE_RULES.split.fallback })
    })

    watch([layoutBoxes, () => multi.view.order], ([boxes, order]) => {
      multi.boxes = Object.fromEntries(order.map((id, i) => [id, boxes[i]]).filter(([, box]) => box))
    }, { immediate: true })

    const isSmallSlot = (index, box) => Boolean(box) && (
      (shownLayout.value === 'strip' && index > 0) || box.width < SMALL_TILE_WIDTH)

    const addSlot = computed(() => {
      const box = isTiled.value ? layoutBoxes.value[count.value] : null
      if (!box) return null
      return { small: isSmallSlot(count.value, box), style: styleOfBox(box) }
    })

    const pictures = computed(() => multi.view.order.map((id, index) => {
      const isPrimary = id === 'primary'
      const state = pictureStateOf(id)
      const name = state.channel?.name || ''
      const slot = slotOf({ state: multi.view, picture: id, portraitPhone: portraitPhone.value })
      const playback = playbackOf(id)
      const playing = playback.phase === 'live'
      const span = playback.from == null || playback.to == null ? 0 : playback.to - playback.from
      const hasBar = playing && playback.bufferSeconds > 0 && canRewind({ span })
      const position = shownPositionOf(id, playback)
      const minutes = behindMinutes[id]
      const nowMs = now.value.getTime()
      const box = layoutBoxes.value[index]
      return {
        id,
        name,
        slot,
        slotClass: `mv-slot-${slot}`,
        small: isSmallSlot(index, box),
        style: slotStyleOf(id),
        title: isPrimary ? props.primaryTitle : companionTitleOf(id),
        meta: isPrimary ? props.primaryMeta : companionMetaOf(id),
        status: statusOf(state),
        endedActions: endedActionsOf({ multiActive: multi.active, phase: state.phase }),
        sound: soundButtonOf({ audible: multi.view.audible, picture: id, channelName: name, count: count.value }),
        playing,
        paused: playback.paused,
        overlay: pictureOverlayOf({ playing, controlsShown: controlsFor.value === id, paused: playback.paused }),
        badge: pictureBadgeOf({ paused: playback.paused, behindMinutes: minutes }),
        edge: liveEdgeOf({ behindMinutes: minutes }),
        resumeLabel: resumeLabelOf({ behindMinutes: minutes }),
        hasBar,
        from: playback.from ?? 0,
        to: playback.to ?? 0,
        position,
        fill: span ? percentWithin({ value: position, min: playback.from, max: playback.to }) : 100,
        startText: fmtClockTz(nowMs - span * 1000),
        endText: fmtClockTz(nowMs),
      }
    }))

    const hoverPointer = window.matchMedia?.('(hover: hover)')
    const hint = computed(() => multiHintOf({ layout: shownLayout.value, hover: Boolean(hoverPointer?.matches) }))

    const applyControlsEvent = (picture, event) => {
      controlsFor.value = pictureControlsAfter({ shownFor: controlsFor.value, picture, event })
      clearTimeout(hideTimer)
      if (controlsFor.value) hideTimer = setTimeout(hideIfIdle, controlsHideMsOf(localStorage))
    }

    const hideIfIdle = () => {
      const root = pictureEls[controlsFor.value]
      const busy = scrub.value || resize.value || holdsControlsForFocus({ focused: document.activeElement, root })
      if (busy) return applyControlsEvent(controlsFor.value, 'point')
      applyControlsEvent(null, 'timeout')
    }

    const revealFor = (picture) => applyControlsEvent(picture, 'point')

    const togglePause = (picture) => {
      togglePicturePause(picture)
      revealFor(picture)
    }

    const goLive = (picture) => {
      if (picture === 'primary') returnToLive()
      else goLiveCompanion(picture)
      revealFor(picture)
    }

    const startOver = (picture) => {
      if (picture === 'primary') seekLiveAndPlay(live.bufferFrom ?? 0)
      else startCompanionOver(picture)
      revealFor(picture)
    }

    const onScrub = (picture, value) => {
      scrub.value = { picture, value }
      revealFor(picture)
    }

    const onScrubCommit = (picture, value) => {
      scrub.value = null
      if (picture === 'primary') seekLiveTo(value)
      else seekCompanionTo(picture, value)
      revealFor(picture)
    }

    const onPicturePointerLeave = (e, picture) => {
      if (isHoverPointer(e) && !scrub.value) applyControlsEvent(picture.id, 'leave')
    }

    onUnmounted(() => clearTimeout(hideTimer))

    const menuTitle = computed(() => pictures.value.find((p) => p.id === menuFor.value)?.name || 'Picture')
    const menuItems = computed(() => pictureMenuOf({
      count: count.value, isMain: mainPictureOf(multi.view) === menuFor.value,
    }))

    const chooseFor = (picture, action) => {
      if (action === 'main') return makeMainPicture(picture)
      if (action === 'full') return fullScreenPicture(picture)
      if (action === 'stop') return stopWatchingPicture(picture)
      emit('change-channel', picture)
    }

    const chooseMenu = (action) => {
      const picture = menuFor.value
      menuFor.value = null
      chooseFor(picture, action)
    }

    const insetWidth = () => {
      const share = shownLayout.value === 'inset' ? chosenShare.value : null
      if (share != null) return share * frameSize.value.width
      return frameSize.value.width < 700 ? 220 : 340
    }

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

    watch([shownLayout, () => multi.view.insetCorner, frameSize, chosenShare], placeInset, { immediate: true })

    const canMakeMainByTap = (picture) => picture.slot === 'inset'
      || (picture.slot === 'tile' && shownLayout.value === 'strip' && mainPictureOf(multi.view) !== picture.id)

    const onPicturePointerDown = (e, picture) => {
      if (isControlTarget(e.target) && controlsFor.value === picture.id) revealFor(picture.id)
      if (picture.slot !== 'inset' || !e.isPrimary || isControlTarget(e.target) || !multi.insetBox) return
      dragStart = { x: e.clientX, y: e.clientY, box: { ...multi.insetBox }, moved: false }
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }

    const onPicturePointerMove = (e, picture) => {
      if (isHoverPointer(e) && !dragStart && controlsFor.value !== picture.id) revealFor(picture.id)
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
      if (start?.moved) return dropInset()
      if (isControlTarget(e.target) || !e.isPrimary) return
      if (canMakeMainByTap(picture) && isSecondTap()) return makeMainPicture(picture.id)
      applyControlsEvent(picture.id, isHoverPointer(e) ? 'point' : 'tap')
    }

    const isSecondTap = () => {
      const tappedAt = Date.now()
      const second = tappedAt - lastInsetTapAt < DOUBLE_TAP_MS
      lastInsetTapAt = second ? 0 : tappedAt
      return second
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

    const shownShare = computed(() => {
      if (!sizeKey.value) return null
      if (chosenShare.value != null) return chosenShare.value
      if (shownLayout.value === 'split') return SIZE_RULES.split.fallback
      if (shownLayout.value === 'strip') return stripShareOf(layoutBoxes.value)
      const width = frameSize.value.width
      return multi.insetBox && width ? clampShare({ rule: SIZE_RULES.inset, share: multi.insetBox.width / width }) : null
    })

    const handleRange = computed(() => ({
      min: sizeRule.value ? percentOf(sizeRule.value.min) : 0,
      max: sizeRule.value ? percentOf(sizeRule.value.max) : 100,
      now: shownShare.value == null ? 50 : percentOf(shownShare.value),
    }))

    const barHandle = computed(() => {
      if (!sizeKey.value || shownLayout.value === 'inset') return null
      const boxes = layoutBoxes.value
      const [main, next] = boxes
      if (!main || !next) return null
      const mainRight = main.left + main.width
      const top = Math.min(...boxes.map((box) => box.top))
      const bottom = Math.max(...boxes.map((box) => box.top + box.height))
      return {
        x: (mainRight + next.left) / 2,
        top,
        label: shownLayout.value === 'split' ? 'Resize the pictures' : 'Resize the main picture',
        style: { '--mv-x': `${(mainRight + next.left) / 2}px`, '--mv-y': `${top}px`, '--mv-h': `${bottom - top}px` },
      }
    })

    const cornerHandle = computed(() => {
      const box = multi.insetBox
      if (!sizeKey.value || shownLayout.value !== 'inset' || !box || dragging.value) return null
      const corner = innerCornerOf(multi.view.insetCorner)
      const [vertical, horizontal] = corner.split('-')
      const x = horizontal === 'left' ? box.left : box.left + box.width
      const y = vertical === 'top' ? box.top : box.top + box.height
      return { corner, x, y, style: { '--mv-x': `${x}px`, '--mv-y': `${y}px` } }
    })

    const resizeChip = computed(() => {
      if (!resizing.value || shownShare.value == null) return null
      const text = ratioTextOf({ layout: shownLayout.value, share: shownShare.value })
      const anchor = barHandle.value
        ? { x: barHandle.value.x, y: barHandle.value.top >= CHIP_ROOM ? barHandle.value.top - 40 : barHandle.value.top + 8 }
        : cornerChipAnchor()
      return anchor ? { text, style: { '--mv-x': `${anchor.x}px`, '--mv-y': `${anchor.y}px` } } : null
    })

    const cornerChipAnchor = () => {
      const box = multi.insetBox
      if (!box) return null
      const below = multi.view.insetCorner.startsWith('top')
      return { x: box.left + box.width / 2, y: below ? box.top + box.height + 12 : box.top - 40 }
    }

    const limitOutlines = computed(() => {
      if (!resizing.value || shownLayout.value !== 'inset' || !frameSize.value.width) return []
      const rule = SIZE_RULES.inset
      return [
        { key: 'largest', label: `Largest · ${percentOf(rule.max)}%`, share: rule.max },
        { key: 'smallest', label: `Smallest · ${percentOf(rule.min)}%`, share: rule.min },
      ].map((limit) => ({ ...limit, style: styleOfBox(insetBoxFor(limit.share)) }))
    })

    const insetBoxFor = (share) => {
      const { width, height } = frameSize.value
      return insetBoxAt({
        corner: multi.view.insetCorner,
        frameWidth: width,
        frameHeight: height,
        insetWidth: share * width,
        margin: 16,
        topReserve: height < 500 ? 56 : 72,
        bottomReserve: height < 500 ? 8 : 48,
      })
    }

    let resizeDrag = null
    let resizeFrame = 0
    let pendingShare = null

    const onResizePointerDown = (e) => {
      if (!e.isPrimary || !sizeKey.value || shownShare.value == null || e.button > 0) return
      e.preventDefault()
      resizeDrag = {
        key: sizeKey.value,
        rule: sizeRule.value,
        x: e.clientX,
        y: e.clientY,
        start: shownShare.value,
        barX: barHandle.value?.x ?? 0,
        insetWidth: multi.insetBox?.width ?? 0,
        corner: multi.view.insetCorner,
      }
      pendingShare = null
      multi.resizeFrom = { boxes: { ...multi.boxes }, inset: multi.insetBox ? { ...multi.insetBox } : null }
      e.currentTarget.setPointerCapture?.(e.pointerId)
      if (controlsFor.value) revealFor(controlsFor.value)
    }

    const onResizePointerMove = (e) => {
      if (!resizeDrag || !e.isPrimary) return
      pendingShare = shareFromPointer(e)
      if (!resizeFrame) resizeFrame = requestAnimationFrame(flushResize)
    }

    const shareFromPointer = (e) => {
      const dx = e.clientX - resizeDrag.x
      const dy = e.clientY - resizeDrag.y
      const { rule, start } = resizeDrag
      if (resizeDrag.key.startsWith('inset')) {
        const width = resizeDrag.insetWidth + insetGrowthOf({ corner: resizeDrag.corner, dx, dy })
        return clampShare({ rule, share: width / Math.max(1, frameSize.value.width) })
      }
      if (!area.value) return start
      return shareAtPosition({ rule, positionOf: barPositionAt, target: resizeDrag.barX + dx })
    }

    const barPositionAt = (share) => {
      const [main, next] = shownLayout.value === 'split'
        ? splitBoxesOf({ area: area.value, centreY: frameSize.value.height / 2, share })
        : tileBoxesOf({ layout: 'strip', slots: slotCount.value, area: area.value, share })
      return (main.left + main.width + next.left) / 2
    }

    const flushResize = () => {
      resizeFrame = 0
      if (resizeDrag && pendingShare != null) resize.value = { key: resizeDrag.key, share: pendingShare }
    }

    const finishResize = () => {
      if (!resizeDrag) return
      const { key } = resizeDrag
      cancelAnimationFrame(resizeFrame)
      resizeFrame = 0
      resizeDrag = null
      if (pendingShare != null) setMultiSize(key, pendingShare)
      pendingShare = null
      resize.value = null
      multi.resizeFrom = null
    }

    const cancelResize = () => {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = 0
      resizeDrag = null
      pendingShare = null
      resize.value = null
      multi.resizeFrom = null
    }

    const resetSize = () => {
      if (sizeKey.value) resetMultiSize(sizeKey.value)
    }

    const onResizeKeydown = (e) => {
      if (!sizeRule.value || shownShare.value == null) return
      const action = keyActionOf({ rule: sizeRule.value, share: shownShare.value, key: e.key })
      if (!action) return
      e.preventDefault()
      if (action.reset) return resetSize()
      setMultiSize(sizeKey.value, action.share)
    }

    onUnmounted(() => cancelAnimationFrame(resizeFrame))

    const loadAiring = async (id, channelId) => {
      airings[id] = null
      if (!channelId) return
      const params = new URLSearchParams({ channel: channelId, at: String(Date.now()) })
      const result = await api('GET', `/api/epg/channel-now?${params}`).catch(() => null)
      if (String(multi.companions[id].channel?.id) === String(channelId)) airings[id] = result?.now || null
    }

    for (const id of COMPANIONS) {
      watch(() => multi.companions[id].channel?.id, (channelId) => loadAiring(id, channelId), { immediate: true })
    }

    let resizeObserver = null
    onMounted(() => {
      const frame = layerEl.value?.parentElement
      if (!frame) return
      const measure = () => {
        frameSize.value = { width: frame.clientWidth, height: frame.clientHeight }
        const el = areaEl.value
        area.value = el ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : null
      }
      measure()
      resizeObserver = new ResizeObserver(measure)
      resizeObserver.observe(frame)
      if (areaEl.value) resizeObserver.observe(areaEl.value)
    })
    onUnmounted(() => {
      resizeObserver?.disconnect()
      multi.insetBox = null
      multi.boxes = {}
    })

    return {
      layerEl, areaEl, multi, portraitPhone, compactScreen, canAddPicture, shownLayout, title, closeLabel, splitLabel,
      meter, swapLabel, count, COMPANIONS, companionSlotClass, setCompanionVideo, slotStyleOf, pictureStateOf,
      pictures, addSlot, hint, menuFor, menuTitle, menuItems, chooseMenu, chooseFor, explainerOpen, dragging,
      setPictureEl, revealFor, togglePause, goLive, startOver, onScrub, onScrubCommit,
      onPicturePointerDown, onPicturePointerMove, onPicturePointerUp, onPicturePointerLeave, cancelDrag,
      tapPictureSound, swapMultiPictures, setMultiLayout, controlsFor, resizing, isResized, resetSize, barHandle, cornerHandle,
      handleRange, resizeChip, limitOutlines, onResizePointerDown, onResizePointerMove, finishResize, cancelResize, onResizeKeydown,
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
    <ui-sheet :open="open" :title="sheetTitle" :subtitle="subtitle" @close="$emit('close')">
      <div v-if="isAdding" class="mv-sheet-slots" :style="{ '--mv-slots': slots.length }" aria-hidden="true">
        <span v-for="slot in slots" :key="slot.key" :class="['mv-sheet-slot', 'is-' + slot.kind]">
          <channel-logo v-if="slot.channel" :channel-id="slot.channel.id" :has-logo="Boolean(slot.channel.hasLogo)" />
          <template v-else-if="slot.kind === 'new'"><plus-icon />New</template>
        </span>
      </div>
      <p v-if="capNote" class="ui-meta mv-sheet-cap">{{ capNote }}</p>
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
              <span class="mv-channel-tile"><channel-logo :channel-id="row.entry.channel.id" :has-logo="Boolean(row.entry.channel.hasLogo)" /><channel-twin-tag :channel-id="row.entry.channel.id" /></span>
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
    const shownPictures = computed(() => (multi.active ? multi.view.order : ['primary']))

    useTunerStatusWhile(() => props.open)

    watch(() => props.open, async (open) => {
      if (!open) return
      const result = await api('GET', '/api/epg/now?all=1').catch(() => null)
      if (result?.entries) rememberLineup(lineupOf(result))
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
      excludeIds: shownPictures.value.map((id) => pictureStateOf(id)?.channel?.id).filter(Boolean),
      conflictText: (conflict) => `${conflict.title} needs a tuner at ${fmtClockTz(conflict.startsAt)}`,
    }))

    const groups = computed(() => [
      { label: 'Favourites', rows: rows.value.favourites },
      { label: 'Other channels', rows: rows.value.others },
    ])

    const limit = computed(() => pictureLimitOf({ compact: compactScreen.value, streams: multi.tunerStatus.streams }))

    const slots = computed(() => {
      const shown = shownPictures.value.map((id) => ({ key: id, kind: 'full', channel: pictureStateOf(id)?.channel }))
      const total = Math.max(limit.value, shown.length + 1)
      return [
        ...shown,
        ...Array.from({ length: total - shown.length }, (_, i) => ({ key: `slot-${i}`, kind: i === 0 ? 'new' : 'idle', channel: null })),
      ]
    })

    const capNote = computed(() => (isAdding.value && compactScreen.value
      ? 'Phones show up to 2 pictures. On a tablet or computer you can watch up to 4.'
      : ''))

    const meter = tunerMeter
    const meterText = computed(() => (streamsLimitReached(statusForTarget.value.streams)
      ? 'Every live stream is in use.'
      : `${meter.value.freeText} Recordings always come first.`))

    const sheetTitle = computed(() => {
      if (!isAdding.value) return 'Change channel'
      return shownPictures.value.length > 1 ? 'Add channel' : 'Multiview'
    })

    const subtitle = computed(() => {
      if (!isAdding.value) return 'Pick a channel for this picture.'
      const next = shownPictures.value.length + 1
      if (next <= 2) return `Pick a second channel to watch with ${props.watchingTitle}.`
      return `Picture ${next} of ${limit.value}. Pick a channel to watch alongside.`
    })

    const airingText = (entry) => {
      if (!entry.now) return 'No guide information'
      return `${entry.now.title} · until ${fmtClockTz(entry.now.end)}`
    }

    return {
      entries, explainerOpen, isAdding, groups, meter, meterText, sheetTitle, subtitle, airingText, multi, slots, capNote,
    }
  },
}

const styleOfBox = (box) => ({
  '--mv-x': `${box.left}px`,
  '--mv-y': `${box.top}px`,
  '--mv-w': `${box.width}px`,
  '--mv-h': `${box.height}px`,
})

const isHoverPointer = (e) => e.pointerType === 'mouse'

const CHIP_ROOM = 116

const DRAG_START_PX = 6
