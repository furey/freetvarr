import { ref, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import {
  VERSION_NOTES_URL,
  UPDATING_GUIDE_URL,
  WATCHTOWER_GUIDE_URL,
  changesExistingInstalls,
  isNewerRelease,
  latestReleaseTag,
  updateStepsOf,
} from '/version-check.js'
import { releaseNotesUrlOf } from '/update-card.js'
import { formatUptime } from '/time-format.js'
import { COPIED_FLASH_MS, copyText } from '/components/copy-row.js'
import { serverAbout, fetchServerAbout, releaseUrl } from '/shared/api.js'

const GITHUB_REPO_API = 'https://api.github.com/repos/furey/freetvarr'
const LATEST_RELEASE_KEY = 'freetvarr.latest-release'
const RELEASE_NOTES_KEY = 'freetvarr.release-notes'
const LATEST_RELEASE_TTL_MS = 60 * 60 * 1000
const GITHUB_TIMEOUT_MS = 8000
const GITHUB_MAX_BYTES = 512 * 1024

const readCached = (key) => {
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || 'null')
    return cached && Date.now() - cached.at < LATEST_RELEASE_TTL_MS ? cached.value : undefined
  } catch {
    return undefined
  }
}

const writeCached = (key, value) => {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value }))
  } catch {}
}

