import { inject } from '/vendor/vue.esm-browser.prod.js'
import { SORT_PART_COMPONENTS } from '/components/sort-parts.js'
import { MOVIE_CHIP_TEXT } from '/kind-filter.js'

export const GUIDE_ROW_CONTEXT = Symbol('guide-row-context')

export const GuideRow = {
  components: SORT_PART_COMPONENTS,
  props: {
    kind: { type: String, required: true },
    rowKey: { type: String, required: true },
    label: { type: String, default: '' },
    ch: { type: Object, default: null },
    pinIndex: { type: Number, default: -1 },
  },
  setup() {
    return { ...inject(GUIDE_ROW_CONTEXT), MOVIE_CHIP_TEXT }
  },
  template: `
    <div :data-channel-id="ch?.id"
      :data-sort-id="ch?.pinned && canSort ? rowKey : null"
      :class="kind === 'heading' ? 'epg-heading-row' : ['epg-row', { pinned: ch.pinned }]">
      <template v-if="kind === 'heading'">
        <div class="epg-heading-rail">
          <span class="channel-group-heading">{{ label }}</span>
          <button v-if="rowKey === 'h-fav' && narrow && pinnedCount >= 2" type="button" class="sort-edit-order epg-edit-order"
            @click="openOrderEditor">Edit order</button>
          <sort-edit-toggle v-else-if="rowKey === 'h-fav' && canEditOrder" :on="editingOrder"
            :icon-only="railLayout.orderControl === 'icon'" @toggle="toggleOrderEditing" />
        </div>
        <div class="epg-heading-track"></div>
      </template>
      <template v-else>
      <div :class="['epg-rail-cell', { 'off-air': ch.offAir }]">
        <button v-if="ch.pinned && !narrow" type="button" class="sort-handle epg-sort-handle" data-sort-handle
          aria-roledescription="sortable" title="Drag to reorder" :inert="!canSort"
          :aria-label="'Reorder ' + ch.name + ', position ' + (pinIndex + 1) + ' of ' + pinnedCount + '. Press Space to pick up.'"
          @pointerdown="canSort && sort.onPointerDown(rowKey, $event)"
          @keydown="canSort && sort.onKeydown(rowKey, $event)"
          @blur="sort.onBlur(rowKey)"><sort-grip-icon /></button>
        <channel-identity :channel="ch" :has-logo="Boolean(ch.logos?.length)" :number="railNum(ch)" :starred="isStarred(ch)"
          @pin="togglePin(ch, $event)" />
      </div>
      <div class="epg-track" :style="{ width: trackWidth + 'px' }">
        <span v-if="loadingIds.has(ch.id)" class="epg-loading-note" role="status"
          :title="LISTINGS_LOADING_TEXT"
          :style="{ left: (nowX ?? 0) + 8 + 'px', maxWidth: loadingNoteMaxPx + 'px' }">{{ LISTINGS_LOADING_TEXT }}</span>
        <button v-for="p in rowCells(ch)" :key="p.program_id + '-' + p.start" v-memo="[cellViewOf(p)]" type="button"
          :class="cellViewOf(p).className" :style="cellViewOf(p).style" :aria-label="cellViewOf(p).title" :data-key="cellKey(ch, p)"
          @click="openProgram(p, ch)">
          <guide-cell-image v-if="cellViewOf(p).art !== 'none'" :event-id="p.program_id" :fallback="cellViewOf(p).art === 'fallback'"
            :channel-id="ch.id" :has-logo="Boolean(ch.logos?.length)" :title="p.title" />
          <span v-if="cellViewOf(p).showsText" class="epg-cell-text">
            <span class="epg-cell-title"><span v-if="cellViewOf(p).marks.scheduledDot" class="epg-cell-dot is-inline" aria-hidden="true"></span><span v-else-if="cellViewOf(p).marks.watchDot" class="epg-cell-dot is-inline is-watch" aria-hidden="true"></span>{{ p.title }}</span>
            <span class="epg-cell-meta"><span class="epg-cell-clock">{{ cellViewOf(p).clock }}</span><span v-if="cellViewOf(p).movieChip"
              class="channels-format programme-kind-chip">{{ MOVIE_CHIP_TEXT }}</span></span>
          </span>
          <template v-else>
            <span v-if="cellViewOf(p).marks.scheduledDot" class="epg-cell-dot" aria-hidden="true"></span>
            <span v-else-if="cellViewOf(p).marks.watchDot" class="epg-cell-dot is-watch" aria-hidden="true"></span>
          </template>
        </button>
      </div>
      </template>
    </div>
  `,
}
