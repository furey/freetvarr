import { ref, reactive, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { arrStatusOf, keyPlaceholderOf, findResultText } from '/arr-text.js'
import { api } from '/shared/api.js'

export const ArrSettings = {
  template: `
    <div class="settings-group" data-setting="arr-find">
      <div class="ui-group">
        <div class="settings-row">
          <div class="settings-row-actions">
            <button type="button" :class="['ui-button', { 'is-pending': finding }]" :disabled="finding" @click="find">
              <template v-if="finding"><span class="spinner" aria-hidden="true"></span> Looking…</template><template v-else><search-icon /> Find Sonarr and Radarr</template>
            </button>
            <span v-if="findText" class="status-readout info" role="status">{{ findText }}</span>
          </div>
          <p class="settings-hint">Looks on this server, ports 8989 and 7878.</p>
        </div>
      </div>
    </div>
    <div class="settings-group" data-setting="sonarr">
      <h3 class="ui-group-label">Sonarr</h3>
      <div class="ui-group">
        <div v-if="status.sonarr" class="settings-row arr-status-row">
          <span :class="['ui-dot', status.sonarr.kind === 'ok' ? 'is-ok' : 'is-fail']" aria-hidden="true"></span>
          <span class="settings-toggle-text">
            <span class="settings-row-title">{{ status.sonarr.title }}</span>
            <span v-if="status.sonarr.detail" class="settings-row-meta"><meta-line :text="status.sonarr.detail" /></span>
          </span>
        </div>
        <div class="settings-row" data-setting="sonarr-url">
          <label class="field-label" for="settings-sonarr-url">Sonarr URL</label>
          <input v-no-autofill id="settings-sonarr-url" type="url" class="field-input" v-model="form.sonarr.url"
            placeholder="http://192.168.1.10:8989" autocomplete="off" spellcheck="false" />
        </div>
        <div class="settings-row" data-setting="sonarr-key">
          <label class="field-label" for="settings-sonarr-key">API key</label>
          <input v-no-autofill id="settings-sonarr-key" type="password" class="field-input" v-model="form.sonarr.apiKey"
            :placeholder="keyPlaceholderOf({ app: 'sonarr', saved: saved.sonarr })" autocomplete="off" spellcheck="false" />
          <p v-if="saved.sonarr?.keySource === 'config.xml'" class="settings-hint">Read from Sonarr's config.xml.</p>
        </div>
        <div class="settings-row settings-row-actions">
          <button type="button" :class="['ui-button', 'ui-button-sm', { 'is-pending': testing === 'sonarr' }]" :disabled="Boolean(testing)" @click="test('sonarr')">
            <template v-if="testing === 'sonarr'"><span class="spinner" aria-hidden="true"></span> Testing…</template><template v-else><pulse-icon /> Test connection</template>
          </button>
        </div>
      </div>
    </div>
    <div class="settings-group" data-setting="radarr">
      <h3 class="ui-group-label">Radarr</h3>
      <div class="ui-group">
        <div v-if="status.radarr" class="settings-row arr-status-row">
          <span :class="['ui-dot', status.radarr.kind === 'ok' ? 'is-ok' : 'is-fail']" aria-hidden="true"></span>
          <span class="settings-toggle-text">
            <span class="settings-row-title">{{ status.radarr.title }}</span>
            <span v-if="status.radarr.detail" class="settings-row-meta"><meta-line :text="status.radarr.detail" /></span>
          </span>
        </div>
        <div class="settings-row" data-setting="radarr-url">
          <label class="field-label" for="settings-radarr-url">Radarr URL</label>
          <input v-no-autofill id="settings-radarr-url" type="url" class="field-input" v-model="form.radarr.url"
            placeholder="http://192.168.1.10:7878" autocomplete="off" spellcheck="false" />
        </div>
        <div class="settings-row" data-setting="radarr-key">
          <label class="field-label" for="settings-radarr-key">API key</label>
          <input v-no-autofill id="settings-radarr-key" type="password" class="field-input" v-model="form.radarr.apiKey"
            :placeholder="keyPlaceholderOf({ app: 'radarr', saved: saved.radarr })" autocomplete="off" spellcheck="false" />
          <p v-if="saved.radarr?.keySource === 'config.xml'" class="settings-hint">Read from Radarr's config.xml.</p>
        </div>
        <div class="settings-row settings-row-actions">
          <button type="button" :class="['ui-button', 'ui-button-sm', { 'is-pending': testing === 'radarr' }]" :disabled="Boolean(testing)" @click="test('radarr')">
            <template v-if="testing === 'radarr'"><span class="spinner" aria-hidden="true"></span> Testing…</template><template v-else><pulse-icon /> Test connection</template>
          </button>
        </div>
      </div>
    </div>
    <div class="settings-group" data-setting="arr-unmonitor">
      <h3 class="ui-group-label">When you delete</h3>
      <div class="ui-group">
        <div class="settings-row">
          <toggle-switch v-model="unmonitor" :pending="!loaded" class="settings-toggle">
            <span class="settings-toggle-text">
              <span class="settings-row-title">Stop downloading it again</span>
              <span class="settings-row-meta">Sonarr and Radarr stop monitoring an episode or film you delete here.</span>
            </span>
          </toggle-switch>
        </div>
      </div>
    </div>
  `,
  setup(_, { expose }) {
    const apps = [
      { key: 'sonarr', name: 'Sonarr', port: 8989 },
      { key: 'radarr', name: 'Radarr', port: 7878 },
    ]
    const saved = reactive({ sonarr: null, radarr: null })
    const form = reactive({ sonarr: { url: '', apiKey: '' }, radarr: { url: '', apiKey: '' } })
    const status = reactive({ sonarr: null, radarr: null })
    const unmonitor = ref(true)
    const loaded = ref(false)
    const finding = ref(false)
    const findText = ref('')
    const testing = ref('')
    let savedUnmonitor = true

    const use = (body) => {
      for (const app of apps) {
        saved[app.key] = body[app.key]
        form[app.key].url = body[app.key].url || ''
        form[app.key].apiKey = ''
      }
      unmonitor.value = body.unmonitorOnDelete
      savedUnmonitor = body.unmonitorOnDelete
      loaded.value = true
    }

    const test = async (app) => {
      testing.value = app
      try {
        await save()
        status[app] = arrStatusOf({ app, result: await api('POST', `/api/arr/${app}/test`, {}) })
      } catch (err) {
        status[app] = { kind: 'err', title: 'Not connected', detail: err.message }
      } finally {
        testing.value = ''
      }
    }

    const load = async () => {
      const body = await api('GET', '/api/arr').catch(() => null)
      if (!body) return
      use(body)
      for (const app of apps) {
        if (body[app.key].url && body[app.key].hasKey) {
          api('POST', `/api/arr/${app.key}/test`, {})
            .then((result) => { status[app.key] = arrStatusOf({ app: app.key, result }) })
            .catch(() => {})
        }
      }
    }

    const find = async () => {
      finding.value = true
      findText.value = ''
      try {
        const found = await api('POST', '/api/arr/find', {})
        for (const app of apps) {
          if (found[app.key]?.url && !form[app.key].url) form[app.key].url = found[app.key].url
        }
        findText.value = findResultText(found)
      } catch (err) {
        findText.value = `Could not look: ${err.message}`
      } finally {
        finding.value = false
      }
    }

    const save = async () => {
      const body = {}
      for (const app of apps) {
        const entry = {}
        if ((saved[app.key]?.url || '') !== form[app.key].url.trim()) entry.url = form[app.key].url.trim()
        if (form[app.key].apiKey.trim()) entry.api_key = form[app.key].apiKey.trim()
        if (Object.keys(entry).length) body[app.key] = entry
      }
      if (unmonitor.value !== savedUnmonitor) body.unmonitor_on_delete = unmonitor.value
      if (!Object.keys(body).length) return
      use(await api('PUT', '/api/arr', body))
    }

    onMounted(load)
    expose({ save, load })
    return { saved, form, status, unmonitor, loaded, finding, findText, testing, keyPlaceholderOf, find, test }
  },
}
