import { ref, watch } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'

export const nicknamesPathOf = (showKey) => `/api/show-nicknames/${encodeURIComponent(showKey)}`

export const loadNicknames = async (showKey) => (await api('GET', nicknamesPathOf(showKey))).nicknames || []

export const AlsoKnownAs = {
  props: {
    showKey: { type: String, required: true },
  },
  emits: ['flash'],
  template: `
    <div class="aka">
      <h3 class="options-label" id="aka-label">Also known as</h3>
      <ul v-if="nicknames.length" class="ui-chip-row aka-list" aria-labelledby="aka-label">
        <li v-for="nickname in nicknames" :key="nickname.id" class="ui-chip is-small aka-chip">
          <span>{{ nickname.name }}</span>
          <button type="button" class="aka-remove" :aria-label="'Remove ' + nickname.name" :disabled="busy"
            @click="remove(nickname)"><close-glyph /></button>
        </li>
      </ul>
      <form class="aka-add" @submit.prevent="add">
        <label class="ui-visually-hidden" for="aka-input">Add a name for this show</label>
        <input v-no-autofill id="aka-input" v-model="draft" class="options-input" type="text" maxlength="60"
          placeholder="Add a name people use, like MKR" autocomplete="off" enterkeyhint="done" />
        <button type="submit" class="ui-button ui-button-sm" :disabled="busy || !draft.trim()">Add</button>
      </form>
      <p class="options-hint">Search finds the show by these names too.</p>
      <p class="ui-visually-hidden" aria-live="polite">{{ statusText }}</p>
    </div>
  `,
  setup(props, { emit }) {
    const nicknames = ref([])
    const draft = ref('')
    const busy = ref(false)
    const statusText = ref('')

    const load = async () => {
      nicknames.value = await loadNicknames(props.showKey).catch(() => [])
    }

    const change = async (what, task) => {
      busy.value = true
      try {
        nicknames.value = (await task()).nicknames || []
        return true
      } catch (err) {
        emit('flash', { msg: `${what} failed: ${err.message}`, kind: 'err', ms: 8000 })
        return false
      } finally {
        busy.value = false
      }
    }

    const add = async () => {
      const name = draft.value.trim()
      if (!name) return
      const added = await change('Adding the name', () => api('POST', nicknamesPathOf(props.showKey), { name }))
      if (!added) return
      draft.value = ''
      statusText.value = `Added ${name}.`
    }

    const remove = async (nickname) => {
      const removed = await change('Removing the name', () => api('DELETE', `${nicknamesPathOf(props.showKey)}/${nickname.id}`))
      if (removed) statusText.value = `Removed ${nickname.name}.`
    }

    watch(() => props.showKey, load, { immediate: true })

    return { nicknames, draft, busy, statusText, add, remove }
  },
}
