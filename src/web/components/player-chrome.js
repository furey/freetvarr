import { ref, computed, watch, nextTick, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { PLAYER_ICON_COMPONENTS } from '/components/player-icons.js'
import { soundToggleOf, playerMenuItemsOf, baseRowButtonsOf, NO_CAPTIONS_ON_CHANNEL } from '/player-mute.js'
import { marqueePlanOf, marqueeKeepsGoing, marqueeTextChangeOf } from '/marquee.js'
import { scrubPillShownOf } from '/player-labels.js'
import {
  topBarActionsOf,
  topBarLayoutOf,
  miniplayerFitsBaseRowOf,
  optionalWidthOf,
  moreMenuKeysOf,
  ROUND_WIDTH,
  ICON_PILL_WIDTH,
  LOGO_WIDTH,
  LABELLED_PILL_WIDTHS,
  LATE_COMPACT,
} from '/player-top-actions.js'

const MENU_EVENTS = { pip: 'toggle-pip', minimise: 'minimise' }

export const PlayerTopBar = {
  components: PLAYER_ICON_COMPONENTS,
  props: {
    channelId: { type: [String, Number], default: null },
    hasLogo: Boolean,
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    backLabel: { type: String, default: 'Close' },
    canPip: Boolean,
    pipActive: Boolean,
    canMinimise: Boolean,
    muted: Boolean,
    actions: { type: Array, default: () => [] },
    hasRecord: Boolean,
    prePlay: Boolean,
  },
  emits: ['back', 'toggle-pip', 'minimise', 'toggle-mute', 'action'],
  setup(props, { emit }) {
    const barEl = ref(null)
    const actionsEl = ref(null)
    const menuOpen = ref(false)
    const measure = ref({ barWidth: 0, frameWidth: 0, gap: 10, actionsGap: 8 })
    const sound = computed(() => soundToggleOf({ muted: props.muted }))

    const allActions = computed(() => topBarActionsOf({ actions: props.actions, prePlay: props.prePlay }))

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
      canMinimise: props.canMinimise && !props.prePlay,
      canPip: props.canPip && !props.prePlay,
      pipActive: props.pipActive,
    }))
    const hasMenu = computed(() => menuItems.value.length > 0)
    watch(hasMenu, (shown) => {
      if (!shown) menuOpen.value = false
    })

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

    return { barEl, actionsEl, menuOpen, sound, layout, inlineActions, menuItems, hasMenu, chooseAction, chooseMenuItem }
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
          <button v-if="action.round" type="button" :class="['pl-round', { 'is-on': action.on }]" :aria-label="action.ariaLabel"
            :title="action.title || null" @click="chooseAction(action.key)"><component :is="action.icon" v-bind="action.iconProps || {}" /></button>
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
        <button v-if="hasMenu" type="button" class="pl-round pl-more" aria-label="More" title="More" aria-haspopup="dialog" @click="menuOpen = true"><more-glyph /></button>
      </div>
      <ui-sheet :open="menuOpen" title="More" @close="menuOpen = false">
        <div class="ui-group">
          <button v-for="item in menuItems" :key="item.key" type="button" class="ui-group-row pl-menu-row" :disabled="item.disabled || null"
            :title="item.title || null" @click="chooseMenuItem(item.key)">
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

const PILL_LABEL_MIN_FRAME = 1150

