import { ref, computed, watch, nextTick } from '/vendor/vue.esm-browser.prod.js'
import { artFallbackStyle } from '/art-fallback.js'
import { moveSubtitleOf, moveTargetsOf, newShowTitleOf } from '/library-menus.js'
import { MenuIcon } from '/components/library-menus.js'
import { api } from '/shared/api.js'
import { stampedShowImage } from '/shared/artwork-stamps.js'

export const MoveToShowSheet = {
  components: { MenuIcon },
  props: {
    request: { type: Object, default: null },
    busy: Boolean,
  },
  emits: ['close', 'move'],
  template: `
    <ui-sheet :open="Boolean(request)" title="Merge into another show" :subtitle="subtitle" @close="$emit('close')">
      <label class="ui-search-field move-show-field">
        <search-glyph />
        <span class="ui-visually-hidden">Search shows</span>
        <input ref="input" v-model="query" class="ui-search-input" type="search" enterkeyhint="search"
          placeholder="Search shows" autocomplete="off" spellcheck="false" />
      </label>
      <p v-if="loadError" class="ui-search-hint" role="alert">Cannot load your shows: {{ loadError }}</p>
      <div v-if="targets.length || newTitle" class="ui-group move-show-list">
        <button v-for="show in targets" :key="show.key" type="button" class="ui-group-row is-tall move-show-row"
          :disabled="busy" @click="$emit('move', show.title)">
          <span class="library-menu-art ui-art-fallback is-poster" :style="artStyle(show.title)" aria-hidden="true">
            <img v-if="!failedPosters[show.key]" :src="posterOf(show)" alt="" loading="lazy" @error="markPosterFailed(show)" />
          </span>
          <span class="ui-group-row-main">
            <span class="ui-group-row-title">{{ show.title }}</span>
            <span class="ui-group-row-meta">{{ show.meta }}</span>
          </span>
        </button>
        <button v-if="newTitle" type="button" class="ui-group-row is-tall move-show-row" :disabled="busy" @click="$emit('move', newTitle)">
          <span class="library-menu-art is-poster move-show-new-mark" aria-hidden="true"><menu-icon name="plus" /></span>
          <span class="ui-group-row-main">
            <span class="ui-group-row-title">New show named “{{ newTitle }}”</span>
          </span>
        </button>
      </div>
      <p v-else-if="loaded && !loadError" class="ui-search-hint">No other shows match “{{ query.trim() }}”.</p>
    </ui-sheet>
  `,
  setup(props) {
    const input = ref(null)
    const query = ref('')
    const shows = ref([])
    const loaded = ref(false)
    const loadError = ref('')
    const failedPosters = ref({})

    const subtitle = computed(() => (props.request
      ? moveSubtitleOf({ title: props.request.fromTitle, count: props.request.ids.length })
      : ''))
    const targets = computed(() => moveTargetsOf({ shows: shows.value, query: query.value, currentKey: props.request?.fromKey || '' }))
    const newTitle = computed(() => newShowTitleOf({ shows: shows.value, query: query.value }))

    const loadShows = async () => {
      loaded.value = false
      loadError.value = ''
      try {
        shows.value = (await api('GET', '/api/library/shows')).shows || []
      } catch (err) {
        loadError.value = err.message
      } finally {
        loaded.value = true
      }
    }

    const focusOnFinePointer = async () => {
      if (!window.matchMedia?.('(pointer: fine)').matches) return
      await nextTick()
      setTimeout(() => input.value?.focus(), 0)
    }

    watch(() => props.request, (request) => {
      if (!request) return
      query.value = ''
      failedPosters.value = {}
      loadShows()
      focusOnFinePointer()
    })

    const posterOf = (show) => stampedShowImage(`${show.poster}&w=192`)
    const artStyle = (title) => artFallbackStyle(title)
    const markPosterFailed = (show) => {
      failedPosters.value = { ...failedPosters.value, [show.key]: true }
    }

    return { input, query, loaded, loadError, failedPosters, subtitle, targets, newTitle, posterOf, artStyle, markPosterFailed }
  },
}
