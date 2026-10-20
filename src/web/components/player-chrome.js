import { ref, computed, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { PLAYER_ICON_COMPONENTS } from '/components/player-icons.js'
import { soundToggleOf, playerMenuItemsOf } from '/player-mute.js'
import {
  topBarLayoutOf,
  optionalWidthOf,
  moreMenuKeysOf,
  ROUND_WIDTH,
  ICON_PILL_WIDTH,
  LOGO_WIDTH,
  LABELLED_PILL_WIDTHS,
  LATE_COMPACT,
} from '/player-top-actions.js'

const MENU_EVENTS = { captions: 'toggle-captions', pip: 'toggle-pip', fullscreen: 'toggle-fullscreen', info: 'toggle-info', minimise: 'minimise' }

export const PlayerTopBar = {
  components: PLAYER_ICON_COMPONENTS,
  props: {
    channelId: { type: [String, Number], default: null },
    hasLogo: Boolean,
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    backLabel: { type: String, default: 'Close' },
    infoOpen: Boolean,
    infoId: { type: String, required: true },
    hasCaptions: Boolean,
    captionsOn: Boolean,
    fullscreen: Boolean,
    canPip: Boolean,
    pipActive: Boolean,
    canMinimise: Boolean,
    muted: Boolean,
    actions: { type: Array, default: () => [] },
    hasRecord: Boolean,
  },
  emits: ['back', 'toggle-info', 'toggle-captions', 'toggle-fullscreen', 'toggle-pip', 'minimise', 'toggle-mute', 'action'],
  setup(props, { emit }) {
    const barEl = ref(null)
    const actionsEl = ref(null)
    const menuOpen = ref(false)
    const measure = ref({ barWidth: 0, frameWidth: 0, gap: 10, actionsGap: 8 })
    const sound = computed(() => soundToggleOf({ muted: props.muted }))

    const allActions = computed(() => [
      ...props.actions,
      props.canMinimise && {
        key: 'minimise', order: 2, priority: 3, icon: 'minimise-icon', label: 'Miniplayer', ariaLabel: 'Miniplayer',
        menuLabel: 'Miniplayer',
      },
      {
        key: 'info', order: 4, priority: 1, icon: 'info-icon', label: 'Info', ariaLabel: 'Programme info', menuLabel: 'Programme info',
        pressed: props.infoOpen, expanded: props.infoOpen, controls: props.infoId,
      },
    ].filter((action) => action && !action.hidden))

    const layout = computed(() => {
      const { barWidth, frameWidth, gap, actionsGap } = measure.value
      const labelled = frameWidth > PILL_LABEL_MIN_FRAME
      const optional = [...allActions.value]
        .sort((a, b) => a.priority - b.priority)
        .map((action) => ({ key: action.key, width: optionalWidthOf({ key: action.key, round: action.round, labelled }) }))
      const pinned = [
        props.hasRecord && { key: 'record', width: LABELLED_PILL_WIDTHS.record, compactWidth: ICON_PILL_WIDTH, compactAt: LATE_COMPACT },
        { key: 'sound', width: ROUND_WIDTH },
        { key: 'more', width: ROUND_WIDTH },
      ].filter(Boolean)
      if (!barWidth) return { inline: optional.map((action) => action.key), overflow: [], compact: [], showLogo: true }
      return topBarLayoutOf({
        barWidth, gap, actionsGap, logoWidth: props.channelId ? LOGO_WIDTH : 0, pinned, optional,
      })
    })

    const inlineActions = computed(() => allActions.value
      .filter((action) => layout.value.inline.includes(action.key))
      .sort((a, b) => a.order - b.order))

    const menuItems = computed(() => playerMenuItemsOf({
      overflow: moreMenuKeysOf({ overflow: layout.value.overflow })
        .map((key) => allActions.value.find((action) => action.key === key))
        .filter(Boolean)
        .map(menuItemOf),
      hasCaptions: props.hasCaptions,
      captionsOn: props.captionsOn,
      canPip: props.canPip,
      pipActive: props.pipActive,
      fullscreen: props.fullscreen,
    }))

    const chooseAction = (key) => {
      if (MENU_EVENTS[key]) return emit(MENU_EVENTS[key])
      emit('action', key)
    }
    const chooseMenuItem = (key) => {
      menuOpen.value = false
      chooseAction(key)
    }

    const readMeasure = () => {
      const bar = barEl.value
      if (!bar) return
      const barStyle = getComputedStyle(bar)
      const actionsStyle = actionsEl.value ? getComputedStyle(actionsEl.value) : null
      const padding = parseFloat(barStyle.paddingLeft) + parseFloat(barStyle.paddingRight)
      measure.value = {
        barWidth: Math.max(0, bar.clientWidth - padding),
        frameWidth: bar.clientWidth,
        gap: parseFloat(barStyle.columnGap) || 0,
        actionsGap: parseFloat(actionsStyle?.columnGap) || 0,
      }
    }

    let observer = null
    onMounted(() => {
      readMeasure()
      observer = typeof ResizeObserver === 'function' ? new ResizeObserver(readMeasure) : null
      observer?.observe(barEl.value)
    })
    onUnmounted(() => observer?.disconnect())

    return { barEl, actionsEl, menuOpen, sound, layout, inlineActions, menuItems, chooseAction, chooseMenuItem }
  },
  template: `
    <header ref="barEl" class="pl-top">
      <button type="button" class="pl-round" :aria-label="backLabel" @click="$emit('back')"><arrow-left-icon /></button>
      <span v-if="channelId && layout.showLogo" class="pl-logo"><channel-logo :channel-id="channelId" :has-logo="hasLogo" /><channel-twin-tag :channel-id="channelId" /></span>
      <div class="pl-heading">
        <h2 class="pl-title">{{ title }}</h2>
        <p v-if="subtitle" class="pl-subtitle">{{ subtitle }}</p>
      </div>
      <div ref="actionsEl" class="pl-actions">
        <template v-for="action in inlineActions" :key="action.key">
          <button v-if="action.round" type="button" class="pl-round" :aria-label="action.ariaLabel" :title="action.title || null"
            @click="chooseAction(action.key)"><component :is="action.icon" v-bind="action.iconProps || {}" /></button>
          <button v-else type="button" :class="['pl-pill', { 'is-on': action.on }]" :disabled="action.disabled || null"
            :title="action.title || null" :aria-label="action.ariaLabel"
            :aria-pressed="action.pressed == null ? null : String(action.pressed)"
            :aria-expanded="action.expanded == null ? null : String(action.expanded)" :aria-controls="action.controls || null"
            @click="chooseAction(action.key)">
            <component :is="action.icon" v-bind="action.iconProps || {}" /><span class="pl-pill-label">{{ action.label }}</span>
          </button>
        </template>
        <slot :compact="layout.compact.includes('record')" />
        <button type="button" :class="['pl-round', 'pl-sound', { 'is-muted': sound.muted }]" :aria-label="sound.ariaLabel"
          :title="sound.title" aria-keyshortcuts="m" @click="$emit('toggle-mute')">
          <speaker-muted-icon v-if="sound.muted" /><speaker-icon v-else />
        </button>
        <button type="button" class="pl-round pl-more" aria-label="More" title="More" aria-haspopup="dialog" @click="menuOpen = true"><more-dots-icon /></button>
      </div>
      <ui-sheet :open="menuOpen" title="More" @close="menuOpen = false">
        <div class="ui-group">
          <button v-for="item in menuItems" :key="item.key" type="button" class="ui-group-row pl-menu-row" :disabled="item.disabled || null"
            :title="item.title || null"
            :role="item.key === 'captions' ? 'menuitemcheckbox' : null" :aria-checked="item.key === 'captions' ? String(item.on) : null"
            @click="chooseMenuItem(item.key)">
            <component :is="item.icon" v-if="item.icon" v-bind="item.iconProps || {}" class="pl-menu-icon" />
            <span class="ui-group-row-main"><span class="ui-group-row-title">{{ item.label }}</span></span>
            <span v-if="item.value" :class="['pl-mini-menu-value', { 'is-on': item.on }]">{{ item.value }}</span>
          </button>
        </div>
      </ui-sheet>
    </header>
  `,
}

const menuItemOf = (action) => ({
  key: action.key,
  label: action.menuLabel,
  icon: action.icon,
  iconProps: action.iconProps,
  disabled: action.disabled,
  title: action.title,
  on: action.pressed ?? action.on,
  value: action.menuValue,
})

const PILL_LABEL_MIN_FRAME = 1000

export const PlayerCenterControls = {
  components: PLAYER_ICON_COMPONENTS,
  props: {
    paused: Boolean,
    pauseDisabled: Boolean,
    showStartOver: Boolean,
    startOverDisabled: Boolean,
    startOverTitle: { type: String, default: '' },
  },
  emits: ['start-over', 'toggle-pause'],
  template: `
    <div class="pl-centre">
      <div class="pl-centre-slot">
        <template v-if="showStartOver">
          <button type="button" class="pl-control" aria-label="Start over" :title="startOverTitle || null"
            :disabled="startOverDisabled" @click="$emit('start-over')"><rewind-to-start-icon /></button>
          <span class="pl-centre-label" aria-hidden="true">Start over</span>
        </template>
      </div>
      <div class="pl-centre-slot is-main">
        <button type="button" class="pl-control is-large" :disabled="pauseDisabled"
          :aria-label="paused ? 'Play' : 'Pause'" @click="$emit('toggle-pause')">
          <play-icon v-if="paused" /><pause-icon v-else />
        </button>
      </div>
      <div class="pl-centre-slot"><slot name="end" /></div>
    </div>
  `,
}

export const PlayerScrubber = {
  props: {
    min: { type: Number, default: 0 },
    max: { type: Number, required: true },
    value: { type: Number, required: true },
    step: { type: [Number, String], default: 'any' },
    fillPercent: { type: Number, default: 0 },
    bufferPercent: { type: Number, default: 100 },
    markers: { type: Array, default: () => [] },
    startText: { type: String, default: '' },
    endText: { type: String, default: '' },
    pillText: { type: String, default: '' },
    pillLive: Boolean,
    ariaLabel: { type: String, required: true },
    valueText: { type: String, default: '' },
  },
  emits: ['scrub', 'commit'],
  template: `
    <div class="pl-scrub">
      <span class="pl-time">{{ startText }}</span>
      <div class="pl-track" :style="{ '--played': fillPercent + '%' }">
        <span class="pl-track-rail"></span>
        <span class="pl-track-buffer" :style="{ width: bufferPercent + '%' }"></span>
        <span v-for="(marker, index) in markers" :key="index" class="pl-track-ad"
          :style="{ left: marker.left + '%', width: marker.width + '%' }"></span>
        <span class="pl-track-played"></span>
        <span class="pl-thumb"></span>
        <input type="range" class="pl-range" :step="step" :min="min" :max="max" :value="value"
          :aria-label="ariaLabel" :aria-valuetext="valueText || null"
          @input="$emit('scrub', Number($event.target.value))" @change="$emit('commit', Number($event.target.value))">
      </div>
      <span v-if="pillText" :class="['pl-tag', { 'is-live': pillLive }]">{{ pillText }}</span>
      <span class="pl-time is-end">{{ endText }}</span>
    </div>
  `,
}

export const PLAYER_CHROME_COMPONENTS = {
  ...PLAYER_ICON_COMPONENTS,
  'player-top-bar': PlayerTopBar,
  'player-center-controls': PlayerCenterControls,
  'player-scrubber': PlayerScrubber,
}