export const PlayerOnTv = {
  components: PLAYER_ICON_COMPONENTS,
  props: {
    art: { type: String, default: null },
    showStatus: Boolean,
    detail: { type: String, default: 'AirPlay' },
    hint: { type: String, default: '' },
  },
  emits: ['choose-screen'],
  setup(props) {
    const artFailed = ref(false)
    watch(() => props.art, () => { artFailed.value = false })
    return { artFailed }
  },
  template: `
    <div class="pl-airplay" aria-hidden="true">
      <img v-if="art && !artFailed" class="pl-airplay-art" :src="art" alt="" decoding="async" @error="artFailed = true">
    </div>
    <div v-if="showStatus" class="pl-airplay-status">
      <div class="pl-airplay-message" role="status">
        <airplay-icon />
        <p class="pl-airplay-title">Playing on your TV</p>
        <p class="pl-airplay-detail">{{ detail }}</p>
      </div>
      <p v-if="hint" class="pl-airplay-hint">{{ hint }}</p>
      <button type="button" class="pl-pill pl-airplay-back" @click="$emit('choose-screen')">
        <phone-icon />Watch on iPhone
      </button>
    </div>
  `,
}

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
    edgePercent: { type: Number, default: null },
    growing: Boolean,
    startText: { type: String, default: '' },
    endText: { type: String, default: '' },
    pillText: { type: String, default: '' },
    pillLive: Boolean,
    ariaLabel: { type: String, required: true },
    valueText: { type: String, default: '' },
  },
  emits: ['scrub', 'commit'],
  setup(props) {
    const scrubEl = ref(null)
    const scrubWidth = useElementWidth(scrubEl)
    const pillShown = computed(() => Boolean(props.pillText) && scrubPillShownOf({ scrubWidth: scrubWidth.value }))
    return { scrubEl, pillShown }
  },
  template: `
    <div ref="scrubEl" :class="['pl-scrub', { 'is-growing': growing }]">
      <span class="pl-time">{{ startText }}</span>
      <div class="pl-track" :style="{ '--played': fillPercent + '%' }">
        <span class="pl-track-rail"></span>
        <span class="pl-track-buffer" :style="{ width: bufferPercent + '%' }"></span>
        <span v-for="(marker, index) in markers" :key="index" class="pl-track-ad"
          :style="{ left: marker.left + '%', width: marker.width + '%' }"></span>
        <span class="pl-track-played"></span>
        <span v-if="edgePercent != null" class="pl-track-edge" :style="{ left: edgePercent + '%' }"></span>
        <span class="pl-thumb"></span>
        <input type="range" class="pl-range" :step="step" :min="min" :max="max" :value="value"
          :aria-label="ariaLabel" :aria-valuetext="valueText || null"
          @input="$emit('scrub', Number($event.target.value))" @change="$emit('commit', Number($event.target.value))">
      </div>
      <span class="pl-time is-end">{{ endText }}</span>
      <span v-if="pillShown" :class="['pl-tag', { 'is-live': pillLive }]">{{ pillText }}</span>
    </div>
  `,
}

