import { ref, computed, watch, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { PLAYER_ICON_COMPONENTS } from '/components/player-icons.js'
import { muteButtonOf } from '/player-mute.js'
import {
  MINI_TAP_HIDE_MS,
  isHoverPointer,
  miniControlsShownOf,
  miniMenuItemsOf,
  miniPictureClickOf,
  pictureInPictureSupportOf,
  isInPictureInPicture,
  togglePictureInPicture,
} from '/mini-player.js'

const MiniMenuIcon = {
  components: PLAYER_ICON_COMPONENTS,
  props: { name: { type: String, required: true }, muted: Boolean },
  template: `
    <speaker-muted-icon v-if="name === 'sound' && muted" class="pl-mini-menu-icon" />
    <speaker-icon v-else-if="name === 'sound'" class="pl-mini-menu-icon" />
    <expand-arrows-icon v-else-if="name === 'expand'" class="pl-mini-menu-icon" />
    <captions-icon v-else-if="name === 'captions'" class="pl-mini-menu-icon" />
    <pip-icon v-else class="pl-mini-menu-icon" />
  `,
}

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
      tapTimer = setTimeout(() => { tapShown.value = false }, MINI_TAP_HIDE_MS)
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

    watch(phone, () => {
      menuOpen.value = false
      sheetOpen.value = false
    })
    onMounted(() => {
      document.addEventListener('pointerdown', onDocumentPointerDown, true)
      window.addEventListener('keydown', onDocumentKeydown, true)
    })
    onUnmounted(() => {
      clearTimeout(tapTimer)
      document.removeEventListener('pointerdown', onDocumentPointerDown, true)
      window.removeEventListener('keydown', onDocumentKeydown, true)
    })

    return {
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
      <div v-if="menuOpen" class="pl-mini-menu" role="menu" aria-label="Mini player options">
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

const PHONE_QUERY = '(max-width: 767px)'

const usePhoneLayout = () => {
  const query = window.matchMedia(PHONE_QUERY)
  const phone = ref(query.matches)
  const sync = () => { phone.value = query.matches }
  onMounted(() => query.addEventListener('change', sync))
  onUnmounted(() => query.removeEventListener('change', sync))
  return phone
}

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
