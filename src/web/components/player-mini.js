import { ref, computed, watch, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { PLAYER_ICON_COMPONENTS } from '/components/player-icons.js'
import { muteButtonOf } from '/player-mute.js'
import { controlsHideMsOf } from '/controls-hide.js'
import {
  isHoverPointer,
  miniControlsShownOf,
  miniMenuItemsOf,
  miniPictureClickOf,
  pictureInPictureSupportOf,
  isInPictureInPicture,
  togglePictureInPicture,
} from '/mini-player.js'
import { PHONE_LAYOUT_QUERY } from '/shared/constants.js'
import {
  MINI_SIZE_KEY,
  MINI_CARD_QUERY,
  MINI_GRIP_CORNER,
  MINI_RULE,
  miniWidthOf,
  miniWidthAfterDrag,
  miniShareOfWidth,
  miniShareAfterKey,
  miniLabelOf,
  parseMiniShare,
  miniShareToStore,
} from '/mini-resize.js'

const MiniMenuIcon = {
  components: PLAYER_ICON_COMPONENTS,
  props: { name: { type: String, required: true }, muted: Boolean },
  template: `
    <speaker-muted-icon v-if="name === 'sound' && muted" class="pl-mini-menu-icon" />
    <speaker-icon v-else-if="name === 'sound'" class="pl-mini-menu-icon" />
    <expand-arrows-icon v-else-if="name === 'expand'" class="pl-mini-menu-icon" />
    <captions-icon v-else-if="name === 'captions'" class="pl-mini-menu-icon" />
    <pop-out-icon v-else class="pl-mini-menu-icon" />
  `,
}

const readMiniShare = () => {
  try { return parseMiniShare(localStorage.getItem(MINI_SIZE_KEY)) } catch { return null }
}

const writeMiniShare = (share) => {
  try {
    const stored = miniShareToStore({ share })
    if (stored == null) localStorage.removeItem(MINI_SIZE_KEY)
    else localStorage.setItem(MINI_SIZE_KEY, stored)
  } catch {}
}

const miniShare = ref(readMiniShare())

export const PlayerMini = {
  components: { ...PLAYER_ICON_COMPONENTS, 'mini-menu-icon': MiniMenuIcon },
  props: {
    title: { type: String, default: '' },
    meta: { type: String, default: '' },
    isLive: Boolean,
    progress: { type: Number, default: 0 },
    paused: Boolean,
    pauseDisabled: Boolean,
    canPip: Boolean,
    pipActive: Boolean,
    muted: Boolean,
    hasCaptions: Boolean,
    captionsOn: Boolean,
  },
  emits: ['expand', 'toggle-pause', 'close', 'toggle-pip', 'toggle-mute', 'toggle-captions'],
  setup(props, { emit }) {
    const rootEl = ref(null)
    const moreEl = ref(null)
    const thumbEl = ref(null)
    const phone = usePhoneLayout()
    const card = useMatchQuery(MINI_CARD_QUERY)
    const viewportWidth = ref(window.innerWidth)
    const dragWidth = ref(null)
    const hovering = ref(false)
    const tapShown = ref(false)
    const focusInside = ref(false)
    const menuOpen = ref(false)
    const sheetOpen = ref(false)
    let tapTimer = null

    const sound = computed(() => muteButtonOf({ muted: props.muted }))
    const controlsShown = computed(() => miniControlsShownOf({
      hovering: hovering.value,
      tapShown: tapShown.value,
      paused: props.paused,
      menuOpen: menuOpen.value,
      focusInside: focusInside.value,
    }))
    const menuItems = computed(() => miniMenuItemsOf({
      phone: phone.value,
      hasCaptions: props.hasCaptions,
      captionsOn: props.captionsOn,
      canPip: props.canPip,
      pipActive: props.pipActive,
      muted: props.muted,
    }))

    const showForTouch = () => {
      tapShown.value = true
      clearTimeout(tapTimer)
      tapTimer = setTimeout(() => { tapShown.value = false }, controlsHideMsOf(localStorage))
    }
    const onPointerEnter = (e) => { if (isHoverPointer(e.pointerType)) hovering.value = true }
    const onPointerLeave = (e) => { if (isHoverPointer(e.pointerType)) hovering.value = false }
    const onPointerDown = (e) => { if (!isHoverPointer(e.pointerType) && tapShown.value) showForTouch() }
    const onPictureClick = () => {
      if (miniPictureClickOf({ controlsShown: controlsShown.value }) === 'expand') return emit('expand')
      showForTouch()
    }
    const syncFocus = () => {
      const active = document.activeElement
      focusInside.value = Boolean(active && rootEl.value?.contains(active) && active.matches(':focus-visible'))
    }
    const onFocusOut = () => requestAnimationFrame(syncFocus)

    const openMore = () => {
      if (phone.value) {
        sheetOpen.value = true
        requestAnimationFrame(drawThumb)
        return
      }
      menuOpen.value = !menuOpen.value
    }
    const closeMenu = ({ refocus = false } = {}) => {
      menuOpen.value = false
      if (refocus) moreEl.value?.focus()
    }
    const chooseItem = (key) => {
      menuOpen.value = false
      sheetOpen.value = false
      if (key === 'sound') return emit('toggle-mute')
      if (key === 'captions') return emit('toggle-captions')
      if (key === 'pip') return emit('toggle-pip')
      emit('expand')
    }
    const onDocumentPointerDown = (e) => {
      if (menuOpen.value && !rootEl.value?.contains(e.target)) closeMenu()
    }
    const onDocumentKeydown = (e) => {
      if (!menuOpen.value || e.key !== 'Escape') return
      e.stopImmediatePropagation()
      closeMenu({ refocus: true })
    }
    const drawThumb = () => {
      const canvas = thumbEl.value
      const video = rootEl.value?.closest('.pl-frame')?.querySelector('video')
      if (!canvas || !video?.videoWidth) return
      try { canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height) } catch {}
    }

    const shownWidth = computed(() => dragWidth.value ?? miniWidthOf({ share: miniShare.value, viewportWidth: viewportWidth.value }))
    const gripRange = computed(() => ({
      min: Math.round(MINI_RULE.min * 100),
      max: Math.round(MINI_RULE.max * 100),
      now: Math.round(miniShareOfWidth({ width: shownWidth.value, viewportWidth: viewportWidth.value }) * 100),
    }))
    const sizeChip = computed(() => (dragWidth.value == null ? '' : miniLabelOf({ width: dragWidth.value, viewportWidth: viewportWidth.value })))
    const applyWidth = () => {
      const root = document.documentElement.style
      if (!card.value || (miniShare.value == null && dragWidth.value == null)) root.removeProperty('--mini-size')
      else root.setProperty('--mini-size', `${shownWidth.value}px`)
    }
    const onViewportResize = () => { viewportWidth.value = window.innerWidth }

    let drag = null
    let dragFrame = 0
    let pendingWidth = null
    const flushDrag = () => {
      dragFrame = 0
      if (pendingWidth != null) dragWidth.value = pendingWidth
    }
    const onGripDown = (e) => {
      if (!e.isPrimary || e.button > 0) return
      e.preventDefault()
      drag = { x: e.clientX, y: e.clientY, startWidth: shownWidth.value }
      pendingWidth = null
      e.currentTarget.setPointerCapture?.(e.pointerId)
      showForTouch()
    }
    const onGripMove = (e) => {
      if (!drag || !e.isPrimary) return
      pendingWidth = miniWidthAfterDrag({
        startWidth: drag.startWidth,
        dx: e.clientX - drag.x,
        dy: e.clientY - drag.y,
        viewportWidth: viewportWidth.value,
      })
      if (!dragFrame) dragFrame = requestAnimationFrame(flushDrag)
    }
    const endDrag = () => {
      cancelAnimationFrame(dragFrame)
      dragFrame = 0
      drag = null
      dragWidth.value = null
    }
    const setShare = (share) => {
      miniShare.value = share
      writeMiniShare(share)
    }
    const finishGrip = () => {
      if (!drag) return
      if (pendingWidth != null) setShare(miniShareOfWidth({ width: pendingWidth, viewportWidth: viewportWidth.value }))
      pendingWidth = null
      endDrag()
    }
    const cancelGrip = () => {
      pendingWidth = null
      endDrag()
    }
    const resetSize = () => setShare(null)
    const onGripKeydown = (e) => {
      const action = miniShareAfterKey({ width: shownWidth.value, viewportWidth: viewportWidth.value, key: e.key })
      if (!action) return
      e.preventDefault()
      if (action.reset) return resetSize()
      setShare(action.share)
    }

    watch([shownWidth, card, miniShare], applyWidth, { immediate: true })
    watch(phone, () => {
      menuOpen.value = false
      sheetOpen.value = false
    })
    onMounted(() => {
      document.addEventListener('pointerdown', onDocumentPointerDown, true)
      window.addEventListener('keydown', onDocumentKeydown, true)
      window.addEventListener('resize', onViewportResize)
    })
    onUnmounted(() => {
      clearTimeout(tapTimer)
      cancelAnimationFrame(dragFrame)
      window.removeEventListener('resize', onViewportResize)
      document.removeEventListener('pointerdown', onDocumentPointerDown, true)
      window.removeEventListener('keydown', onDocumentKeydown, true)
    })

    return {
      card, gripRange, sizeChip, dragWidth, gripCorner: MINI_GRIP_CORNER, resetSize,
      onGripDown, onGripMove, finishGrip, cancelGrip, onGripKeydown,
      rootEl, moreEl, thumbEl, phone, sound, controlsShown, menuItems, menuOpen, sheetOpen,
      onPointerEnter, onPointerLeave, onPointerDown, onPictureClick, syncFocus, onFocusOut, openMore, chooseItem,
    }
  },
  template: `
    <div ref="rootEl" :class="['pl-mini', { 'is-controls-shown': controlsShown }]"
      @pointerenter="onPointerEnter" @pointerleave="onPointerLeave" @pointerdown.capture="onPointerDown"
      @focusin="syncFocus" @focusout="onFocusOut">
      <button type="button" class="pl-mini-expand" :aria-label="'Open full player: ' + title" @click="$emit('expand')"></button>
      <div class="pl-mini-picture" aria-hidden="true" @click="onPictureClick"><span class="pl-mini-scrim"></span></div>
      <span v-if="isLive" class="ui-live-badge pl-mini-badge"><span class="ui-live-dot" aria-hidden="true"></span>Live</span>
      <div class="pl-mini-text">
        <p class="pl-mini-title">{{ title }}</p>
        <p v-if="meta" class="pl-mini-meta">{{ meta }}</p>
      </div>
      <div class="pl-mini-actions">
        <button type="button" :class="['pl-mini-button', 'pl-mini-sound', 'is-wide-only', { 'is-on': sound.audible }]"
          :aria-pressed="String(sound.audible)" :aria-label="sound.ariaLabel" :title="sound.label" @click="$emit('toggle-mute')">
          <speaker-icon v-if="sound.audible" /><speaker-muted-icon v-else />
        </button>
        <button type="button" class="pl-mini-button pl-mini-pause" :disabled="pauseDisabled" :aria-label="paused ? 'Play' : 'Pause'"
          @click="$emit('toggle-pause')"><play-icon v-if="paused" /><pause-icon v-else /></button>
        <button ref="moreEl" type="button" :class="['pl-mini-button', 'pl-mini-more', { 'is-open': menuOpen || sheetOpen }]"
          aria-label="More" title="More" :aria-haspopup="phone ? 'dialog' : 'menu'" :aria-expanded="String(menuOpen || sheetOpen)"
          @click="openMore"><more-dots-icon /></button>
        <button type="button" class="pl-mini-button pl-mini-close" aria-label="Stop and close" @click="$emit('close')"><cross-icon /></button>
      </div>
      <div v-if="card" :class="['mv-corner-grip', 'pl-mini-grip', 'is-' + gripCorner, { 'is-active': dragWidth != null }]"
        role="separator" tabindex="0" aria-label="Resize the Miniplayer" aria-orientation="vertical"
        :aria-valuemin="gripRange.min" :aria-valuemax="gripRange.max" :aria-valuenow="gripRange.now" :aria-valuetext="gripRange.now + '% wide'"
        @pointerdown="onGripDown" @pointermove="onGripMove" @pointerup="finishGrip" @lostpointercapture="finishGrip"
        @pointercancel="cancelGrip" @dblclick="resetSize" @keydown="onGripKeydown">
        <span class="mv-resize-pill"><corner-grip-icon :corner="gripCorner" /></span>
      </div>
      <span v-if="sizeChip" class="pl-mini-size-chip" aria-hidden="true">{{ sizeChip }}</span>
      <div v-if="menuOpen" class="pl-mini-menu" role="menu" aria-label="Miniplayer options">
        <button v-for="item in menuItems" :key="item.key" type="button" class="pl-mini-menu-item"
          :role="item.key === 'captions' ? 'menuitemcheckbox' : 'menuitem'" :aria-checked="item.key === 'captions' ? String(item.on) : null"
          @click="chooseItem(item.key)">
          <mini-menu-icon :name="item.key" :muted="muted" />
          <span class="pl-mini-menu-label">{{ item.label }}</span>
          <span v-if="item.value" :class="['pl-mini-menu-value', { 'is-on': item.on }]">{{ item.value }}</span>
        </button>
      </div>
      <div :class="['ui-progress', 'pl-mini-progress', { 'is-live': isLive }]" aria-hidden="true">
        <span class="ui-progress-fill" :style="{ width: progress + '%' }"></span>
      </div>
      <ui-sheet v-if="phone" :open="sheetOpen" :title="title" :subtitle="meta" @close="sheetOpen = false">
        <template #header-lead><canvas ref="thumbEl" class="pl-mini-sheet-thumb" width="128" height="72" aria-hidden="true"></canvas></template>
        <div class="ui-group">
          <button v-for="item in menuItems" :key="item.key" type="button" class="ui-group-row pl-mini-sheet-row"
            :aria-pressed="item.key === 'sound' ? String(item.on) : null" @click="chooseItem(item.key)">
            <mini-menu-icon :name="item.key" :muted="muted" />
            <span class="ui-group-row-main"><span class="ui-group-row-title">{{ item.label }}</span></span>
            <span v-if="item.value" :class="['pl-mini-menu-value', { 'is-on': item.on }]">{{ item.value }}</span>
          </button>
        </div>
      </ui-sheet>
    </div>
  `,
}

