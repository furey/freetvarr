import { ref, watch, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'

export const TmdbKeySetting = {
  template: `
    <div class="settings-group" data-setting="tmdb-key">
      <h3 class="ui-group-label">TMDB key</h3>
      <div class="ui-group">
        <div class="settings-row">
          <label class="field-label" for="settings-tmdb-key">TMDB API key (optional)</label>
          <div class="field-action">
            <div class="field-action-controls">
              <input v-no-autofill id="settings-tmdb-key" type="password" :class="['field-input', { 'is-invalid': statusText && statusKind === 'err' }]" v-model="typedKey"
                :placeholder="keySet ? '••••• (stored)' : 'Paste an API key or read access token'" autocomplete="off" spellcheck="false" />
              <button type="button" :class="['ui-button', { 'is-pending': busy === 'test' }]" :disabled="busy || (!typedKey && !keySet)" @click="testKey">
                <template v-if="busy === 'test'"><span class="spinner" aria-hidden="true"></span> Testing…</template><template v-else><pulse-icon /> Test key</template>
              </button>
            </div>
          </div>
          <p v-if="statusText" :class="['status-readout', 'field-status', statusKind]" role="status">{{ statusText }}</p>
          <p class="settings-hint">
            Adds film posters, film ratings, and reviews from TMDB. TMDB pictures replace the Wikipedia ones. The key is free:
            <a href="https://furey.github.io/freetvarr/guide/tv-guide#tmdb-key" target="_blank" rel="noopener noreferrer">How to get a TMDB key</a> shows what to enter in TMDB's form.
            Paste either the API key or the API read access token; both work. The key stays on this server.
          </p>
          <div class="field-action-more">
            <button type="button" :class="['ui-button', { 'is-pending': busy === 'save' }]" :disabled="busy || !typedKey" @click="saveKey">
              <template v-if="busy === 'save'"><span class="spinner" aria-hidden="true"></span> Saving…</template><template v-else>Save key</template>
            </button>
            <button v-if="keySet" type="button" :class="['ui-button', { 'is-pending': busy === 'remove' }]" :disabled="busy" @click="removeKey">
              <template v-if="busy === 'remove'"><span class="spinner" aria-hidden="true"></span> Removing…</template><template v-else>Remove key</template>
            </button>
          </div>
        </div>
      </div>
      <p class="settings-note">This product uses the TMDB API but is not endorsed or certified by <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">TMDB</a>. Some show ratings and cast lists are from <a href="https://www.tvmaze.com" target="_blank" rel="noopener noreferrer">TVmaze</a>.</p>
    </div>
  `,
  emits: ['key-change'],
  setup(props, { emit }) {
    const keySet = ref(false)
    const typedKey = ref('')
    const busy = ref('')
    const statusText = ref('')
    const statusKind = ref('info')

    watch(keySet, (isSet) => emit('key-change', isSet))

    const report = (text, kind) => {
      statusText.value = text
      statusKind.value = kind
    }

    const runAs = async (action, task) => {
      busy.value = action
      report('', 'info')
      try {
        await task()
      } catch (err) {
        report(err.message, 'err')
      } finally {
        busy.value = ''
      }
    }

    const testKey = () => runAs('test', async () => {
      const result = await api('POST', '/api/artwork/tmdb/test', typedKey.value ? { key: typedKey.value } : {})
      report(result.message, result.ok ? 'ok' : 'err')
    })

    const saveKey = () => runAs('save', async () => {
      const result = await api('PUT', '/api/artwork/tmdb', { key: typedKey.value })
      keySet.value = true
      typedKey.value = ''
      report(result.checked ? 'Saved. TMDB accepted the key.' : 'Saved. Freetvarr could not reach TMDB to check it yet.', result.checked ? 'ok' : 'info')
    })

    const removeKey = () => runAs('remove', async () => {
      await api('DELETE', '/api/artwork/tmdb')
      keySet.value = false
      report('Removed. Freetvarr no longer asks TMDB for pictures, ratings, or reviews.', 'ok')
    })

    onMounted(async () => {
      const state = await api('GET', '/api/artwork/tmdb').catch(() => null)
      keySet.value = Boolean(state?.key_set)
    })

    return { keySet, typedKey, busy, statusText, statusKind, testKey, saveKey, removeKey }
  },
}