const fetchGitHubJson = async (path) => {
  const res = await fetch(`${GITHUB_REPO_API}${path}`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`)
  if (!String(res.headers.get('content-type')).includes('json')) throw new Error('GitHub sent no JSON')
  const text = await res.text()
  if (text.length > GITHUB_MAX_BYTES) throw new Error('GitHub answer too large')
  return JSON.parse(text)
}

const fetchLatestRelease = async () => {
  const cached = readCached(LATEST_RELEASE_KEY)
  if (cached !== undefined) return cached
  const tags = await fetchGitHubJson('/tags?per_page=20')
  const latest = latestReleaseTag(tags.map((tag) => tag.name))
  writeCached(LATEST_RELEASE_KEY, latest)
  return latest
}

const fetchInstallChanges = async (version) => {
  const key = `${RELEASE_NOTES_KEY}.${version}`
  const cached = readCached(key)
  if (cached !== undefined) return cached
  const changes = await fetchGitHubJson(`/releases/tags/${encodeURIComponent(version)}`)
    .then((release) => changesExistingInstalls(release?.body))
    .catch(() => null)
  writeCached(key, changes)
  return changes
}

export const VersionsRow = {
  template: `
    <div class="help-row">
      <div>
        <span class="settings-block-title">Versions</span>
        <dl class="about-list">
          <dt>Freetvarr</dt>
          <dd>
            <a v-if="about.version" :href="releaseUrl(about.version)" target="_blank" rel="noopener noreferrer">{{ about.version }}</a>
            <span v-else class="about-muted">…</span>
          </dd>
          <dt>Updates</dt>
          <dd>
            <button v-if="update.state === 'available'" type="button" class="about-update" :aria-expanded="String(drawerOpen)" aria-controls="update-drawer" @click="drawerOpen = !drawerOpen">{{ update.latest }} available</button>
            <span v-else :class="update.state === 'current' ? 'about-current' : 'about-muted'">{{ updateText }}</span>
          </dd>
          <dt>Build</dt>
          <dd class="about-code">{{ about.build || '…' }}</dd>
          <dt>Uptime</dt>
          <dd>{{ uptimeText }}</dd>
          <dt>TVHeadend</dt>
          <dd :class="{ 'about-muted': !about.tvheadend }">{{ tvheadendText }}</dd>
          <dt>Node</dt>
          <dd>{{ about.node || '…' }}</dd>
        </dl>
      </div>
      <button type="button" class="ui-button" @click="copyAbout" :disabled="!about.version">
        <template v-if="copyState === 'copied'"><check-icon /> Copied</template>
        <template v-else-if="copyState === 'failed'"><cross-icon /> Copy failed</template>
        <template v-else><copy-icon /> Copy</template>
      </button>
    </div>
    <div v-if="drawerOpen && update.state === 'available'" id="update-drawer" class="drawer-card setup-drawer update-drawer" @keydown.esc="drawerOpen = false">
      <div class="update-drawer-head">
        <span class="update-drawer-title">How to update</span>
        <span class="update-drawer-versions">{{ about.version }} → {{ update.latest }}</span>
        <a :href="releaseNotesUrlOf(update.latest)" target="_blank" rel="noopener noreferrer">Release notes</a>
      </div>
      <p v-if="update.changesInstalls" class="setup-hint update-drawer-changes">This update changes something on existing installs. Read the <a :href="VERSION_NOTES_URL" target="_blank" rel="noopener noreferrer">version notes</a> before you update.</p>
      <p class="setup-hint">Run these in a terminal, in the folder that holds <code>docker-compose.yml</code>: the <code>freetvarr</code> folder the install script made. If you set up Freetvarr as a project in a NAS app such as Synology Container Manager, update the project in that app instead.</p>
      <div class="ui-group setup-drawer-group">
        <copy-row v-for="step in updateSteps" :key="step.label" :label="step.label" :value="step.command" />
      </div>
      <p class="setup-hint">Watchtower can update Freetvarr automatically. See <a :href="WATCHTOWER_GUIDE_URL" target="_blank" rel="noopener noreferrer">Update automatically with Watchtower</a>.</p>
      <div class="setup-drawer-actions">
        <a class="ui-button ui-button-secondary" :href="UPDATING_GUIDE_URL" target="_blank" rel="noopener noreferrer">Open the update guide</a>
      </div>
    </div>
  `,
  setup() {
    const tvheadendLoaded = ref(false)
    const update = ref({ state: 'checking', latest: null, changesInstalls: false })
    const drawerOpen = ref(false)
    const updateSteps = computed(() => updateStepsOf(about.value.version))
    const copyState = ref('')
    let copyTimer = null
    const about = serverAbout
    const tvheadendText = computed(() => {
      if (about.value.tvheadend) return about.value.tvheadend
      return tvheadendLoaded.value ? 'not connected' : '…'
    })
    const uptimeFetchedAt = ref(Date.now())
    const nowMs = ref(Date.now())
    let uptimeTimer = null
    watch(() => about.value.uptimeSeconds, () => { uptimeFetchedAt.value = Date.now() })
    const uptimeText = computed(() => {
      if (about.value.uptimeSeconds == null) return '…'
      const elapsedSeconds = Math.max(0, (nowMs.value - uptimeFetchedAt.value) / 1000)
      return formatUptime(about.value.uptimeSeconds + elapsedSeconds)
    })
    const updateText = computed(() => ({
      checking: 'Checking…',
      current: 'Up to date',
      failed: "Couldn't check for updates",
    })[update.value.state] || '')
    const aboutLines = () => [
      `Freetvarr ${about.value.version}`,
      `Build ${about.value.build}`,
      `Uptime ${uptimeText.value}`,
      `TVHeadend ${about.value.tvheadend || 'not connected'}`,
      `Node ${about.value.node}`,
    ].join('\n')
    const flashCopy = (state) => {
      copyState.value = state
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => { copyState.value = '' }, COPIED_FLASH_MS)
    }
    const copyAbout = async () => {
      try {
        await copyText(aboutLines())
        flashCopy('copied')
      } catch {
        flashCopy('failed')
      }
    }
    const loadTvheadendVersion = async () => {
      await fetchServerAbout('?tvheadend=1').catch(() => {})
      tvheadendLoaded.value = true
    }
    const checkForUpdate = async () => {
      try {
        const [latest] = await Promise.all([fetchLatestRelease(), about.value.version || fetchServerAbout()])
        const state = isNewerRelease({ current: about.value.version, latest }) ? 'available' : 'current'
        update.value = { state: latest ? state : 'failed', latest, changesInstalls: false }
        if (state === 'available') checkInstallChanges(latest)
      } catch {
        update.value = { state: 'failed', latest: null, changesInstalls: false }
      }
    }
    const checkInstallChanges = async (latest) => {
      const changesInstalls = await fetchInstallChanges(latest)
      if (update.value.latest === latest) update.value = { ...update.value, changesInstalls: Boolean(changesInstalls) }
    }
    onMounted(() => {
      loadTvheadendVersion()
      checkForUpdate()
      uptimeTimer = setInterval(() => { nowMs.value = Date.now() }, 1000)
    })
    onUnmounted(() => {
      clearTimeout(copyTimer)
      clearInterval(uptimeTimer)
    })
    return {
      about,
      update,
      updateText,
      uptimeText,
      tvheadendText,
      copyState,
      copyAbout,
      releaseUrl,
      releaseNotesUrlOf,
      drawerOpen,
      updateSteps,
      VERSION_NOTES_URL,
      UPDATING_GUIDE_URL,
      WATCHTOWER_GUIDE_URL,
    }
  },
}