const useMatchQuery = (queryText) => {
  const query = window.matchMedia(queryText)
  const matches = ref(query.matches)
  const sync = () => { matches.value = query.matches }
  onMounted(() => query.addEventListener('change', sync))
  onUnmounted(() => query.removeEventListener('change', sync))
  return matches
}

const usePhoneLayout = () => useMatchQuery(PHONE_LAYOUT_QUERY)

export const StartOverSheet = {
  components: PLAYER_ICON_COMPONENTS,
  props: {
    open: Boolean,
    options: { type: Array, default: () => [] },
    note: { type: String, default: '' },
  },
  emits: ['choose', 'close'],
  template: `
    <ui-sheet :open="open" title="Start over" @close="$emit('close')">
      <div class="pl-start-over">
        <button v-for="option in options" :key="option.key" type="button"
          :class="['pl-start-option', { 'is-primary': option.key === 'from-start' }]" :disabled="option.disabled"
          @click="$emit('choose', option.key)">
          <rewind-to-start-icon v-if="option.key === 'from-start'" class="pl-start-icon" />
          <clock-icon v-else class="pl-start-icon" />
          <span class="pl-start-text">
            <span class="pl-start-title">{{ option.title }}</span>
            <span class="pl-start-detail">{{ option.detail }}</span>
          </span>
        </button>
        <p v-if="note" class="pl-start-note">{{ note }}</p>
      </div>
    </ui-sheet>
  `,
}

export const usePictureInPicture = ({ videoEl }) => {
  const canPip = ref(false)
  const pipActive = ref(false)
  const syncPip = () => { pipActive.value = isInPictureInPicture({ video: videoEl.value, doc: document }) }
  const togglePip = () => togglePictureInPicture({ video: videoEl.value, doc: document }).then(syncPip, syncPip)
  onMounted(() => {
    const video = videoEl.value
    canPip.value = pictureInPictureSupportOf({ video, doc: document })
    for (const name of PIP_EVENTS) video?.addEventListener(name, syncPip)
  })
  return { canPip, pipActive, togglePip }
}

const PIP_EVENTS = ['enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged']
