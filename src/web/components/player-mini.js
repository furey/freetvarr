import { ref, computed, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { PLAYER_ICON_COMPONENTS } from '/components/player-icons.js'
import { muteButtonOf } from '/player-mute.js'
import { pictureInPictureSupportOf, isInPictureInPicture, togglePictureInPicture } from '/mini-player.js'

export const PlayerMini = {
  components: PLAYER_ICON_COMPONENTS,
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
  },
  emits: ['expand', 'toggle-pause', 'close', 'toggle-pip', 'toggle-mute'],
  setup(props) {
    return { sound: computed(() => muteButtonOf({ muted: props.muted })) }
  },
  template: `
    <div class="pl-mini">
      <button type="button" class="pl-mini-expand" :aria-label="'Open full player: ' + title" @click="$emit('expand')"></button>
      <span v-if="isLive" class="ui-live-badge pl-mini-badge"><span class="ui-live-dot" aria-hidden="true"></span>Live</span>
      <div class="pl-mini-text">
        <p class="pl-mini-title">{{ title }}</p>
        <p v-if="meta" class="pl-mini-meta">{{ meta }}</p>
      </div>
      <div class="pl-mini-actions">
        <button v-if="canPip" type="button" class="pl-mini-button pl-mini-pip is-wide-only" :aria-pressed="String(pipActive)"
          :aria-label="pipActive ? 'Leave picture in picture' : 'Picture in picture'" @click="$emit('toggle-pip')"><pip-icon /></button>
        <button type="button" class="pl-mini-button pl-mini-back is-wide-only" aria-label="Back to full player" title="Back to full player"
          @click="$emit('expand')"><exit-pip-icon /></button>
        <button type="button" :class="['pl-mini-button', 'pl-mini-sound', { 'is-on': sound.audible }]" :aria-pressed="String(sound.audible)"
          :aria-label="sound.ariaLabel" :title="sound.label" @click="$emit('toggle-mute')">
          <speaker-icon v-if="sound.audible" /><speaker-muted-icon v-else />
        </button>
        <button type="button" class="pl-mini-button pl-mini-pause" :disabled="pauseDisabled" :aria-label="paused ? 'Play' : 'Pause'"
          @click="$emit('toggle-pause')"><play-icon v-if="paused" /><pause-icon v-else /></button>
        <button type="button" class="pl-mini-button pl-mini-close" aria-label="Stop and close" @click="$emit('close')"><cross-icon /></button>
      </div>
      <div :class="['ui-progress', 'pl-mini-progress', { 'is-live': isLive }]" aria-hidden="true">
        <span class="ui-progress-fill" :style="{ width: progress + '%' }"></span>
      </div>
    </div>
  `,
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
