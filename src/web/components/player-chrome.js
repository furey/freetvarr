import { ref, computed } from '/vendor/vue.esm-browser.prod.js'
import { PLAYER_ICON_COMPONENTS } from '/components/player-icons.js'
import { muteButtonOf, playerMenuItemsOf } from '/player-mute.js'

const MENU_EVENTS = { captions: 'toggle-captions', pip: 'toggle-pip', fullscreen: 'toggle-fullscreen' }

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
  },
  emits: ['back', 'toggle-info', 'toggle-captions', 'toggle-fullscreen', 'toggle-pip', 'minimise', 'toggle-mute'],
  setup(props, { emit }) {
    const menuOpen = ref(false)
    const sound = computed(() => muteButtonOf({ muted: props.muted }))
    const menuItems = computed(() => playerMenuItemsOf({
      hasCaptions: props.hasCaptions,
      captionsOn: props.captionsOn,
      canPip: props.canPip,
      pipActive: props.pipActive,
      fullscreen: props.fullscreen,
    }))
    const chooseMenuItem = (key) => {
      menuOpen.value = false
      emit(MENU_EVENTS[key])
    }
    return { menuOpen, sound, menuItems, chooseMenuItem }
  },
  template: `
    <header class="pl-top">
      <button type="button" class="pl-round" :aria-label="backLabel" @click="$emit('back')"><arrow-left-icon /></button>
      <span v-if="channelId" class="pl-logo"><channel-logo :channel-id="channelId" :has-logo="hasLogo" /></span>
      <div class="pl-heading">
        <h2 class="pl-title">{{ title }}</h2>
        <p v-if="subtitle" class="pl-subtitle">{{ subtitle }}</p>
      </div>
      <div class="pl-actions">
        <slot name="lead" />
        <button v-if="canMinimise" type="button" class="pl-round" aria-label="Mini player" title="Mini player" @click="$emit('minimise')"><minimise-icon /></button>
        <slot name="before" />
        <button type="button" class="pl-pill" :aria-pressed="String(infoOpen)" :aria-expanded="String(infoOpen)"
          :aria-controls="infoId" aria-label="Programme info" @click="$emit('toggle-info')">
          <info-icon /><span class="pl-pill-label">Info</span>
        </button>
        <slot />
        <button type="button" :class="['pl-pill', 'is-sound', { 'is-on': sound.audible }]" :aria-pressed="String(sound.audible)"
          :aria-label="sound.ariaLabel" @click="$emit('toggle-mute')">
          <speaker-icon v-if="sound.audible" /><speaker-muted-icon v-else /><span class="pl-sound-label">{{ sound.label }}</span>
        </button>
        <button type="button" class="pl-round pl-more" aria-label="More" title="More" @click="menuOpen = true"><more-dots-icon /></button>
        <button type="button" class="pl-round pl-fullscreen" :aria-label="fullscreen ? 'Exit full screen' : 'Full screen'"
          @click="$emit('toggle-fullscreen')">
          <exit-fullscreen-icon v-if="fullscreen" /><fullscreen-icon v-else />
        </button>
      </div>
      <ui-sheet :open="menuOpen" title="More" @close="menuOpen = false">
        <div class="ui-group">
          <button v-for="item in menuItems" :key="item.key" type="button" class="ui-group-row"
            :role="item.key === 'captions' ? 'menuitemcheckbox' : null" :aria-checked="item.key === 'captions' ? String(item.on) : null"
            @click="chooseMenuItem(item.key)">
            <span class="ui-group-row-main"><span class="ui-group-row-title">{{ item.label }}</span></span>
            <span v-if="item.value" :class="['pl-mini-menu-value', { 'is-on': item.on }]">{{ item.value }}</span>
          </button>
        </div>
      </ui-sheet>
    </header>
  `,
}

export const PlayerCenterControls = {
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
      <button v-if="showStartOver" type="button" class="pl-control" aria-label="Start over" :title="startOverTitle || null"
        :disabled="startOverDisabled" @click="$emit('start-over')"><start-over-icon /></button>
      <span v-else class="pl-control-spacer" aria-hidden="true"></span>
      <button type="button" class="pl-control is-large" :disabled="pauseDisabled"
        :aria-label="paused ? 'Play' : 'Pause'" @click="$emit('toggle-pause')">
        <play-icon v-if="paused" /><pause-icon v-else />
      </button>
      <slot name="end"><span class="pl-control-spacer" aria-hidden="true"></span></slot>
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
