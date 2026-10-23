import { ref, computed } from '/vendor/vue.esm-browser.prod.js'
import {
  badgeOf,
  cardLabelOf,
  cardMetaOf,
  cardRatingOf,
  liveProgressOf,
  menuMetaOf,
  menuOf,
  reasonOf,
  whyRowsOf,
} from '/for-you.js'
import { useLongPress } from '/shared/long-press.js'
import { now, tz } from '/shared/time.js'

export const ForYouIcon = {
  props: { name: { type: String, required: true } },
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round" aria-hidden="true" class="for-you-icon">
      <component v-for="(shape, i) in shapes" :key="i" :is="shape.tag" v-bind="shape.attrs" />
    </svg>
  `,
  setup(props) {
    return { shapes: computed(() => FOR_YOU_ICONS[props.name] || []) }
  },
}

export const ForYouCard = {
  components: { ForYouIcon },
  props: {
    item: { type: Object, required: true },
    shape: { type: String, default: 'card' },
    scheduled: Boolean,
    withLead: Boolean,
  },
  emits: ['open', 'menu'],
  template: `
    <div :class="['for-you-card', shape === 'poster' ? 'ui-poster' : 'ui-card']" @contextmenu="onContextMenu">
      <button type="button" class="for-you-card-hit" :aria-label="label" @click="onClick"
        @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerEnd" @pointercancel="onPointerEnd"
        @pointerleave="onPointerEnd">
        <title-art :title="item.title" :src="item.image || ''" :shape="shape">
          <span v-if="badge" :class="['ui-art-badge', 'for-you-badge', 'is-' + badge.tone]">
            <span v-if="badge.tone !== 'plain'" class="for-you-badge-dot" aria-hidden="true"></span>{{ badge.label }}
          </span>
          <span v-if="progress != null" class="ui-art-bar ui-progress is-live" aria-hidden="true">
            <span class="ui-progress-fill" :style="{ width: progress + '%' }"></span>
          </span>
        </title-art>
        <span class="home-on-now-text">
          <span v-if="showsLogo" class="home-on-now-logo"><channel-logo :channel-id="item.channelId" has-logo /><channel-twin-tag :channel-id="item.channelId" /></span>
          <span class="home-on-now-lines">
            <span class="ui-card-title">{{ item.title }}</span>
            <span v-if="rating" class="for-you-rating">
              <svg class="for-you-rating-star" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1.25l2.03 4.3 4.72.58-3.47 3.25.9 4.67L8 11.75l-4.18 2.3.9-4.67L1.25 6.13l4.72-.58z"/>
              </svg>{{ rating.label }}
            </span>
            <span class="ui-card-meta">{{ meta }}</span>
            <span v-if="reason" class="for-you-reason">{{ reason }}</span>
          </span>
        </span>
      </button>
      <button type="button" class="for-you-more" :aria-label="'More for ' + item.title" aria-haspopup="dialog" @click="$emit('menu', item)">
        <more-glyph />
      </button>
    </div>
  `,
  setup(props, { emit }) {
    const nowMs = computed(() => now.value.getTime())
    const badge = computed(() => badgeOf({ item: props.item, scheduled: props.scheduled }))
    const meta = computed(() => cardMetaOf({ item: props.item, nowMs: nowMs.value, timeZone: tz.value, withLead: props.withLead }))
    const reason = computed(() => reasonOf(props.item))
    const rating = computed(() => cardRatingOf(props.item))
    const progress = computed(() => liveProgressOf({ item: props.item, nowMs: nowMs.value }))
    const label = computed(() => cardLabelOf({ item: props.item, meta: meta.value, reason: reason.value, badge: badge.value, rating: rating.value }))
    const showsLogo = computed(() => props.shape !== 'poster' && props.item.channelId != null)
    const { onPointerDown, onPointerMove, onPointerEnd, onContextMenu } = useLongPress(() => emit('menu', props.item))
    const onClick = () => emit('open', props.item)

    return { badge, meta, reason, rating, progress, label, showsLogo, onClick, onPointerDown, onPointerMove, onPointerEnd, onContextMenu }
  },
}

export const ForYouRows = {
  components: { ForYouCard },
  props: {
    rows: { type: Array, required: true },
    ctl: { type: Object, required: true },
    withLead: Boolean,
  },
  template: `
    <div class="for-you-rows">
      <div v-for="row in rows" :key="row.shape" :class="['ui-scroller', 'for-you-scroller', 'is-' + row.shape]">
        <for-you-card v-for="item in row.items" :key="item.id" :item="item" :shape="row.shape"
          :scheduled="ctl.isScheduled(item)" :with-lead="withLead" @open="ctl.openItem" @menu="ctl.openMenu" />
      </div>
    </div>
  `,
}

export const ForYouOverlays = {
  components: { ForYouIcon },
  props: { ctl: { type: Object, required: true } },
  template: `
    <ui-sheet :open="Boolean(menuItem)" :title="menuItem?.title || ''" :subtitle="menuMeta" @close="ctl.closeMenu()">
      <template #header-lead>
        <span v-if="menuItem?.image && !failedArt[menuItem.image]" class="library-menu-art is-wide" aria-hidden="true">
          <img :src="menuItem.image" alt="" @error="markFailed(menuItem.image)" />
        </span>
      </template>
      <div v-if="menuItem" class="library-menu for-you-menu">
        <p v-if="menuReason" class="for-you-menu-reason">{{ menuReason }}</p>
        <div class="ui-group library-menu-group">
          <button v-for="entry in menu.actions" :key="entry.key" type="button" class="ui-group-row library-menu-item"
            @click="ctl.choose(entry.key)">
            <for-you-icon :name="entry.icon" :class="'is-' + entry.icon" />
            <span class="library-menu-label">{{ entry.label }}</span>
            <small v-if="entry.detail" class="library-menu-detail">{{ entry.detail }}</small>
          </button>
        </div>
        <div class="ui-group for-you-thumbs" role="group" aria-label="Feedback">
          <button type="button" :class="['for-you-thumb', { 'is-on': thumb === 'up' }]" :aria-pressed="String(thumb === 'up')"
            @click="ctl.choose('thumb-up')"><for-you-icon name="thumb-up" /> More like this</button>
          <button type="button" :class="['for-you-thumb', { 'is-on': thumb === 'down' }]" :aria-pressed="String(thumb === 'down')"
            @click="ctl.choose('thumb-down')"><for-you-icon name="thumb-down" /> Fewer like this</button>
        </div>
        <div class="ui-group library-menu-group">
          <button v-for="entry in menu.more" :key="entry.key" type="button" class="ui-group-row library-menu-item"
            @click="ctl.choose(entry.key)">
            <for-you-icon :name="entry.icon" />
            <span class="library-menu-label">{{ entry.label }}</span>
          </button>
        </div>
      </div>
    </ui-sheet>

    <ui-sheet :open="Boolean(whyItem)" title="Why this?" :subtitle="whySubtitle" @close="ctl.closeWhy()">
      <template #header-lead>
        <span v-if="whyItem?.image && !failedArt[whyItem.image]" class="library-menu-art is-wide for-you-why-art" aria-hidden="true">
          <img :src="whyItem.image" alt="" @error="markFailed(whyItem.image)" />
        </span>
      </template>
      <template #header-actions>
        <button type="button" class="ui-icon-button for-you-why-close ui-only-wide" aria-label="Close" @click="ctl.closeWhy()"><close-glyph /></button>
      </template>
      <div v-if="whyItem" class="for-you-why">
        <h3 class="ui-group-label">Why you're seeing it</h3>
        <div v-if="ctl.why.loading" class="ui-group">
          <div v-for="n in 3" :key="n" class="ui-group-row"><span class="ui-skeleton is-row for-you-why-skeleton"></span></div>
        </div>
        <p v-else-if="ctl.why.failed" class="for-you-why-note">Freetvarr could not load the reasons. Try again in a moment.</p>
        <ul v-else class="ui-group for-you-why-list">
          <li v-for="row in whyRows" :key="row.text" class="ui-group-row for-you-why-row">
            <span class="for-you-why-icon"><for-you-icon :name="row.icon" /></span>
            <span class="for-you-why-text">
              <span class="for-you-why-title">{{ row.text }}</span>
              <span v-if="row.percent != null" class="ui-progress for-you-why-bar" role="img"
                :aria-label="'Weight ' + row.percent + ' percent'"><span class="ui-progress-fill" :style="{ width: row.percent + '%' }"></span></span>
            </span>
          </li>
          <li v-if="!whyRows.length" class="ui-group-row for-you-why-row">
            <span class="for-you-why-title">{{ whyItem.reason || 'Picked from this week\\'s guide.' }}</span>
          </li>
        </ul>
        <p v-if="signals.length" class="for-you-why-signals">{{ signals.join(' · ') }}</p>
        <p class="for-you-why-note">Based on viewing on this box only. Your history never leaves it.</p>
      </div>
      <template v-if="whyItem" #footer>
        <button type="button" class="ui-button ui-button-block for-you-why-action" @click="ctl.choose('not-interested', whyItem)">
          <for-you-icon name="hide" /> Not interested in this show
        </button>
        <button type="button" :class="['ui-button', 'ui-button-block', 'for-you-why-action', { 'is-on': whyThumb === 'down' }]"
          :aria-pressed="String(whyThumb === 'down')" @click="ctl.choose('thumb-down', whyItem)">
          <for-you-icon name="thumb-down" /> Fewer like this
        </button>
      </template>
    </ui-sheet>
  `,
  setup(props) {
    const nowMs = computed(() => now.value.getTime())
    const menuItem = computed(() => props.ctl.menuItem.value)
    const whyItem = computed(() => props.ctl.why.item)
    const menu = computed(() => (menuItem.value
      ? menuOf({ item: menuItem.value, scheduled: props.ctl.isScheduled(menuItem.value), nowMs: nowMs.value, timeZone: tz.value })
      : { actions: [], more: [] }))
    const menuMeta = computed(() => (menuItem.value ? menuMetaOf({ item: menuItem.value, nowMs: nowMs.value, timeZone: tz.value }) : ''))
    const menuReason = computed(() => (menuItem.value ? reasonOf(menuItem.value) : ''))
    const thumb = computed(() => props.ctl.thumbOf(menuItem.value))
    const whyThumb = computed(() => props.ctl.thumbOf(whyItem.value))
    const whySubtitle = computed(() => (whyItem.value
      ? [whyItem.value.title, cardMetaOf({ item: whyItem.value, nowMs: nowMs.value, timeZone: tz.value })].filter(Boolean).join(' · ')
      : ''))
    const whyRows = computed(() => whyRowsOf(props.ctl.why.data))
    const signals = computed(() => props.ctl.why.data?.signals ?? [])
    const failedArt = ref({})
    const markFailed = (src) => { failedArt.value = { ...failedArt.value, [src]: true } }
    return { failedArt, markFailed, menuItem, whyItem, menu, menuMeta, menuReason, thumb, whyThumb, whySubtitle, whyRows, signals }
  },
}

const FOR_YOU_ICONS = {
  play: [{ tag: 'path', attrs: { d: 'M7 4v16l13-8z', fill: 'currentColor', stroke: 'none' } }],
  record: [{ tag: 'circle', attrs: { cx: 12, cy: 12, r: 6, fill: 'currentColor', stroke: 'none' } }],
  series: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 4.5, fill: 'currentColor', stroke: 'none' } },
  ],
  options: [
    { tag: 'path', attrs: { d: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h7M15 18h5' } },
    { tag: 'circle', attrs: { cx: 16, cy: 6, r: 2 } },
    { tag: 'circle', attrs: { cx: 10, cy: 12, r: 2 } },
    { tag: 'circle', attrs: { cx: 13, cy: 18, r: 2 } },
  ],
  'thumb-up': [
    { tag: 'path', attrs: { d: 'M7 10v12' } },
    { tag: 'path', attrs: { d: 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z' } },
  ],
  'thumb-down': [
    { tag: 'path', attrs: { d: 'M17 14V2' } },
    { tag: 'path', attrs: { d: 'M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z' } },
  ],
  hide: [
    { tag: 'path', attrs: { d: 'M10.7 5.1A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.7 2.7' } },
    { tag: 'path', attrs: { d: 'M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6' } },
    { tag: 'path', attrs: { d: 'M9.9 9.9a3 3 0 1 0 4.2 4.2' } },
    { tag: 'path', attrs: { d: 'm2 2 20 20' } },
  ],
  info: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
    { tag: 'path', attrs: { d: 'M12 11v6M12 7.5v.5' } },
  ],
  why: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
    { tag: 'path', attrs: { d: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-2.9 2.6-2.9 4M12 17.5v.01' } },
  ],
  history: [
    { tag: 'path', attrs: { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' } },
    { tag: 'path', attrs: { d: 'M3 3v5h5M12 7v5l4 2' } },
  ],
  tag: [
    { tag: 'path', attrs: { d: 'M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z' } },
    { tag: 'circle', attrs: { cx: 7.5, cy: 7.5, r: 0.5, fill: 'currentColor' } },
  ],
  movie: [
    { tag: 'path', attrs: { d: 'M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' } },
    { tag: 'path', attrs: { d: 'M3 11 2.3 8.4a1.6 1.6 0 0 1 1.1-2l13.3-3.6a1.6 1.6 0 0 1 2 1.1L19.4 6.6z' } },
    { tag: 'path', attrs: { d: 'm6.3 5.3 3.3 3.9M12.2 3.7l3.3 3.9' } },
  ],
  'not-movie': [
    { tag: 'path', attrs: { d: 'M7 11H3v8a2 2 0 0 0 2 2h12M15 11h6v6' } },
    { tag: 'path', attrs: { d: 'M3 11l-.7-2.6a1.6 1.6 0 0 1 .8-1.9M9.5 4.6l7.2-1.9a1.6 1.6 0 0 1 2 1.1l.7 2.7-5.8 1.6' } },
    { tag: 'path', attrs: { d: 'm12.2 3.7 2.6 3.1' } },
    { tag: 'path', attrs: { d: 'm2 2 20 20' } },
  ],
  clock: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 10 } },
    { tag: 'path', attrs: { d: 'M12 6v6l4 2' } },
  ],
  tv: [
    { tag: 'rect', attrs: { x: 2, y: 3, width: 20, height: 14, rx: 2 } },
    { tag: 'path', attrs: { d: 'M8 21h8M12 17v4' } },
  ],
  sliders: [
    { tag: 'path', attrs: { d: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h7M15 18h5' } },
    { tag: 'circle', attrs: { cx: 16, cy: 6, r: 2 } },
    { tag: 'circle', attrs: { cx: 10, cy: 12, r: 2 } },
    { tag: 'circle', attrs: { cx: 13, cy: 18, r: 2 } },
  ],
  check: [{ tag: 'path', attrs: { d: 'M20 6 9 17l-5-5' } }],
}
