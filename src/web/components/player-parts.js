import { ref, onUnmounted, watch, nextTick } from '/vendor/vue.esm-browser.prod.js'

export const PlayerHeader = {
  props: {
    channelId: { type: [String, Number], default: null },
    hasLogo: Boolean,
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    closeLabel: { type: String, default: 'Close' },
  },
  emits: ['close'],
  template: `
    <header class="panel-header live-header">
      <channel-logo v-if="channelId" class="shrink-0" :channel-id="channelId" :has-logo="hasLogo" />
      <div class="flex-1 min-w-0">
        <span class="panel-title block truncate">{{ title }}</span>
        <span v-if="subtitle" class="block truncate text-xs text-ink-dim mt-1">{{ subtitle }}</span>
      </div>
      <button type="button" class="btn btn-icon" @click="$emit('close')" :aria-label="closeLabel"><cross-icon /></button>
    </header>
  `,
}

export const PlayerOverlayButtons = {
  props: {
    infoOpen: Boolean,
    infoId: { type: String, required: true },
    hasCaptions: Boolean,
    captionsOn: Boolean,
    closeLabel: { type: String, default: 'Close' },
    fullscreen: Boolean,
  },
  emits: ['toggle-info', 'toggle-captions', 'close', 'exit-fullscreen'],
  template: `
    <button type="button" :class="['btn', 'btn-icon', 'live-landscape-info', { 'is-on': infoOpen }]" @click="$emit('toggle-info')"
      aria-label="Programme info" :aria-expanded="String(infoOpen)" :aria-controls="infoId"><info-icon /></button>
    <button v-if="hasCaptions" type="button" :class="['btn', 'btn-icon', 'live-landscape-captions', { 'is-on': captionsOn }]"
      @click="$emit('toggle-captions')" :disabled="infoOpen" aria-label="Captions" :aria-pressed="String(captionsOn)"><captions-icon /></button>
    <button v-if="fullscreen" type="button" class="btn btn-icon live-landscape-close" @click="$emit('exit-fullscreen')"
      aria-label="Exit full screen"><exit-fullscreen-icon /></button>
    <button v-else type="button" class="btn btn-icon live-landscape-close" @click="$emit('close')" :aria-label="closeLabel"><cross-icon /></button>
  `,
}

export const PlayerActionRow = {
  props: {
    infoOpen: Boolean,
    infoId: { type: String, required: true },
    hasCaptions: Boolean,
    captionsOn: Boolean,
    statusText: { type: String, default: '' },
    statusKind: { type: String, default: 'info' },
  },
  emits: ['toggle-info', 'toggle-captions'],
  template: `
    <div class="epg-modal-actions player-actions flex items-center justify-between">
      <div class="player-actions-group flex flex-1 items-center min-w-0">
        <button type="button" :class="['btn', 'btn-icon', 'live-action-icon', { 'is-on': infoOpen }]" @click="$emit('toggle-info')"
          aria-label="Programme info" :aria-expanded="String(infoOpen)" :aria-controls="infoId"><info-icon /></button>
        <player-more-menu :has-captions="hasCaptions" :captions-on="captionsOn" :captions-disabled="infoOpen"
          @toggle-captions="$emit('toggle-captions')"><slot name="menu" /></player-more-menu>
        <div class="live-status player-actions-group flex items-center min-w-0">
          <button v-if="hasCaptions" type="button" :class="['btn', 'btn-icon', 'live-action-icon', 'player-wide-only', { 'is-on': captionsOn }]"
            @click="$emit('toggle-captions')" :disabled="infoOpen" aria-label="Captions" :aria-pressed="String(captionsOn)"><captions-icon /></button>
          <slot name="icons" />
          <span :class="['status-readout', 'live-status-text', statusKind]">{{ statusText }}</span>
        </div>
      </div>
      <div class="player-actions-group flex shrink-0"><slot /></div>
    </div>
  `,
}

export const PlayerMoreMenu = {
  props: {
    hasCaptions: Boolean,
    captionsOn: Boolean,
    captionsDisabled: Boolean,
  },
  emits: ['toggle-captions'],
  setup() {
    const open = ref(false)
    const rootEl = ref(null)
    const triggerEl = ref(null)
    const menuItems = () => [...(rootEl.value?.querySelectorAll('[role^="menuitem"]:not(:disabled)') || [])]

    const close = ({ refocus = false } = {}) => {
      open.value = false
      if (refocus) triggerEl.value?.focus()
    }

    const toggle = () => { open.value = !open.value }

    const moveFocus = (step) => {
      const items = menuItems()
      if (!items.length) return
      const at = items.indexOf(document.activeElement)
      items[(at + step + items.length) % items.length].focus()
    }

    const onOutsidePointerDown = (e) => {
      if (rootEl.value?.contains(e.target)) return
      e.stopPropagation()
      close()
    }

    const onMenuKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        return close({ refocus: true })
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        moveFocus(e.key === 'ArrowDown' ? 1 : -1)
      }
    }

    const onMenuClick = (e) => {
      if (e.target.closest('[role^="menuitem"]')) close()
    }

    const listen = (isOpen) => {
      const method = isOpen ? 'addEventListener' : 'removeEventListener'
      window[method]('pointerdown', onOutsidePointerDown, true)
      window[method]('keydown', onMenuKeydown, true)
    }

    watch(open, async (isOpen) => {
      listen(isOpen)
      if (!isOpen) return
      await nextTick()
      menuItems()[0]?.focus()
    })
    onUnmounted(() => listen(false))

    return { open, rootEl, triggerEl, toggle, onMenuClick }
  },
  template: `
    <div ref="rootEl" class="player-more">
      <button ref="triggerEl" type="button" :class="['btn', 'btn-icon', 'live-action-icon', { 'is-on': open }]" @click="toggle"
        aria-label="More" aria-haspopup="menu" :aria-expanded="String(open)"><more-icon /></button>
      <div v-if="open" class="player-menu" role="menu" aria-label="More" @click="onMenuClick">
        <button v-if="hasCaptions" type="button" class="player-menu-item" role="menuitemcheckbox" :aria-checked="String(captionsOn)"
          :disabled="captionsDisabled" @click="$emit('toggle-captions')">
          <captions-icon /> <span class="flex-1">CAPTIONS</span> <span class="player-menu-state">{{ captionsOn ? 'ON' : 'OFF' }}</span>
        </button>
        <slot />
      </div>
    </div>
  `,
}

export const PlayerInfoPanel = {
  props: {
    open: Boolean,
    panelId: { type: String, required: true },
  },
  template: `
    <transition name="live-info">
    <section v-if="open" :id="panelId" class="live-info" role="region" aria-label="Programme info">
      <div class="live-info-body">
        <slot name="image" />
        <div class="live-info-text"><slot /></div>
      </div>
    </section>
    </transition>
  `,
}
