import { ref, computed } from '/vendor/vue.esm-browser.prod.js'
import { formatMinutes } from '/time-format.js'
import { syncDetail } from '/sync-detail.js'
import { fmtBytes } from '/shared/format.js'
import { fmtClockTz, fmtRelativeDay } from '/shared/time.js'

export const SyncDetail = {
  props: { sync: { type: Object, required: true }, deletable: Boolean },
  emits: ['delete'],
  template: `
    <div class="sync-detail">
      <p v-if="sync.status === 'running'" class="text-xs text-ink-dim">This sync is still running. Its details show here when it finishes.</p>
      <template v-else>
        <p class="sync-detail-meta">{{ detail.trigger }} · sync #{{ sync.id }}<template v-if="detail.message"> · {{ detail.message }}</template></p>
        <ul v-if="detail.items.length" class="sync-items">
          <li v-for="item in shownItems" :key="item.id" class="sync-item">
            <span :class="['pill', item.outcome === 'imported' ? 'done' : 'error']">{{ item.outcomeLabel }}</span>
            <div class="min-w-0">
              <p class="sync-item-title">{{ item.title }}<span v-if="item.episode" class="sync-item-episode"> · {{ item.episode }}</span></p>
              <p class="sync-item-meta">{{ itemMeta(item) }}</p>
              <p v-if="item.error" class="sync-item-error">{{ item.error }}</p>
            </div>
          </li>
        </ul>
        <button v-if="hiddenItemCount" type="button" class="btn-link text-xs" @click="showAll = true">Show all {{ detail.items.length }}</button>
        <p v-if="detail.omitted" class="text-xs text-ink-dim">{{ detail.omitted }} more not listed.</p>
        <p v-if="detail.countsOnly" class="text-xs text-ink-dim">This sync ran before Freetvarr kept a list of each recording, so only its counts are known.</p>
        <p v-else-if="!detail.items.length && !detail.errors.length" class="text-xs text-ink-dim">Nothing new to import.</p>
        <ul v-if="detail.errors.length" class="sync-errors">
          <li v-for="(error, i) in detail.errors" :key="i">{{ error }}</li>
        </ul>
        <dl v-if="detail.steps.length" class="sync-facts">
          <template v-for="step in detail.steps" :key="step.key">
            <dt>{{ step.label }}</dt><dd :class="{ 'sync-fact-err': !step.ok }">{{ step.text }}</dd>
          </template>
        </dl>
      </template>
      <div v-if="deletable" class="sync-detail-actions">
        <button type="button" class="ui-button ui-button-sm ui-button-destructive" title="Delete this sync from history."
          @click.stop="$emit('delete')" @keydown.stop><trash-icon /> Delete sync</button>
      </div>
    </div>
  `,
  setup(props) {
    const showAll = ref(false)
    const detail = computed(() => syncDetail(props.sync.summary))
    const shownItems = computed(() => (showAll.value ? detail.value.items : detail.value.items.slice(0, SYNC_DETAIL_ITEMS_SHOWN)))
    const hiddenItemCount = computed(() => detail.value.items.length - shownItems.value.length)
    const itemMeta = (item) => [
      item.kind,
      item.channel,
      item.airedAt ? `${fmtRelativeDay(item.airedAt)} ${fmtClockTz(item.airedAt)}` : '',
      item.durationMins ? formatMinutes(item.durationMins) : '',
      item.size ? fmtBytes(item.size) : '',
      item.ads,
      item.took ? `took ${item.took}` : '',
      item.removedFromTvh ? 'removed from TVHeadend' : '',
    ].filter(Boolean).join(' · ')
    return { detail, shownItems, hiddenItemCount, showAll, itemMeta }
  },
}

const SYNC_DETAIL_ITEMS_SHOWN = 20