export const PlayerBaseRow = {
  components: PLAYER_ICON_COMPONENTS,
  props: {
    episode: { type: String, default: '' },
    summary: { type: String, default: '' },
    showSummary: Boolean,
    showActions: Boolean,
    animate: Boolean,
    hasCaptions: Boolean,
    captionsOn: Boolean,
    noCaptionsTitle: { type: String, default: NO_CAPTIONS_ON_CHANNEL },
    infoOpen: Boolean,
    infoId: { type: String, required: true },
    fullscreen: Boolean,
    canMinimise: Boolean,
  },
  emits: ['toggle-captions', 'toggle-info', 'toggle-fullscreen', 'minimise', 'minimise-placement'],
  setup(props, { emit }) {
    const rowEl = ref(null)
    const rowWidth = useElementWidth(rowEl)
    const miniInRow = computed(() => props.canMinimise && props.showActions
      && miniplayerFitsBaseRowOf({ rowWidth: rowWidth.value }))
    watch(miniInRow, (inRow) => emit('minimise-placement', inRow), { immediate: true })
    onUnmounted(() => emit('minimise-placement', false))
    const actionsEl = ref(null)
    usePlayerWidthVariable({ insideEl: rowEl, width: useElementWidth(actionsEl), name: BASE_ACTIONS_WIDTH_VARIABLE })
    const lineEl = ref(null)
    const textEl = ref(null)
    const buttons = computed(() => baseRowButtonsOf({
      hasCaptions: props.hasCaptions,
      captionsOn: props.captionsOn,
      infoOpen: props.infoOpen,
      fullscreen: props.fullscreen,
      noCaptionsTitle: props.noCaptionsTitle,
    }))
    const { stage: marqueeStage, shown: marqueeText } = useMarquee({
      boxEl: lineEl,
      textEl,
      text: computed(() => (props.showSummary ? props.summary : '')),
      active: computed(() => props.animate && props.showSummary),
    })
    return { rowEl, actionsEl, miniInRow, lineEl, textEl, buttons, marqueeStage, marqueeText }
  },
  template: `
    <div ref="rowEl" class="pl-base">
      <transition name="pl-reveal">
      <div v-if="showSummary" class="pl-base-summary">
        <span v-if="episode" class="pl-base-line is-episode">{{ episode }}</span>
        <span v-if="summary" ref="lineEl" :class="['pl-base-line', 'pl-marquee', 'is-' + marqueeStage]"><span ref="textEl" class="pl-marquee-text">{{ marqueeText || summary }}</span></span>
      </div>
      </transition>
      <div v-if="showActions" ref="actionsEl" class="pl-base-actions">
        <button type="button" class="pl-round" aria-label="Programme info" aria-keyshortcuts="i" :title="buttons.info.title"
          :aria-expanded="String(buttons.info.expanded)" :aria-controls="infoId"
          @click="$emit('toggle-info')"><info-icon /></button>
        <button type="button" class="pl-round" aria-label="Captions" aria-keyshortcuts="c" :title="buttons.captions.title"
          :aria-disabled="buttons.captions.disabled ? 'true' : null" :aria-pressed="String(buttons.captions.pressed)"
          @click="buttons.captions.disabled || $emit('toggle-captions')"><captions-icon /></button>
        <button v-if="miniInRow" type="button" class="pl-round" aria-label="Miniplayer" title="Miniplayer"
          @click="$emit('minimise')"><minimise-icon /></button>
        <button type="button" class="pl-round" :aria-label="buttons.fullscreen.ariaLabel" aria-keyshortcuts="f"
          :title="buttons.fullscreen.title" @click="$emit('toggle-fullscreen')"><component :is="buttons.fullscreen.icon" /></button>
      </div>
    </div>
  `,
}

const BASE_ACTIONS_WIDTH_VARIABLE = '--pl-base-actions-width'

const usePlayerWidthVariable = ({ insideEl, width, name }) => {
  let player = null
  watch([insideEl, width], ([element, px]) => {
    player = element?.closest('.pl-backdrop') ?? player
    if (player && px > 0) player.style.setProperty(name, `${px}px`)
  }, { flush: 'post', immediate: true })
  onUnmounted(() => player?.style.removeProperty(name))
}

const useElementWidth = (el) => {
  const width = ref(0)
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(([entry]) => { width.value = Math.round(entry.contentRect.width) })
    : null
  watch(el, (element, previous) => {
    if (previous) observer?.unobserve(previous)
    if (element) observer?.observe(element)
  }, { flush: 'post', immediate: true })
  onUnmounted(() => observer?.disconnect())
  return width
}

