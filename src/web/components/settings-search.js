import { ref, computed, watch } from '/vendor/vue.esm-browser.prod.js'
import { searchSettings } from '/settings-index.js'
import { hashesMatch } from '/scroll-memory.js'
import { landOnSetting } from '/shared/setting-landing.js'

export const settingsQuery = ref('')

export const isSearchingSettings = computed(() => Boolean(settingsQuery.value.trim()))

const activeIndex = ref(0)

export const SettingsSearch = {
  template: `
    <div class="settings-search">
      <label class="ui-search-field settings-search-field">
        <search-glyph />
        <span class="ui-visually-hidden">Search settings</span>
        <input v-model="query" class="ui-search-input" type="search" enterkeyhint="search" placeholder="Search settings"
          autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" :aria-expanded="String(results.length > 0)"
          aria-controls="settings-search-results" :aria-activedescendant="activeId" @keydown="onKey" />
      </label>
      <div v-if="results.length" id="settings-search-results" class="settings-nav-list settings-search-results" role="listbox" aria-label="Matching settings">
        <a v-for="(entry, index) in results" :id="optionId(index)" :key="entry.page + ':' + entry.label" :href="entry.href"
          class="settings-nav-link settings-search-result" role="option" :aria-selected="String(index === activeIndex)"
          @click="choose({ entry, index, event: $event })">
          <span class="settings-nav-label">{{ entry.label }}<span class="settings-search-path">{{ entry.path }}</span></span>
          <chevron-glyph class="settings-nav-chevron ui-only-phone" />
        </a>
      </div>
      <p v-else-if="searching" class="settings-search-empty" role="status">Nothing in Settings matches “{{ query.trim() }}”.</p>
    </div>
  `,
  setup() {
    const results = computed(() => searchSettings(settingsQuery.value))
    const activeId = computed(() => (results.value.length ? optionId(activeIndex.value) : null))

    watch(settingsQuery, () => { activeIndex.value = 0 })

    const choose = ({ entry, index, event }) => {
      activeIndex.value = index
      if (!entry.setting) return
      if (hashesMatch(window.location.hash, entry.href)) event?.preventDefault()
      landOnSetting(entry.setting)
    }

    const openActive = () => {
      const entry = results.value[activeIndex.value]
      if (!entry) return
      choose({ entry, index: activeIndex.value })
      if (!hashesMatch(window.location.hash, entry.href)) window.location.hash = entry.href
    }

    const step = (delta) => {
      const count = results.value.length
      if (count) activeIndex.value = (activeIndex.value + delta + count) % count
    }

    const KEY_ACTIONS = {
      ArrowDown: () => step(1),
      ArrowUp: () => step(-1),
      Enter: openActive,
      Escape: () => { settingsQuery.value = '' },
    }

    const onKey = (event) => {
      const action = KEY_ACTIONS[event.key]
      if (!action || (event.key === 'Escape' && !settingsQuery.value)) return
      event.preventDefault()
      event.stopPropagation()
      action()
    }

    return { query: settingsQuery, searching: isSearchingSettings, results, activeIndex, activeId, optionId, choose, onKey }
  },
}

const optionId = (index) => `settings-search-option-${index}`
