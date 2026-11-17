import { ref, watch, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { saveOnEnterOf } from '/tmdb-key-field.js'
import { labellerStatusLineOf } from '/labeller-status.js'

export const LabellerKeySetting = {
  template: `
    <div class="settings-group" data-setting="labeller-key">
      <div class="settings-group-head">
        <h3 class="ui-group-label">Category labeller</h3>
        <info-button title="Category labeller" doc="guide/for-you#category-labeller">
          <p>Freetvarr takes the categories of a show from the first of these that has an answer:</p>
          <div class="ui-group">
            <div class="settings-row"><span class="settings-toggle-text"><strong>1. Your changes</strong><span class="settings-row-meta">Change categories on a show</span></span></div>
            <div class="settings-row"><span class="settings-toggle-text"><strong>2. Jev</strong><span class="settings-row-meta">With a TypeSafe key: format, topics, sport, country</span></span></div>
            <div class="settings-row"><span class="settings-toggle-text"><strong>3. Freetvarr's own sources</strong><span class="settings-row-meta">TVmaze, Wikidata, guide categories, and title words</span></span></div>
          </div>
          <p><strong>What Freetvarr sends.</strong> For each new guide show: the title, one guide description, one episode title, the guide genres, the channel names, and your country. Nothing about what you watch, record, or hide.</p>
          <p><strong>Cost.</strong> The cost comes out of your prepaid TypeSafe credit. A first guide of about 1,300 shows costs about US$0.20. After that, Freetvarr sends only shows that are new to the guide.</p>
        </info-button>
      </div>
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
            Optional. With a TypeSafe key, Freetvarr uses Jev, a classification model, for more accurate show categories.
            <a href="https://furey.github.io/freetvarr/guide/for-you#category-labeller" target="_blank" rel="noopener noreferrer">How to get a TypeSafe key</a>
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
