import { ref, watch, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { saveOnEnterOf } from '/tmdb-key-field.js'
import { labellerStatusLineOf } from '/labeller-status.js'

export const LabellerKeySetting = {
  template: `
    <div class="settings-group" data-setting="labeller-key">
      <h3 class="ui-group-label">Category labeller</h3>
      <div class="ui-group">
        <div class="settings-row">
          <label class="field-label" for="settings-labeller-key">TypeSafe API key (optional)</label>
          <div class="field-action">
            <div class="field-action-controls">
              <input v-no-autofill id="settings-labeller-key" type="password" :class="['field-input', { 'is-invalid': (statusText && statusKind === 'err') || (!statusText && saved.kind === 'err') }]" v-model="typedKey"
                @keydown.enter.prevent="saveOnEnterOf({ typedKey, busy }) && saveKey()"
                :placeholder="keySet ? '••••• (stored)' : 'Paste a TypeSafe API key'" autocomplete="off" spellcheck="false" />
              <button type="button" :class="['ui-button', { 'is-pending': busy === 'test' }]" :disabled="busy || (!typedKey && !keySet)" @click="testKey">
                <template v-if="busy === 'test'"><span class="spinner" aria-hidden="true"></span> Testing…</template><template v-else><pulse-icon /> Test key</template>
              </button>
            </div>
          </div>
          <p v-if="statusText" :class="['status-readout', 'field-status', statusKind]" role="status">{{ statusText }}</p>
          <p v-else-if="saved.text" :class="['status-readout', 'field-status', saved.kind]" role="status">{{ saved.text }}<template v-if="saved.address"> <code>{{ saved.address }}</code>{{ saved.after }}</template></p>
          <p class="settings-hint">
            Asks Jev, a classification model from TypeSafe, to pick the categories of each new show in the TV guide. Jev's answer comes first; Freetvarr's own sources fill in when Jev has none, and your own category changes always win. For each new title it sends the title, one guide description, an episode title, the guide genres, the channel name, and your country. Nothing about what you watch or record leaves this server.
            <a href="https://furey.github.io/freetvarr/guide/for-you#category-labeller" target="_blank" rel="noopener noreferrer">How to get a TypeSafe key</a> covers the cost, which TypeSafe bills to your account.
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
    </div>
  `,
  emits: ['key-change'],
  setup(props, { emit }) {
    const keySet = ref(false)
    const typedKey = ref('')
    const busy = ref('')
    const statusText = ref('')
    const statusKind = ref('info')
    const saved = ref({ text: '', kind: 'info' })

    watch(keySet, (isSet) => emit('key-change', isSet))

    const report = (text, kind) => {
      statusText.value = text
      statusKind.value = kind
    }

    const refresh = async () => {
      const state = await api('GET', '/api/labeller').catch(() => null)
      keySet.value = Boolean(state?.key_set)
      saved.value = labellerStatusLineOf(state)
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
      const result = await api('POST', '/api/labeller/test', typedKey.value ? { key: typedKey.value } : {})
      report(result.message, result.ok ? 'ok' : 'err')
      if (!typedKey.value) await refresh()
    })

    const saveKey = () => runAs('save', async () => {
      const result = await api('PUT', '/api/labeller', { key: typedKey.value })
      typedKey.value = ''
      await refresh()
      report(result.checked ? 'Saved. TypeSafe accepted the key.' : 'Saved. Freetvarr could not reach TypeSafe to check it yet.', result.checked ? 'ok' : 'info')
    })

    const removeKey = () => runAs('remove', async () => {
      await api('DELETE', '/api/labeller')
      await refresh()
      report('Removed. Categories come from the guide, TVmaze, and Wikidata only.', 'ok')
    })

    onMounted(refresh)

    return { keySet, typedKey, busy, statusText, statusKind, saved, testKey, saveKey, removeKey, saveOnEnterOf }
  },
}
