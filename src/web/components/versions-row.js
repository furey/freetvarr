import { ref, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { isNewerRelease, latestReleaseTag } from '/version-check.js'
import { formatUptime } from '/time-format.js'
import { COPIED_FLASH_MS, copyText } from '/components/copy-row.js'
import { serverAbout, fetchServerAbout, releaseUrl } from '/shared/api.js'

const LATEST_RELEASE_KEY = 'freetvarr.latest-release'
const LATEST_RELEASE_TTL_MS = 60 * 60 * 1000

const readCachedLatestRelease = () => {
  try {
    const cached = JSON.parse(sessionStorage.getItem(LATEST_RELEASE_KEY) || 'null')
    return cached && Date.now() - cached.at < LATEST_RELEASE_TTL_MS ? cached.latest : undefined
  } catch {
    return undefined
  }
}

const cacheLatestRelease = (latest) => {
  try {
    sessionStorage.setItem(LATEST_RELEASE_KEY, JSON.stringify({ at: Date.now(), latest }))
  } catch {}
}

const fetchLatestRelease = async () => {
  const cached = readCachedLatestRelease()
  if (cached !== undefined) return cached
  const res = await fetch('https://api.github.com/repos/furey/freetvarr/tags?per_page=20', {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`)
  const tags = await res.json()
  const latest = latestReleaseTag(tags.map((tag) => tag.name))
  cacheLatestRelease(latest)
  return latest
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
            <a v-if="update.state === 'available'" :href="releaseUrl(update.latest)" target="_blank" rel="noopener noreferrer" class="about-update">{{ update.latest }} available</a>
            <span v-else :class="update.state === 'current' ? 'about-current' : 'about-muted'">{{ updateText }}</span>
          </dd>
          <dt>Build</dt>
          <dd>{{ about.build || '…' }}</dd>
          <dt>Uptime</dt>
          <dd>{{ uptimeText }}</dd>
          <dt>TVHeadend</dt>
          <dd :class="{ 'about-muted': !about.tvheadend }">{{ tvheadendText }}</dd>
          <dt>Node</dt>
          <dd>{{ about.node || '…' }}</dd>
        </dl>
      </div>
      <button type="button" class="btn" @click="copyAbout" :disabled="!about.version">
        <template v-if="copyState === 'copied'"><check-icon /> Copied</template>
        <template v-else-if="copyState === 'failed'"><cross-icon /> Copy failed</template>
        <template v-else><copy-icon /> Copy</template>
      </button>
    </div>
  `,
  setup() {
    const tvheadendLoaded = ref(false)
    const update = ref({ state: 'checking', latest: null })
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
        update.value = { state: latest ? state : 'failed', latest }
      } catch {
        update.value = { state: 'failed', latest: null }
      }
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
    return { about, update, updateText, uptimeText, tvheadendText, copyState, copyAbout, releaseUrl }
  },
}