const useMarquee = ({ boxEl, textEl, text, active }) => {
  const stage = ref('rest')
  const shown = ref(text.value)
  const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
  const animations = new Set()
  let run = 0
  let running = false
  let pending = null
  let timer = null
  let boxWidth = 0
  let observer = null
  let ruler = null

  const clearAnimations = () => {
    animations.forEach((animation) => animation.cancel())
    animations.clear()
  }

  const stop = () => {
    run += 1
    running = false
    clearTimeout(timer)
    clearAnimations()
    stage.value = 'rest'
  }

  const pause = (ms, id) => new Promise((resolve) => {
    timer = setTimeout(() => resolve(id === run), ms)
  })

  const play = async (el, keyframes, options, id) => {
    const animation = el.animate(keyframes, { ...options, fill: 'forwards' })
    animations.add(animation)
    await animation.finished.catch(() => {})
    return id === run
  }

  const planNow = () => {
    const box = boxEl.value
    if (!box || !textEl.value) return null
    boxWidth = box.clientWidth
    return marqueePlanOf({ contentWidth: box.scrollWidth, boxWidth, reducedMotion: Boolean(motion?.matches) })
  }

  const applyPending = async (id) => {
    shown.value = pending
    pending = null
    await nextTick()
    return id === run
  }

  const cycle = async (plan, id, cyclesDone) => {
    running = true
    if (!(await pause(plan.holdMs, id))) return
    stage.value = 'moving'
    const shift = [{ transform: 'translateX(0)' }, { transform: `translateX(${-plan.shiftPx}px)` }]
    if (!(await play(textEl.value, shift, { duration: plan.scrollMs, easing: 'linear' }, id))) return
    stage.value = 'end'
    if (!(await pause(plan.holdMs, id))) return
    if (!(await play(boxEl.value, [{ opacity: 1 }, { opacity: 0 }], { duration: plan.fadeMs }, id))) return
    clearAnimations()
    stage.value = 'rest'
    const textChanged = pending !== null
    if (textChanged && !(await applyPending(id))) return
    const next = textChanged ? planNow() : plan
    const done = textChanged ? 0 : cyclesDone + 1
    if (!(await play(boxEl.value, [{ opacity: 0 }, { opacity: 1 }], { duration: plan.fadeMs }, id))) return
    clearAnimations()
    if (!next || !marqueeKeepsGoing({ cyclesDone: done })) {
      running = false
      return
    }
    cycle(next, id, done)
  }

  const start = () => {
    stop()
    if (pending !== null) shown.value = pending
    pending = null
    if (!active.value || document.visibilityState === 'hidden') return
    const plan = planNow()
    if (plan) cycle(plan, run, 0)
  }

  const textWidthOf = (value) => {
    ruler ??= document.createElement('canvas').getContext('2d')
    if (!ruler || !boxEl.value) return 0
    ruler.font = getComputedStyle(boxEl.value).font
    return ruler.measureText(value).width
  }

  const onTextChange = (value) => {
    const timing = marqueeTextChangeOf({ running, contentWidth: running ? textWidthOf(value) : 0, boxWidth })
    if (timing === 'at-reset') {
      pending = value
      return
    }
    pending = null
    shown.value = value
    nextTick(start)
  }

  const onResize = () => {
    if (boxEl.value && boxEl.value.clientWidth !== boxWidth) start()
  }
  const onVisibility = () => (document.visibilityState === 'hidden' ? stop() : start())

  watch(text, onTextChange)

  watch([active, boxEl], () => {
    observer?.disconnect()
    if (boxEl.value) observer?.observe(boxEl.value)
    nextTick(start)
  })

  onMounted(() => {
    observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null
    if (boxEl.value) observer?.observe(boxEl.value)
    document.addEventListener('visibilitychange', onVisibility)
    motion?.addEventListener?.('change', start)
    document.fonts?.ready.then(start)
    start()
  })
  onUnmounted(() => {
    stop()
    observer?.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    motion?.removeEventListener?.('change', start)
  })

  return { stage, shown }
}

export const MarqueeText = {
  props: {
    text: { type: String, default: '' },
    active: Boolean,
  },
  setup(props) {
    const boxEl = ref(null)
    const textEl = ref(null)
    const { stage } = useMarquee({
      boxEl,
      textEl,
      text: computed(() => props.text),
      active: computed(() => props.active),
    })
    return { boxEl, textEl, stage }
  },
  template: `
    <span ref="boxEl" :class="['pl-marquee', 'pl-marquee-line', 'is-' + stage]"><span ref="textEl" class="pl-marquee-text"><slot /></span></span>
  `,
}

export const PLAYER_CHROME_COMPONENTS = {
  ...PLAYER_ICON_COMPONENTS,
  'player-top-bar': PlayerTopBar,
  'player-center-controls': PlayerCenterControls,
  'player-on-tv': PlayerOnTv,
  'player-scrubber': PlayerScrubber,
  'player-base-row': PlayerBaseRow,
  'marquee-text': MarqueeText,
}
