import { computed, onMounted, ref } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { allowedHostRowsOf, isListLockedFor } from '/allowed-hosts.js'

export const AllowedHostsSetting = {
  emits: ['change'],
  template: `
    <div class="allowed-hosts">
      <p class="setup-hint">A hostname is the name in the web address, such as synnas in http://synnas:3733 or tv.example.com in https://tv.example.com. IP addresses, localhost, one‑word names, and names that end in .local, .lan, .home.arpa, or .internal always work. Add any other name you open Freetvarr by, such as a reverse proxy or a Tailscale name. From 3.0.0, Freetvarr refuses names that are not on this list.</p>
      <ul v-if="rows.length" class="ui-chip-row aka-list" aria-label="Allowed hostnames">
        <li v-for="row in rows" :key="row.name" class="ui-chip is-small aka-chip">
          <span class="setup-mono">{{ row.name }}</span>
          <span v-if="row.fromEnv" class="allowed-hosts-source">from the .env file</span>
          <button v-else-if="!locked" type="button" class="aka-remove" :aria-label="'Remove ' + row.name" :disabled="busy"
            @click="remove(row.name)"><close-glyph /></button>
        </li>
      </ul>
      <p v-if="state?.any_host" class="setup-hint is-error">* turns the check off: Freetvarr answers to any name, so any website can reach it through a browser on your network.</p>
      <p v-if="locked" class="setup-hint is-error">You opened Freetvarr as {{ state.current.name }}, which is not on this list. Open Freetvarr by its IP address to change the list.</p>
      <form v-else class="aka-add" @submit.prevent="add">
        <label class="ui-visually-hidden" for="allowed-host-input">Add a hostname</label>
        <input v-no-autofill id="allowed-host-input" v-model="draft" class="options-input setup-mono-input" type="text" maxlength="253"
          placeholder="freetvarr.example.com" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" />
        <button type="submit" class="ui-button ui-button-sm" :disabled="busy || !draft.trim()">Add</button>
      </form>
      <p v-if="errorText" class="setup-hint is-error" role="alert">{{ errorText }}</p>
      <p class="ui-visually-hidden" aria-live="polite">{{ statusText }}</p>
    </div>
  `,
  setup(props, { emit }) {
    const state = ref(null)
    const draft = ref('')
    const busy = ref(false)
    const errorText = ref('')
    const statusText = ref('')
    const rows = computed(() => allowedHostRowsOf(state.value))
    const locked = computed(() => isListLockedFor(state.value))

    const show = (next) => {
      state.value = next
      emit('change', next)
    }

    const save = async ({ hosts, done }) => {
      busy.value = true
      errorText.value = ''
      try {
        show(await api('PUT', '/api/allowed-hosts', { hosts }))
        statusText.value = done
        return true
      } catch (err) {
        errorText.value = err.message
        return false
      } finally {
        busy.value = false
      }
    }

    const add = async () => {
      const name = draft.value.trim()
      if (!name) return
      const saved = await save({ hosts: [...(state.value?.hosts || []), name], done: `Added ${name}.` })
      if (saved) draft.value = ''
    }

    const remove = (name) => save({ hosts: (state.value?.hosts || []).filter((host) => host !== name), done: `Removed ${name}.` })

    onMounted(async () => {
      const loaded = await api('GET', '/api/allowed-hosts').catch(() => null)
      if (loaded) show(loaded)
    })

    return { state, rows, locked, draft, busy, errorText, statusText, add, remove }
  },
}
