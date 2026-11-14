import { ref, computed, watch, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import {
  canSaveCategoriesOf,
  categoriesPathOf,
  categoriesResetTextOf,
  categoriesSavedTextOf,
  originLineOf,
  overrideRequestOf,
  sheetHintOf,
  toggledTopicsOf,
} from '/category-override.js'
import { holdAtLeast } from '/pending.js'
import { api } from '/shared/api.js'
import { toast } from '/shared/toast.js'

export const categoriesTitle = ref(null)

export const openCategories = (title) => { categoriesTitle.value = String(title ?? '').trim() || null }

export const reloadOnCategoriesChange = (reload) => {
  reloaders.add(reload)
  onUnmounted(() => reloaders.delete(reload))
}

export const CategoriesSheet = {
  template: `
    <ui-sheet :open="categoriesTitle != null" title="Change categories" :subtitle="categoriesTitle || ''" @close="close">
      <template #header-actions>
        <button type="button" class="ui-icon-button" aria-label="Close" @click="close"><close-glyph /></button>
      </template>
      <p v-if="error" class="ui-banner is-error" role="alert">{{ error }}</p>
      <p class="settings-row-meta categories-sheet-hint">
        <span v-if="!loaded" class="ui-skeleton is-text" style="--skeleton-w: 18em"></span><template v-else>{{ hint }}</template>
      </p>
      <div class="settings-group">
        <h3 id="categories-sheet-format" class="ui-group-label categories-sheet-label">Format</h3>
        <ui-segmented class="categories-sheet-formats" aria-labelledby="categories-sheet-format"
          :model-value="loaded ? format : null" :disabled="!loaded || Boolean(busy)" :options="formatOptions"
          @update:model-value="format = $event" />
      </div>
      <div class="settings-group">
        <h3 class="ui-group-label categories-sheet-label">Topics <span class="categories-sheet-limit">Up to 2</span></h3>
        <div class="ui-group">
          <div v-if="!loaded" class="settings-row"><span class="ui-skeleton is-text" style="--skeleton-w: 10em"></span></div>
          <div v-for="choice in choices.topics" :key="choice.key" class="settings-row" :data-topic="choice.key">
            <toggle-switch :model-value="topics.includes(choice.key)" class="settings-toggle"
              @update:model-value="setTopic(choice.key, $event)">
              <span class="settings-toggle-text"><span class="settings-row-title">{{ choice.title }}</span></span>
            </toggle-switch>
          </div>
        </div>
      </div>
      <div class="settings-group">
        <h3 class="ui-group-label categories-sheet-label">Origin</h3>
        <div class="ui-group">
          <div class="settings-row">
            <span class="settings-row-title"><span v-if="!loaded" class="ui-skeleton is-text" style="--skeleton-w: 12em"></span><template v-else>{{ originLine }}</template></span>
            <span class="settings-row-meta">Freetvarr finds the origin. It cannot be changed here.</span>
          </div>
        </div>
      </div>
      <div class="ui-sheet-footer categories-sheet-footer">
        <div class="categories-sheet-buttons">
          <button type="button" :class="['ui-button', 'ui-button-primary', { 'is-pending': busy === 'save' }]"
            :disabled="!loaded || Boolean(busy) || !canSave" :aria-busy="busy === 'save'" @click="save">
            <template v-if="busy === 'save'"><span class="spinner" aria-hidden="true"></span> Saving…</template><template v-else>Save</template>
          </button>
          <button type="button" :class="['ui-button', 'ui-button-secondary', { 'is-pending': busy === 'reset' }]"
            :disabled="!loaded || Boolean(busy) || !custom" :aria-busy="busy === 'reset'" @click="reset">
            <template v-if="busy === 'reset'"><span class="spinner" aria-hidden="true"></span> Resetting…</template><template v-else>Use automatic categories</template>
          </button>
        </div>
      </div>
    </ui-sheet>
  `,
  setup() {
    const loaded = ref(false)
    const busy = ref('')
    const error = ref('')
    const format = ref('')
    const topics = ref([])
    const custom = ref(false)
    const origin = ref(null)
    const choices = ref({ formats: [], topics: [] })

    const hint = computed(() => sheetHintOf({ custom: custom.value }))
    const originLine = computed(() => originLineOf(origin.value))
    const formatOptions = computed(() => [{ value: '', label: 'None' }, ...choices.value.formats.map((choice) => ({ value: choice.key, label: choice.title }))])
    const canSave = computed(() => canSaveCategoriesOf({ format: format.value, topics: topics.value }))

    const apply = (payload) => {
      format.value = payload.format ?? ''
      topics.value = [...(payload.topics ?? [])]
      custom.value = Boolean(payload.custom)
      origin.value = payload.origin ?? null
      choices.value = payload.choices ?? { formats: [], topics: [] }
      loaded.value = true
    }

    const load = async (title) => {
      loaded.value = false
      error.value = ''
      try {
        const payload = await api('GET', `${categoriesPathOf(title)}?title=${encodeURIComponent(title)}`)
        if (categoriesTitle.value === title) apply(payload)
      } catch (err) {
        if (categoriesTitle.value === title) error.value = `Cannot load the categories: ${err.message}`
      }
    }

    watch(categoriesTitle, (title) => {
      if (title != null) load(title)
    })

    const close = () => {
      if (!busy.value) categoriesTitle.value = null
    }

    const setTopic = (key, on) => {
      topics.value = toggledTopicsOf({ topics: topics.value, key, on })
    }

    const change = async ({ kind, request, text }) => {
      const title = categoriesTitle.value
      busy.value = kind
      error.value = ''
      try {
        await holdAtLeast({ task: () => request(title), minMs: BUSY_MIN_MS })
        busy.value = ''
        close()
        toast({ text: text(title) })
        reloadAll()
      } catch (err) {
        error.value = `Could not ${kind === 'save' ? 'save' : 'reset'} the categories: ${err.message}`
      } finally {
        busy.value = ''
      }
    }

    const save = () => change({
      kind: 'save',
      request: (title) => api('PUT', categoriesPathOf(title), overrideRequestOf({ title, format: format.value, topics: topics.value })),
      text: categoriesSavedTextOf,
    })

    const reset = () => change({
      kind: 'reset',
      request: (title) => api('DELETE', `${categoriesPathOf(title)}?title=${encodeURIComponent(title)}`),
      text: categoriesResetTextOf,
    })

    return { categoriesTitle, loaded, busy, error, format, topics, custom, choices, formatOptions, hint, originLine, canSave, close, setTopic, save, reset }
  },
}

const BUSY_MIN_MS = 800

const reloaders = new Set()

const reloadAll = () => Promise.all([...reloaders].map((reload) => Promise.resolve(reload()).catch(() => {})))
