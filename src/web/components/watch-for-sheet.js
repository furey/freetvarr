import { ref, computed, watch } from '/vendor/vue.esm-browser.prod.js'
import { holdAtLeast } from '/pending.js'
import { strengthLineOf } from '/programme-sheet.js'
import { api } from '/shared/api.js'
import { useFlash } from '/shared/composables.js'
import { loadWatchlist } from '/shared/programme-sheet-store.js'
import { refreshAfterRecordingChange } from '/shared/recording-now.js'
import {
  WATCH_FOR_DEFAULT_LAG,
  WATCH_FOR_DEFAULT_LEAD,
  watchForActionLabelOf,
  watchForTitleOf,
  watchRequestOf,
  watchedMessageOf,
} from '/watch-for.js'

export const watchForTitle = ref(null)

export const openWatchFor = (title) => { watchForTitle.value = watchForTitleOf(title) }

export const WatchForSheet = {
  template: `
    <ui-sheet :open="watchForTitle != null" title="Watch for a show" @close="close">
      <form class="watch-for-form" @submit.prevent="save">
        <div class="options-field">
          <label class="options-label" for="watch-for-title">Title</label>
          <input v-no-autofill id="watch-for-title" v-model="title" class="options-input watch-for-input" type="text"
            maxlength="200" enterkeyhint="done" required />
        </div>
        <p class="options-hint watch-for-line">{{ line }}</p>
        <div class="ui-group options-group">
          <div class="ui-group-row">
            <span class="ui-group-row-main">
              <span class="ui-group-row-title">Record when it appears</span>
              <span class="ui-group-row-meta">Sets an any-channel series recording the first time it is in the guide</span>
            </span>
            <button type="button" class="ui-switch" :aria-pressed="String(recordWhenSeen)" aria-label="Record when it appears" @click="recordWhenSeen = !recordWhenSeen"></button>
          </div>
          <padding-rows v-if="recordWhenSeen" v-model:lead="leadTime" v-model:lag="lagTime" id-prefix="watch-for" />
        </div>
        <p v-if="error" class="programme-sheet-error err" role="status">{{ error }}</p>
        <div class="ui-sheet-footer">
          <button type="submit" :class="['ui-button', 'ui-button-primary', 'ui-button-block', { 'is-pending': busy }]" :disabled="busy || !trimmedTitle" :aria-busy="busy">
            <template v-if="busy"><span class="spinner" aria-hidden="true"></span> Saving…</template>
            <template v-else>{{ actionLabel }}</template>
          </button>
          <button type="button" class="ui-button ui-button-block" :disabled="busy" @click="close">Cancel</button>
        </div>
      </form>
    </ui-sheet>
  `,
  setup() {
    const { flash } = useFlash()
    const title = ref('')
    const recordWhenSeen = ref(false)
    const leadTime = ref(WATCH_FOR_DEFAULT_LEAD)
    const lagTime = ref(WATCH_FOR_DEFAULT_LAG)
    const busy = ref(false)
    const error = ref('')
    const trimmedTitle = computed(() => watchForTitleOf(title.value))
    const line = computed(() => strengthLineOf({
      strength: 'notify',
      title: trimmedTitle.value || 'this show',
      recordWhenSeen: recordWhenSeen.value,
    }))
    const actionLabel = computed(() => watchForActionLabelOf({ recordWhenSeen: recordWhenSeen.value }))
    const reset = (initialTitle) => {
      title.value = initialTitle
      recordWhenSeen.value = false
      leadTime.value = WATCH_FOR_DEFAULT_LEAD
      lagTime.value = WATCH_FOR_DEFAULT_LAG
      error.value = ''
    }
    watch(watchForTitle, (next) => {
      if (next != null) reset(next)
    })
    const close = () => {
      if (!busy.value) watchForTitle.value = null
    }
    const afterSave = async (item) => {
      await loadWatchlist()
      if (item?.fulfilledAt) refreshAfterRecordingChange()
    }
    const save = async () => {
      if (!trimmedTitle.value || busy.value) return
      busy.value = true
      error.value = ''
      try {
        const { item } = await holdAtLeast({ task: () => api('POST', '/api/watchlist', watchRequestOf({
          title: trimmedTitle.value,
          recordWhenSeen: recordWhenSeen.value,
          leadTime: leadTime.value,
          lagTime: lagTime.value,
        })) })
        flash({ msg: watchedMessageOf({ title: trimmedTitle.value, item }) })
        busy.value = false
        close()
        await afterSave(item)
      } catch (err) {
        error.value = `Watch for failed: ${err.message}`
      } finally {
        busy.value = false
      }
    }
    return {
      watchForTitle, title, trimmedTitle, recordWhenSeen, leadTime, lagTime,
      busy, error, line, actionLabel, close, save,
    }
  },
}
