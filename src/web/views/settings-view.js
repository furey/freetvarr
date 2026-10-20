import { ref, onMounted, onUnmounted, watch, nextTick } from '/vendor/vue.esm-browser.prod.js'
import {
  CUSTOM_SYNC_SCHEDULE,
  DEFAULT_SYNC_CRON,
  SYNC_SCHEDULE_PRESETS,
  normaliseCron,
  syncSchedulePreset,
} from '/sync-schedule.js'
import { resetConfirm, restoreOpenAccessConfirm } from '/confirm-copy.js'
import { useConfirm } from '/components/dialogs.js'
import { dataCreditsOf } from '/data-credits.js'
import { holdAtLeast } from '/pending.js'
import { api, fetchSettings } from '/shared/api.js'
import { FLASH_DEFAULT_MS } from '/shared/composables.js'
import { tvhDetectSummary, tvhTestSummary } from '/shared/format.js'
import {
  makeStatus,
  usePathCheck,
  recordingsFolderStatus,
  tvhRecordingsPathStatus,
} from '/shared/path-check.js'
import { routeSection, routeSectionId, scrollToRouteSection } from '/shared/router.js'
import { loadSyncStatus } from '/shared/sync-status.js'
import { tz, browserTimeZone } from '/shared/time.js'

const SETTINGS_SECTIONS = [
  { id: 'tvheadend', label: 'TVHeadend' },
  { id: 'storage', label: 'Storage' },
  { id: 'plex', label: 'Plex' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'pictures', label: 'Pictures' },
  { id: 'ad-removal', label: 'Ad removal' },
  { id: 'tv-apps', label: 'TV apps' },
  { id: 'help', label: 'Help' },
  { id: 'danger-zone', label: 'Reset' },
]
const SETTINGS_SECTION_GAP_PX = 24
const LICENCES = [
  { name: 'Freetvarr', note: 'By James Furey.', licence: 'GPL-3.0-or-later', href: 'https://github.com/furey/freetvarr/blob/main/LICENSE' },
  { name: 'Figtree', note: 'Interface typeface, by Erik Kennedy.', licence: 'SIL OFL 1.1', href: '/fonts/figtree-OFL.txt' },
  { name: 'Geist Mono', note: 'Typeface for paths and code.', licence: 'SIL OFL 1.1', href: '/fonts/geist-mono-OFL.txt' },
  { name: 'Vue', note: 'Interface framework.', licence: 'MIT', href: 'https://github.com/vuejs/core/blob/main/LICENSE' },
  { name: 'Hold music', note: '"Local Forecast – Elevator" by Kevin MacLeod (incompetech.com).', licence: 'CC BY 4.0', href: 'https://creativecommons.org/licenses/by/4.0/' },
]
const DEFAULT_PLEX_PREFS_PATH = '/plex/Library/Application Support/Plex Media Server/Preferences.xml'

const isCustomPlexPrefsPath = (path) => Boolean(path) && path !== DEFAULT_PLEX_PREFS_PATH

const isScrolledToBottom = () =>
  window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4

const sectionTop = (id) => document.getElementById(`section-${id}`)?.getBoundingClientRect().top

const sectionInView = (id) => {
  const top = sectionTop(id)
  return top !== undefined && top < window.innerHeight
}

const sectionOnScreen = (navBottom) => {
  const line = navBottom + SETTINGS_SECTION_GAP_PX
  const lastId = SETTINGS_SECTIONS.at(-1).id
  if (isScrolledToBottom()) {
    const routed = SETTINGS_SECTIONS.find(({ id }) => id === routeSectionId())
    return routed && sectionInView(routed.id) ? routed.id : lastId
  }
  return SETTINGS_SECTIONS.reduce((current, { id }) => {
    const top = sectionTop(id)
    return top !== undefined && top <= line ? id : current
  }, SETTINGS_SECTIONS[0].id)
}

const revealActiveLink = (nav) => {
  const link = nav?.querySelector('[data-active="true"]')
  if (!link) return
  const start = link.offsetLeft - SETTINGS_SECTION_GAP_PX
  const end = link.offsetLeft + link.offsetWidth + SETTINGS_SECTION_GAP_PX
  if (start < nav.scrollLeft) nav.scrollLeft = start
  else if (end > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = end - nav.clientWidth
}

const useSettingsSections = () => {
  const sectionNav = ref(null)
  const activeSection = ref(SETTINGS_SECTIONS[0].id)
  let frame = 0
  const publishNavHeight = () => {
    document.documentElement.style.setProperty('--settings-nav-h', `${sectionNav.value?.offsetHeight ?? 0}px`)
  }
  const navObserver = new ResizeObserver(publishNavHeight)
  const trackSection = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      activeSection.value = sectionOnScreen(sectionNav.value?.getBoundingClientRect().bottom ?? 0)
    })
  }
  const openSection = (event, id) => {
    if (routeSectionId() !== id) return
    event.preventDefault()
    scrollToRouteSection()
  }
  onMounted(() => {
    publishNavHeight()
    navObserver.observe(sectionNav.value)
    window.addEventListener('scroll', trackSection, { passive: true })
    window.addEventListener('resize', trackSection, { passive: true })
    trackSection()
  })
  onUnmounted(() => {
    navObserver.disconnect()
    cancelAnimationFrame(frame)
    window.removeEventListener('scroll', trackSection)
    window.removeEventListener('resize', trackSection)
    document.documentElement.style.removeProperty('--settings-nav-h')
  })
  watch(activeSection, async () => {
    await nextTick()
    revealActiveLink(sectionNav.value)
  })
  return { sections: SETTINGS_SECTIONS, sectionNav, activeSection, openSection }
}

export const SettingsView = {
  template: `
    <div class="view-reveal settings-page pb-24">
      <nav ref="sectionNav" class="settings-sections" aria-label="Settings sections">
        <a v-for="s in sections" :key="s.id" :href="'#/settings/' + s.id"
          :data-active="activeSection === s.id" :aria-current="activeSection === s.id ? 'location' : null"
          class="settings-section-link" @click="openSection($event, s.id)">{{ s.label }}</a>
      </nav>
      <form id="settings-form" @submit.prevent="save" class="settings-form">
        <section id="section-tvheadend" class="settings-section">
          <p class="settings-intro">
            The address and login Freetvarr uses to read the guide, channels, and recordings, and to set recordings.
            <info-button title="TVHeadend" doc="guide/tvheadend">
              <p>The address and login Freetvarr uses for the TVHeadend API. Freetvarr reads the guide, channels, and recordings from it, and sets and cancels recordings.</p>
              <p><strong>Auto-discover TVHeadend</strong> looks for TVHeadend on your network. The TVHeadend user needs the rights in the setup guide.</p>
            </info-button>
          </p>
          <div class="settings-group">
            <h3 class="ui-group-label">Server</h3>
            <div class="ui-group">
              <div class="settings-row settings-row-actions">
                <button type="button" class="btn" @click="detectTvh" :disabled="tvhDetecting">
                  <template v-if="tvhDetecting">Scanning…</template><template v-else><search-icon /> Auto-discover TVHeadend</template>
                </button>
                <span v-if="tvhDiscoverText" :class="['status-readout', tvhDiscoverKind]">{{ tvhDiscoverText }}</span>
                <span v-else class="settings-row-meta">Looks on this computer, port 9981.</span>
              </div>
              <div v-if="tvhCandidates.length > 1" class="settings-row">
                <p class="settings-row-meta">Several TVHeadend servers answered. Pick one:</p>
                <div class="settings-row-actions">
                  <button v-for="c in tvhCandidates" :key="c.url" type="button" class="btn btn-sm" @click="useTvhCandidate(c)">
                    Use {{ c.url }}
                  </button>
                </div>
              </div>
              <div class="settings-row">
                <label class="field-label" for="settings-tvh-url">TVHeadend URL</label>
                <input v-no-autofill id="settings-tvh-url" type="text" class="field-input" v-model="tvhUrl" placeholder="e.g. http://192.168.1.10:9981" />
              </div>
              <div class="settings-row settings-row-split">
                <div>
                  <label class="field-label" for="settings-tvh-username">Username</label>
                  <input v-no-autofill id="settings-tvh-username" type="text" class="field-input" v-model="tvhUsername" placeholder="blank if TVHeadend is open" />
                </div>
                <div>
                  <label class="field-label" for="settings-tvh-password">Password</label>
                  <input v-no-autofill id="settings-tvh-password" type="password" class="field-input" v-model="tvhPassword"
                    :placeholder="tvhPasswordSet ? '••••• (stored)' : 'blank if TVHeadend is open'" autocomplete="off" />
                  <p class="settings-hint">Blank keeps the stored password.</p>
                </div>
              </div>
              <div class="settings-row settings-row-actions">
                <button type="button" class="btn" @click="testTvh" :disabled="tvhTesting">
                  <template v-if="tvhTesting">Testing…</template><template v-else><pulse-icon /> Test connection</template>
                </button>
                <span v-if="tvhStatus" :class="['status-readout', tvhStatusKind]">{{ tvhStatus }}</span>
              </div>
            </div>
          </div>
          <div v-if="tvhOpenEntryBackupSet" class="settings-group">
            <h3 class="ui-group-label">Open access</h3>
            <div class="ui-group">
              <div class="settings-row settings-row-actions">
                <button type="button" class="btn btn-sm" @click="askUndoTvhSecure" :disabled="tvhUndoing">
                  <template v-if="tvhUndoing">Restoring…</template><template v-else>Restore open access</template>
                </button>
                <span v-if="tvhUndoText" :class="['status-readout', tvhUndoKind]">{{ tvhUndoText }}</span>
                <span v-else class="settings-row-meta">Undoes Secure and connect from setup: anyone on your network can change TVHeadend again. The logins stay.</span>
              </div>
            </div>
          </div>
          <tuner-status-panel />
        </section>

        <section id="section-storage" class="settings-section">
          <p class="settings-intro">
            Where recordings come from and where Freetvarr files them.
            <info-button title="Recording folders" doc="guide/configuration#the-two-recordings-paths">
              <ul><li><strong>Media root</strong>: where imported episodes go. Plex reads this folder.</li><li><strong>One-off folder</strong>: where single recordings go, such as sport and specials. Point a separate Plex library at it.</li><li><strong>Recordings folder (as Freetvarr sees it)</strong>: the TVHeadend recordings folder, at the path Freetvarr uses.</li><li><strong>Recordings folder (as TVHeadend sees it)</strong>: the same folder, at the path TVHeadend reports.</li></ul>
              <p>When both apps see the folder at the same path, the two recordings paths are the same. Keep the recordings and the media root inside one shared folder: imports are then instant and use no extra disk space.</p>
            </info-button>
          </p>
          <div class="settings-group">
            <h3 class="ui-group-label">Library folders</h3>
            <div class="ui-group">
              <div class="settings-row">
                <label class="field-label" for="settings-media-root">Media root <span class="settings-label-note">(inside container)</span></label>
                <div class="field-action">
                  <div class="field-action-controls">
                    <input v-no-autofill id="settings-media-root" type="text" :class="['field-input', { 'is-invalid': mediaRootStatus && mediaRootStatusKind === 'err' }]" v-model="mediaRoot" placeholder="/data/media/tv" />
                    <button type="button" :class="['btn', { 'is-pending': mediaRootTesting }]" @click="testMediaRoot" :disabled="mediaRootTesting">
                      <template v-if="mediaRootTesting"><span class="spinner" aria-hidden="true"></span> Testing…</template><template v-else><pulse-icon /> Test path</template>
                    </button>
                  </div>
                </div>
                <p v-if="mediaRootStatus" :class="['status-readout', 'field-status', mediaRootStatusKind]" role="status">{{ mediaRootStatus }}</p>
                <p class="settings-hint">The folder Freetvarr saves TV episodes to. Plex reads it. Enter the path Freetvarr sees, from the <code>volumes</code> in <code>docker-compose.yml</code>. If you change the folder there, change it here too.</p>
              </div>
              <div class="settings-row">
                <label class="field-label" for="settings-oneoff-root">One-off folder <span class="settings-label-note">(inside container)</span></label>
                <div class="field-action">
                  <div class="field-action-controls">
                    <input v-no-autofill id="settings-oneoff-root" type="text" :class="['field-input', { 'is-invalid': oneOffRootStatus && oneOffRootStatusKind === 'err' }]" v-model="oneOffRoot" placeholder="/data/media/one-offs" />
                    <button type="button" :class="['btn', { 'is-pending': oneOffRootTesting }]" @click="testOneOffRoot" :disabled="oneOffRootTesting">
                      <template v-if="oneOffRootTesting"><span class="spinner" aria-hidden="true"></span> Testing…</template><template v-else><pulse-icon /> Test path</template>
                    </button>
                  </div>
                </div>
                <p v-if="oneOffRootStatus" :class="['status-readout', 'field-status', oneOffRootStatusKind]" role="status">{{ oneOffRootStatus }}</p>
                <p class="settings-hint">Recordings that match no series go here, one folder per title. In Plex, add an "Other Videos" library for this folder.</p>
              </div>
              <div class="settings-row">
                <label class="field-label" for="settings-movies-root">Movies folder <span class="settings-label-note">(inside container, optional)</span></label>
                <div class="field-action">
                  <div class="field-action-controls">
                    <input v-no-autofill id="settings-movies-root" type="text" :class="['field-input', { 'is-invalid': moviesRootStatus && moviesRootStatusKind === 'err' }]" v-model="moviesRoot" placeholder="empty: films go to the one-off folder" />
                    <button type="button" :class="['btn', { 'is-pending': moviesRootTesting }]" @click="testMoviesRoot" :disabled="moviesRootTesting || !moviesRoot.trim()">
                      <template v-if="moviesRootTesting"><span class="spinner" aria-hidden="true"></span> Testing…</template><template v-else><pulse-icon /> Test path</template>
                    </button>
                  </div>
                </div>
                <p v-if="moviesRootStatus" :class="['status-readout', 'field-status', moviesRootStatusKind]" role="status">{{ moviesRootStatus }}</p>
                <p class="settings-hint">Films that match no series go here, as <code>Title (Year)/Title (Year).ts</code>. In Plex, add a "Movies" library for this folder.</p>
              </div>
            </div>
          </div>
          <div class="settings-group">
            <h3 class="ui-group-label">Recordings folder</h3>
            <div class="ui-group">
              <div class="settings-row">
                <label class="field-label" for="settings-recordings-root">As Freetvarr sees it</label>
                <div class="field-action">
                  <div class="field-action-controls">
                    <input v-no-autofill id="settings-recordings-root" type="text" :class="['field-input', { 'is-invalid': recordingsCheck.text && recordingsCheck.kind === 'err' }]" v-model="recordingsRoot" placeholder="/data/recordings" />
                    <button type="button" :class="['btn', { 'is-pending': recordingsCheck.checking }]" @click="recordingsCheck.run" :disabled="recordingsCheck.checking">
                      <template v-if="recordingsCheck.checking"><span class="spinner" aria-hidden="true"></span> Checking…</template><template v-else><pulse-icon /> Test path</template>
                    </button>
                  </div>
                </div>
                <p v-if="recordingsCheck.text" :class="['status-readout', 'field-status', recordingsCheck.kind]" role="status">{{ recordingsCheck.text }}</p>
              </div>
              <div class="settings-row">
                <label class="field-label" for="settings-tvh-recordings-path">As TVHeadend sees it</label>
                <div class="field-action">
                  <div class="field-action-controls">
                    <input v-no-autofill id="settings-tvh-recordings-path" type="text" :class="['field-input', { 'is-invalid': tvhPathCheck.text && tvhPathCheck.kind === 'err' }]" v-model="tvhRecordingsPath" placeholder="/recordings" />
                    <button type="button" :class="['btn', { 'is-pending': tvhPathCheck.checking }]" @click="tvhPathCheck.run" :disabled="tvhPathCheck.checking">
                      <template v-if="tvhPathCheck.checking"><span class="spinner" aria-hidden="true"></span> Checking…</template><template v-else><pulse-icon /> Check TVHeadend</template>
                    </button>
                  </div>
                </div>
                <p v-if="tvhPathCheck.text" :class="['status-readout', 'field-status', tvhPathCheck.kind]" role="status">{{ tvhPathCheck.text }}</p>
              </div>
            </div>
            <p class="settings-note">TVHeadend and Freetvarr must share this folder. Each can see it at a different path; enter the path each one sees.</p>
          </div>
          <live-streams-setting />
        </section>

        <section id="section-plex" class="settings-section">
          <p class="settings-intro">
            What goes into your library, and how Freetvarr tells Plex about it.
            <info-button title="Plex" doc="guide/plex">
              <p>Optional. After a sync imports an episode, Freetvarr asks Plex to refresh the library section, so new episodes show up without a manual scan.</p>
              <p>Freetvarr needs the Plex address, a token, and the section. Without Plex, Freetvarr still imports and files episodes.</p>
            </info-button>
          </p>
          <div class="settings-group">
            <h3 class="ui-group-label">Library</h3>
            <div class="ui-group">
              <div class="settings-row">
                <toggle-switch v-model="addToLibraryDefault" class="settings-toggle">
                  <span class="settings-toggle-text">
                    <span class="settings-row-title">Add to library by default</span>
                    <span class="settings-row-meta">New recordings you set in the TV guide start with Add to library on. You can still change it for each recording.</span>
                  </span>
                </toggle-switch>
              </div>
              <div class="settings-row">
                <toggle-switch v-model="importUnmatched" class="settings-toggle">
                  <span class="settings-toggle-text">
                    <span class="settings-row-title">Import every recording</span>
                    <span class="settings-row-meta">On: a recording that matches no series goes to the one-off folder, or to the movies folder if it is a film. Off: Freetvarr imports only your series, and recordings you made with Add to library on. The others stay in TVHeadend; you can import them from the Recording log.</span>
                  </span>
                </toggle-switch>
              </div>
            </div>
          </div>
          <div class="settings-group">
            <h3 class="ui-group-label">Plex server</h3>
            <div class="ui-group">
              <div class="settings-row settings-row-actions">
                <button type="button" class="btn" @click="discoverPlex" :disabled="plexDiscovering">
                  <template v-if="plexDiscovering">Scanning…</template><template v-else><search-icon /> Auto-discover Plex</template>
                </button>
                <span v-if="plexDiscoverText" :class="['status-readout', plexDiscoverKind]">{{ plexDiscoverText }}</span>
                <span v-else class="settings-row-meta">Looks on your home network.</span>
              </div>
              <div v-if="plexCandidates.length > 1" class="settings-row">
                <p class="settings-row-meta">Freetvarr found more than one Plex server. Pick yours:</p>
                <div class="settings-row-actions">
                  <button v-for="c in plexCandidates" :key="c.ip + ':' + c.port" type="button" class="btn btn-sm" @click="usePlexCandidate(c)">
                    Use {{ c.name || 'Plex' }} ({{ c.ip }}:{{ c.port }})
                  </button>
                </div>
              </div>
              <div class="settings-row">
                <label class="field-label" for="settings-plex-url">Plex URL</label>
                <input v-no-autofill id="settings-plex-url" type="text" class="field-input" v-model="plexUrl" placeholder="http://127.0.0.1:32400" />
              </div>
              <div class="settings-row">
                <label class="field-label" for="settings-plex-token">Plex token</label>
                <div class="field-action">
                  <div class="field-action-controls">
                    <input v-no-autofill id="settings-plex-token" type="password" :class="['field-input', { 'is-invalid': plexTokenStatus && plexTokenStatusKind === 'err' }]" v-model="plexToken"
                      :placeholder="plexTokenSet ? '••••• (stored)' : 'paste your Plex token'" autocomplete="off" />
                    <button type="button" :class="['btn', { 'is-pending': plexDetecting }]" @click="detectPlexToken" :disabled="plexDetecting">
                      <template v-if="plexDetecting"><span class="spinner" aria-hidden="true"></span> Detecting…</template><template v-else><bolt-icon /> Auto-detect token</template>
                    </button>
                  </div>
                </div>
                <p v-if="plexTokenStatus" :class="['status-readout', 'field-status', plexTokenStatusKind]" role="status">{{ plexTokenStatus }}</p>
                <p class="settings-hint">Auto-detect token reads the token from Plex's settings file. It works with the Plex in Freetvarr's compose file.</p>
                <details class="settings-disclosure" :open="plexPrefsOpen">
                  <summary>Token not found?</summary>
                  <div class="settings-disclosure-body">
                    <p class="settings-hint">
                      If you installed Plex yourself, share the folder that holds its <code>Preferences.xml</code> with Freetvarr in <code>docker-compose.yml</code>, then enter the path Freetvarr sees below. Or paste the token from Plex; <a href="https://furey.github.io/freetvarr/guide/plex#the-token" target="_blank" rel="noopener noreferrer">the Plex guide</a> says where to find it.
                    </p>
                    <label class="field-label" for="settings-plex-prefs">Preferences.xml path <span class="settings-label-note">(inside container)</span></label>
                    <input v-no-autofill id="settings-plex-prefs" type="text" class="field-input" v-model="plexPrefsPath" :placeholder="defaultPlexPrefsPath" />
                  </div>
                </details>
              </div>
            </div>
          </div>
          <div class="settings-group">
            <h3 class="ui-group-label">Plex libraries</h3>
            <div class="ui-group">
              <div class="settings-row">
                <label class="field-label" for="settings-plex-tv">TV section</label>
                <select v-if="plexSections.length" id="settings-plex-tv" class="field-input" v-model="plexSectionId">
                  <option value="">Pick a section</option>
                  <option v-for="sec in plexSections" :key="sec.key" :value="sec.key">
                    {{ sec.title }} (#{{ sec.key }}, {{ sec.type }})
                  </option>
                </select>
                <input v-no-autofill v-else id="settings-plex-tv" type="text" class="field-input" v-model="plexSectionId"
                  placeholder="section number; Load sections lists them" />
              </div>
              <div class="settings-row">
                <label class="field-label" for="settings-plex-oneoff">One-off section</label>
                <select v-if="plexSections.length" id="settings-plex-oneoff" class="field-input" v-model="plexOneOffSectionId">
                  <option value="">None</option>
                  <option v-for="sec in plexSections" :key="sec.key" :value="sec.key">
                    {{ sec.title }} (#{{ sec.key }}, {{ sec.type }})
                  </option>
                </select>
                <input v-no-autofill v-else id="settings-plex-oneoff" type="text" class="field-input" v-model="plexOneOffSectionId"
                  placeholder="section number of the one-off library" />
              </div>
              <div class="settings-row">
                <label class="field-label" for="settings-plex-movies">Movies section</label>
                <select v-if="plexSections.length" id="settings-plex-movies" class="field-input" v-model="plexMoviesSectionId">
                  <option value="">None</option>
                  <option v-for="sec in plexSections" :key="sec.key" :value="sec.key">
                    {{ sec.title }} (#{{ sec.key }}, {{ sec.type }})
                  </option>
                </select>
                <input v-no-autofill v-else id="settings-plex-movies" type="text" class="field-input" v-model="plexMoviesSectionId"
                  placeholder="section number of the movies library" />
              </div>
              <div class="settings-row settings-row-actions">
                <button type="button" class="btn btn-sm" @click="loadPlexSections" :disabled="plexProbing">
                  <template v-if="plexProbing">Loading…</template><template v-else><download-icon /> Load sections</template>
                </button>
                <button type="button" class="btn btn-sm" @click="refreshPlexNow" :disabled="plexRefreshing">
                  <template v-if="plexRefreshing">Refreshing…</template><template v-else><refresh-icon /> Refresh Plex now</template>
                </button>
                <span v-if="plexStatus" :class="['status-readout', plexStatusKind]">{{ plexStatus }}</span>
              </div>
              <plex-library-setup class="settings-row" :plex-url="plexUrl" :plex-token="plexToken" :loads="plexSectionLoads"
                @created="usePlexLibraries" />
              <div class="settings-row">
                <toggle-switch v-model="deleteAfterPlexRefreshOnly" class="settings-toggle">
                  <span class="settings-toggle-text">
                    <span class="settings-row-title">Wait for Plex before removing recordings from TVHeadend</span>
                    <span class="settings-row-meta">Recommended: if Plex does not answer, the recording stays in TVHeadend.</span>
                  </span>
                </toggle-switch>
              </div>
            </div>
          </div>
        </section>

        <section id="section-schedule" class="settings-section">
          <p class="settings-intro">
            The time zone Freetvarr uses, and when it checks TVHeadend for new recordings.
            <info-button title="Schedule" doc="guide/syncs#scheduled-and-manual">
              <p>The time zone Freetvarr uses for the guide, recordings, and the sync schedule. A <code>TZ</code> value in your .env file only fills in the first choice; the zone you save here wins.</p>
              <p>How often Freetvarr checks TVHeadend for new recordings to import. <strong>Custom</strong> takes a cron expression, such as <code>0 */2 * * *</code> for every two hours.</p>
              <p>A change applies without a restart. <strong>Sync now</strong> on the <strong>Health</strong> page runs a sync at any time.</p>
            </info-button>
          </p>
          <div class="settings-group">
            <h3 class="ui-group-label">Time zone</h3>
            <div class="ui-group">
              <div class="settings-row">
                <time-zone-field v-model="timeZone" :source="tzSource" />
              </div>
            </div>
          </div>
          <div class="settings-group">
            <h3 class="ui-group-label">Syncs</h3>
            <div class="ui-group">
              <div class="settings-row">
                <label class="field-label" for="settings-sync-schedule">Sync schedule</label>
                <select id="settings-sync-schedule" class="field-input" v-model="syncSchedule">
                  <option v-for="preset in syncSchedulePresets" :key="preset.cron" :value="preset.cron">{{ preset.label }}</option>
                  <option :value="customSyncSchedule">Custom</option>
                </select>
              </div>
              <div v-if="syncSchedule === customSyncSchedule" class="settings-row">
                <label class="field-label" for="settings-sync-cron">Custom schedule <span class="settings-label-note">(cron)</span></label>
                <input v-no-autofill id="settings-sync-cron" type="text" class="field-input ui-mono-input" v-model="syncCron" placeholder="0 */2 * * *" />
                <p class="settings-hint">
                  Five fields: minute, hour, day of month, month, day of week. <code>0 */2 * * *</code> is every two hours.
                </p>
                <p v-if="syncCronEffective && syncCronEffective !== syncCron.trim()" class="settings-hint">
                  Freetvarr syncs on <code>{{ syncCronEffective }}</code> until you save a valid schedule.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="section-pictures" class="settings-section">
          <p class="settings-intro">
            Where missing programme pictures come from.
            <info-button title="Pictures" doc="guide/tv-guide#missing-pictures">
              <p>Most programme pictures come from the TV guide. When a guide picture is missing, Freetvarr uses the show's poster from your Plex library, then from TVmaze, a free online TV database. For films and other shows TVmaze does not list, it finds the matching Wikipedia article through Wikidata and uses its picture, or the TMDB poster when you add a TMDB key.</p>
              <p>A lookup sends the programme title to those services. Turn it off to keep every title on your network.</p>
            </info-button>
          </p>
          <div class="settings-group">
            <h3 class="ui-group-label">Missing pictures</h3>
            <div class="ui-group">
              <div class="settings-row">
                <toggle-switch v-model="showArtworkLookup" class="settings-toggle">
                  <span class="settings-toggle-text">
                    <span class="settings-row-title">Look up missing pictures online</span>
                    <span class="settings-row-meta">On: when the guide and Plex have no picture for a show, Freetvarr sends the title to TVmaze, Wikidata, and Wikipedia (and TMDB, with a key) and uses the picture it finds. Off: those shows get a title card.</span>
                  </span>
                </toggle-switch>
              </div>
            </div>
            <p class="settings-note"><a href="https://www.tvmaze.com" target="_blank" rel="noopener">TVmaze</a> is a free online TV database. Wikipedia pictures keep their own licences.</p>
          </div>
          <tmdb-key-setting />
        </section>

        <section id="section-ad-removal" class="settings-section">
          <p class="settings-intro">
            Optional. Finds the ad breaks in a recording, and can cut them out.
            <info-button title="Ad removal" doc="guide/ad-removal">
              <p>Finds the ad breaks in a recording with comskip, and can cut them out with ffmpeg. Both come with Freetvarr.</p>
              <p>Turn it on here, then set a mode for each series under <strong>Series rules</strong>. <strong>Detect</strong> saves the breaks in a <code>.edl</code> file beside the video, so apps that read it skip them. <strong>Cut</strong> removes them and keeps the original for a set number of days.</p>
              <p>Detection is not always right. Use <strong>Detect</strong> on a channel first, and check the breaks before you let it cut.</p>
            </info-button>
          </p>
          <div class="settings-group">
            <h3 class="ui-group-label">Ad removal</h3>
            <div class="ui-group">
              <div class="settings-row">
                <toggle-switch v-model="adRemovalEnabled" class="settings-toggle">
                  <span class="settings-toggle-text">
                    <span class="settings-row-title">Enable ad removal</span>
                    <span class="settings-row-meta">Set the mode for each series under Series rules.</span>
                  </span>
                </toggle-switch>
              </div>
              <div class="settings-row settings-row-inline">
                <label class="settings-row-title" for="settings-ad-retention">Keep the original after a cut for (days)</label>
                <input v-no-autofill id="settings-ad-retention" type="number" min="1" class="field-input settings-number" v-model="adOriginalRetentionDays" />
              </div>
              <div class="settings-row settings-row-inline">
                <span class="settings-row-title">Detection settings</span>
                <span class="ui-group-row-value">{{ comskipIniOverride ? 'your /config/comskip.ini' : 'built in, tuned for Australian free-to-air' }}</span>
              </div>
            </div>
            <p class="settings-note">
              Finding the ads uses a lot of processor time: expect several minutes for each episode. Cut saves the recording again without the ads, at the same picture quality, and keeps the original as <code>&lt;file&gt;.ts.orig</code> for the days above. Detection works better on some channels than others, so try Detect before you use Cut.
            </p>
          </div>
        </section>
      </form>

      <div class="settings-save-bar">
        <div class="settings-save-bar-inner">
          <span v-if="status" :class="['status-readout', statusKind]" role="status">{{ status }}</span>
          <span v-else class="settings-save-hint">Changes apply when you save.</span>
          <button type="submit" form="settings-form" :class="['ui-button', 'ui-button-primary', { 'is-pending': saving }]" :disabled="saving" :aria-busy="saving">
            <template v-if="saving"><span class="spinner" aria-hidden="true"></span> Saving…</template><template v-else><check-icon /> Save settings</template>
          </button>
        </div>
      </div>

      <tv-apps-panel :tvh-url="tvhUrl" />

      <section id="section-help" class="settings-section">
        <div class="settings-group">
          <h3 class="ui-group-label">Setup</h3>
          <div class="ui-group">
            <a class="settings-row settings-row-inline settings-row-link" href="#/settings/system/setup">
              <span class="settings-toggle-text">
                <span class="settings-row-title">Setup</span>
                <span class="settings-row-meta">Check or change TVHeadend, channels, the guide, folders, and Plex, or run setup from the start.</span>
              </span>
              <chevron-glyph class="ui-group-row-chevron" />
            </a>
            <a class="settings-row settings-row-inline settings-row-link" href="#/settings/system/health">
              <span class="settings-toggle-text">
                <span class="settings-row-title">Health checks</span>
                <span class="settings-row-meta">The Doctor checks the TVHeadend login and rights, the tuners, the guide, the folders, Plex, and live TV, then says what to fix.</span>
              </span>
              <chevron-glyph class="ui-group-row-chevron" />
            </a>
          </div>
        </div>
        <div class="settings-group">
          <div class="settings-group-head">
            <h3 class="ui-group-label">Versions</h3>
            <info-button title="Versions" doc="guide/troubleshooting#reporting-a-bug">
              <p>The versions Freetvarr is running with. Include them when you report a bug. <strong>Copy</strong> puts them on the clipboard as plain text. The update check asks GitHub for the newest Freetvarr release, from this browser.</p>
            </info-button>
          </div>
          <div class="ui-group settings-versions">
            <versions-row />
          </div>
        </div>
        <div id="section-licences" class="settings-group">
          <h3 class="ui-group-label">Licences</h3>
          <div class="ui-group">
            <div v-for="item in licences" :key="item.name" class="settings-row settings-row-inline">
              <span class="settings-toggle-text">
                <span class="settings-row-title">{{ item.name }}</span>
                <span class="settings-row-meta">{{ item.note }}</span>
              </span>
              <a :href="item.href" target="_blank" rel="noopener noreferrer" class="settings-licence-link">{{ item.licence }}</a>
            </div>
            <div v-for="credit in dataCredits" :key="credit.name" class="settings-row settings-row-inline">
              <span class="settings-toggle-text">
                <a :href="credit.siteHref" target="_blank" rel="noopener noreferrer" class="settings-row-title settings-credit-link">{{ credit.name }}</a>
                <span class="settings-row-meta">{{ credit.note }}</span>
              </span>
              <a :href="credit.licenceHref" target="_blank" rel="noopener noreferrer" class="settings-licence-link">{{ credit.licence }}</a>
            </div>
          </div>
        </div>
      </section>

      <section id="section-danger-zone" class="settings-section settings-reset">
        <div class="settings-group">
          <h3 class="ui-group-label">Reset Freetvarr</h3>
          <div class="ui-group settings-danger">
            <div class="settings-row">
              <p class="settings-row-body">
                Delete Freetvarr's settings, series, list of recordings, and sync history. The next time you open Freetvarr, setup starts from the beginning.
              </p>
              <p class="settings-hint">
                Your video files in <code>{{ mediaRoot || '/media/tv' }}</code> and the other library folders will stay where they are, and so will the recordings and settings in TVHeadend. You cannot reset while a sync is running.
              </p>
              <div class="settings-row-actions">
                <button type="button" class="btn btn-danger" @click="askResetFreetvarr" :disabled="resetting">
                  <template v-if="resetting">Resetting…</template><template v-else><trash-icon /> Reset Freetvarr</template>
                </button>
                <span v-if="resetError" class="status-readout err">{{ resetError }}</span>
              </div>
            </div>
          </div>
          <p class="settings-note">This cannot be undone.</p>
        </div>
      </section>
      <confirm-dialog :open="Boolean(confirming)" :dialog="confirming?.dialog" :icon="confirming?.icon"
        :busy="confirmBusy" @confirm="runConfirmed" @cancel="closeConfirm" />
    </div>
  `,
  setup() {
    const tvhUrl = ref('')
    const tvhUsername = ref('')
    const tvhPassword = ref('')
    const tvhPasswordSet = ref(false)
    const tvhTesting = ref(false)
    const tvhStatus = ref('')
    const tvhStatusKind = ref('ok')
    const tvhOpenEntryBackupSet = ref(false)
    const tvhUndoing = ref(false)
    const [tvhUndoText, tvhUndoKind, setTvhUndo] = makeStatus()
    const { confirming, confirmBusy, askConfirm, closeConfirm, runConfirmed } = useConfirm()
    const askUndoTvhSecure = () => askConfirm({ dialog: restoreOpenAccessConfirm(), run: undoTvhSecure })
    const undoTvhSecure = async () => {
      tvhUndoing.value = true
      try {
        await api('POST', '/api/tvh-bootstrap/undo')
        tvhOpenEntryBackupSet.value = false
        setTvhUndo('Open access restored.', 'ok', 8000)
      } catch (err) {
        setTvhUndo(err.message, 'err', 0)
      } finally {
        tvhUndoing.value = false
      }
    }
    const recordingsRoot = ref('')
    const tvhRecordingsPath = ref('')
    const recordingsCheck = usePathCheck(() => recordingsFolderStatus({
      path: recordingsRoot.value,
      mediaRoot: mediaRoot.value,
    }))
    const tvhPathCheck = usePathCheck(() => tvhRecordingsPathStatus({
      path: tvhRecordingsPath.value,
      fill: (value) => (tvhRecordingsPath.value = value),
    }))
    const syncCron = ref('')
    const syncCronEffective = ref('')
    const syncSchedule = ref(DEFAULT_SYNC_CRON)
    watch(syncSchedule, (schedule) => {
      if (schedule !== CUSTOM_SYNC_SCHEDULE) syncCron.value = schedule
    })
    const timeZone = ref('')
    const tzSource = ref('system')
    const plexUrl = ref('')
    const plexToken = ref('')
    const plexTokenSet = ref(false)
    const plexSectionId = ref('')
    const plexSections = ref([])
    const plexProbing = ref(false)
    const plexRefreshing = ref(false)
    const plexDetecting = ref(false)
    const plexTokenStatus = ref('')
    const plexTokenStatusKind = ref('ok')
    const plexDiscovering = ref(false)
    const plexCandidates = ref([])
    const plexPrefsPath = ref('')
    const plexPrefsOpen = ref(false)
    const plexSectionLoads = ref(0)
    const deleteAfterPlexRefreshOnly = ref(true)
    const adRemovalEnabled = ref(false)
    const adOriginalRetentionDays = ref('7')
    const comskipIniOverride = ref(false)
    const status = ref('')
    const statusKind = ref('ok')
    const plexStatus = ref('')
    const plexStatusKind = ref('ok')
    const saving = ref(false)
    const resetting = ref(false)
    const resetError = ref('')
    const oneOffRoot = ref('')
    const oneOffRootTesting = ref(false)
    const oneOffRootStatus = ref('')
    const oneOffRootStatusKind = ref('ok')
    const importUnmatched = ref(true)
    const addToLibraryDefault = ref(true)
    const showArtworkLookup = ref(true)
    const plexOneOffSectionId = ref('')
    const moviesRoot = ref('')
    const moviesRootTesting = ref(false)
    const moviesRootStatus = ref('')
    const moviesRootStatusKind = ref('ok')
    const plexMoviesSectionId = ref('')
    const mediaRoot = ref('')
    const mediaRootTesting = ref(false)
    const mediaRootStatus = ref('')
    const mediaRootStatusKind = ref('ok')

    const flash = ({ msg, kind = 'ok', ms = FLASH_DEFAULT_MS }) => {
      status.value = msg
      statusKind.value = kind
      if (ms > 0) setTimeout(() => (status.value = ''), ms)
    }

    const setPlexStatus = (msg, kind = 'ok', ms = FLASH_DEFAULT_MS) => {
      plexStatus.value = msg
      plexStatusKind.value = kind
      if (ms > 0) setTimeout(() => (plexStatus.value = ''), ms)
    }

    const setPlexTokenStatus = (msg, kind = 'ok', ms = FLASH_DEFAULT_MS) => {
      plexTokenStatus.value = msg
      plexTokenStatusKind.value = kind
      if (ms > 0) setTimeout(() => (plexTokenStatus.value = ''), ms)
    }

    const dataCredits = ref(dataCreditsOf())
    onMounted(() => api('GET', '/api/for-you/settings')
      .then((body) => { dataCredits.value = dataCreditsOf(body.attribution) })
      .catch(() => {}))
    onMounted(async () => {
      const s = await fetchSettings()
      tvhUrl.value = s.tvh_url || ''
      tvhUsername.value = s.tvh_username || ''
      tvhPasswordSet.value = Boolean(s.tvh_password_set)
      tvhOpenEntryBackupSet.value = Boolean(s.tvh_open_entry_backup_set)
      recordingsRoot.value = s.recordings_root || ''
      tvhRecordingsPath.value = s.tvh_recordings_path || ''
      syncCronEffective.value = s.sync_cron_effective || ''
      const storedCron = normaliseCron(s.sync_cron) || syncCronEffective.value || DEFAULT_SYNC_CRON
      syncSchedule.value = syncSchedulePreset(storedCron)
      syncCron.value = storedCron
      tzSource.value = s.tz_source || 'system'
      timeZone.value = s.time_zone || s.tz || browserTimeZone()
      if (s.tz) tz.value = s.tz
      plexUrl.value = s.plex_url || ''
      plexTokenSet.value = Boolean(s.plex_token_set)
      plexSectionId.value = s.plex_tv_section_id || ''
      plexPrefsPath.value = s.plex_prefs_path || ''
      plexPrefsOpen.value = isCustomPlexPrefsPath(plexPrefsPath.value)
      mediaRoot.value = s.media_root || ''
      oneOffRoot.value = s.oneoff_root || ''
      importUnmatched.value = s.import_unmatched !== false
      loadRecordingDefaults()
      showArtworkLookup.value = s.show_artwork_lookup !== false
      plexOneOffSectionId.value = s.plex_oneoff_section_id || ''
      moviesRoot.value = s.movies_root || ''
      plexMoviesSectionId.value = s.plex_movies_section_id || ''
      deleteAfterPlexRefreshOnly.value = s.delete_after_plex_refresh_only !== false
      adRemovalEnabled.value = Boolean(s.ad_removal_enabled)
      adOriginalRetentionDays.value = s.ad_original_retention_days || '7'
      comskipIniOverride.value = Boolean(s.comskip_ini_override)
      await scrollToRouteSection()
    })
    const stopSectionWatch = watch(routeSection, scrollToRouteSection)
    onUnmounted(stopSectionWatch)

    const save = async () => {
      saving.value = true
      try {
        const body = {
          tvh_url: tvhUrl.value,
          tvh_username: tvhUsername.value,
          recordings_root: recordingsRoot.value,
          tvh_recordings_path: tvhRecordingsPath.value,
          sync_cron: syncCron.value,
          plex_url: plexUrl.value,
          plex_tv_section_id: plexSectionId.value,
          plex_prefs_path: plexPrefsPath.value,
          media_root: mediaRoot.value,
          oneoff_root: oneOffRoot.value,
          import_unmatched: importUnmatched.value,
          show_artwork_lookup: showArtworkLookup.value,
          plex_oneoff_section_id: plexOneOffSectionId.value,
          movies_root: moviesRoot.value,
          plex_movies_section_id: plexMoviesSectionId.value,
          delete_after_plex_refresh_only: deleteAfterPlexRefreshOnly.value,
          ad_removal_enabled: adRemovalEnabled.value,
          ad_original_retention_days: adOriginalRetentionDays.value,
        }
        body.time_zone = timeZone.value
        if (plexToken.value) body.plex_token = plexToken.value
        if (tvhPassword.value) body.tvh_password = tvhPassword.value
        await holdAtLeast({ task: () => api('POST', '/api/settings', body) })
        await saveRecordingDefaults()
        tz.value = timeZone.value
        tzSource.value = 'setting'
        if (plexToken.value) {
          plexTokenSet.value = true
          plexToken.value = ''
        }
        if (tvhPassword.value) {
          tvhPasswordSet.value = true
          tvhPassword.value = ''
        }
        flash({ msg: 'Saved.' })
        await refreshSyncSchedule()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      } finally {
        saving.value = false
      }
    }

    const loadRecordingDefaults = async () => {
      const defaults = await api('GET', '/api/recording-defaults').catch(() => null)
      if (defaults) addToLibraryDefault.value = defaults.add_to_library !== false
    }

    const saveRecordingDefaults = () => api('PUT', '/api/recording-defaults', { add_to_library: addToLibraryDefault.value })

    const refreshSyncSchedule = async () => {
      const fresh = await fetchSettings().catch(() => null)
      if (fresh) syncCronEffective.value = fresh.sync_cron_effective || ''
      await loadSyncStatus()
    }

    const tvhDetecting = ref(false)
    const tvhCandidates = ref([])
    const [tvhDiscoverText, tvhDiscoverKind, setTvhDiscover] = makeStatus()
    const useTvhCandidate = (c) => {
      tvhUrl.value = c.url
      tvhCandidates.value = []
      setTvhDiscover(tvhDetectSummary(c), c.loopback ? 'info' : 'ok', 0)
    }
    const detectTvh = async () => {
      tvhDetecting.value = true
      tvhCandidates.value = []
      setTvhDiscover('Scanning this host (~2s)…', 'busy', 0)
      try {
        const r = await api('POST', '/api/tvh-detect')
        if (r.candidates.length === 1) useTvhCandidate(r.candidates[0])
        else {
          tvhCandidates.value = r.candidates
          setTvhDiscover(`${r.candidates.length} TVHeadend servers answered.`, 'info', 0)
        }
      } catch (err) {
        setTvhDiscover(`Auto-discover failed: ${err.message}`, 'err', 8000)
      } finally {
        tvhDetecting.value = false
      }
    }

    const testTvh = async () => {
      tvhTesting.value = true
      tvhStatus.value = 'Contacting TVHeadend…'
      tvhStatusKind.value = 'busy'
      try {
        const r = await api('POST', '/api/tvh-test', {
          tvh_url: tvhUrl.value,
          tvh_username: tvhUsername.value,
          ...(tvhPassword.value ? { tvh_password: tvhPassword.value } : {}),
        })
        if (tvhPassword.value) {
          tvhPasswordSet.value = true
          tvhPassword.value = ''
        }
        tvhStatus.value = tvhTestSummary(r)
        tvhStatusKind.value = 'ok'
      } catch (err) {
        tvhStatus.value = `Failed: ${err.message}${err.stage ? ` (stage: ${err.stage})` : ''}`
        tvhStatusKind.value = 'err'
      } finally {
        tvhTesting.value = false
      }
    }

    const loadPlexSections = async () => {
      plexProbing.value = true
      try {
        const body = { plex_url: plexUrl.value }
        if (plexToken.value) body.plex_token = plexToken.value
        const { sections = [] } = await api('POST', '/api/plex-sections', body)
        plexSections.value = sections
        plexSectionLoads.value++
        if (sections.length === 0) {
          setPlexStatus('Connected to Plex, but no library sections returned.', 'info', 6000)
        } else {
          setPlexStatus(`Loaded ${sections.length} Plex sections.`)
        }
      } catch (err) {
        setPlexStatus(`Could not reach Plex: ${err.message}`, 'err', 8000)
      } finally {
        plexProbing.value = false
      }
    }

    const usePlexLibraries = (selected) => {
      if (selected.tv) plexSectionId.value = selected.tv
      if (selected.oneoff) plexOneOffSectionId.value = selected.oneoff
      if (selected.movies) plexMoviesSectionId.value = selected.movies
      loadPlexSections()
    }

    const detectPlexToken = async () => {
      plexDetecting.value = true
      try {
        if (plexPrefsPath.value) {
          await api('POST', '/api/settings', { plex_prefs_path: plexPrefsPath.value })
        }
        const r = await api('POST', '/api/plex-detect-token')
        if (r.ok) {
          plexTokenSet.value = true
          plexToken.value = r.token || ''
          setPlexTokenStatus(`Token detected from ${r.source}.`, 'ok', 5000)
        } else {
          setPlexTokenStatus(`Auto-detect failed: ${r.reason}`, 'err', 8000)
        }
      } catch (err) {
        setPlexTokenStatus(`Auto-detect failed: ${err.message}`, 'err', 8000)
      } finally {
        plexDetecting.value = false
      }
    }

    const [plexDiscoverText, plexDiscoverKind, setPlexDiscover] = makeStatus()
    const discoverPlex = async () => {
      plexDiscovering.value = true
      plexCandidates.value = []
      setPlexDiscover('Searching your network (~2s)…', 'busy', 0)
      try {
        const { servers = [] } = await api('POST', '/api/discover-plex')
        if (servers.length === 0) {
          setPlexDiscover('No Plex server found on your network.', 'err', 5000)
        } else if (servers.length === 1) {
          usePlexCandidate(servers[0])
        } else {
          plexCandidates.value = servers
          setPlexDiscover(`Found ${servers.length} Plex servers. Choose one below.`, 'info', 5000)
        }
      } catch (err) {
        setPlexDiscover(`Plex discovery failed: ${err.message}`, 'err', 5000)
      } finally {
        plexDiscovering.value = false
      }
    }

    const usePlexCandidate = (c) => {
      plexUrl.value = `http://${c.ip}:${c.port}`
      plexCandidates.value = []
      setPlexDiscover(`Selected ${c.name || 'Plex'} at ${c.ip}:${c.port}. Save to persist.`, 'ok', 5000)
    }

    const testOneOffRoot = async () => {
      oneOffRootTesting.value = true
      oneOffRootStatus.value = ''
      try {
        const r = await api('POST', '/api/media-root-test', { path: oneOffRoot.value || '/media/one-offs' })
        oneOffRootStatus.value = r.ok ? `${r.path} is writable.` : r.error
        oneOffRootStatusKind.value = r.ok ? 'ok' : 'err'
      } catch (err) {
        oneOffRootStatus.value = `Test failed: ${err.message}`
        oneOffRootStatusKind.value = 'err'
      } finally {
        oneOffRootTesting.value = false
      }
    }

    const testMoviesRoot = async () => {
      moviesRootTesting.value = true
      moviesRootStatus.value = ''
      try {
        const r = await api('POST', '/api/media-root-test', { path: moviesRoot.value })
        moviesRootStatus.value = r.ok ? `${r.path} is writable.` : r.error
        moviesRootStatusKind.value = r.ok ? 'ok' : 'err'
      } catch (err) {
        moviesRootStatus.value = `Test failed: ${err.message}`
        moviesRootStatusKind.value = 'err'
      } finally {
        moviesRootTesting.value = false
      }
    }

    const testMediaRoot = async () => {
      mediaRootTesting.value = true
      mediaRootStatus.value = ''
      try {
        const r = await api('POST', '/api/media-root-test', { path: mediaRoot.value })
        if (r.ok) {
          mediaRootStatus.value = `${r.path} is writable.`
          mediaRootStatusKind.value = 'ok'
        } else {
          mediaRootStatus.value = r.error
          mediaRootStatusKind.value = 'err'
        }
      } catch (err) {
        mediaRootStatus.value = `Test failed: ${err.message}`
        mediaRootStatusKind.value = 'err'
      } finally {
        mediaRootTesting.value = false
      }
    }

    const askResetFreetvarr = () => askConfirm({
      dialog: resetConfirm({ mediaRoot: mediaRoot.value }),
      icon: 'trash-icon',
      run: resetFreetvarr,
    })

    const resetFreetvarr = async () => {
      resetting.value = true
      resetError.value = ''
      try {
        await api('POST', '/api/reset')
        window.location.hash = '#/welcome'
        window.location.reload()
      } catch (err) {
        resetError.value = `Reset failed: ${err.message}`
        resetting.value = false
      }
    }

    const refreshPlexNow = async () => {
      plexRefreshing.value = true
      try {
        const body = {
          plex_url: plexUrl.value,
          plex_tv_section_id: plexSectionId.value,
        }
        if (plexToken.value) body.plex_token = plexToken.value
        const r = await api('POST', '/api/plex-refresh', body)
        if (r.triggered) setPlexStatus(`Plex refresh sent (HTTP ${r.status}).`)
        else if (r.skipped) setPlexStatus(`Not configured: ${r.reason}.`, 'info', 6000)
        else setPlexStatus(`Plex refresh failed: ${r.error}.`, 'err', 8000)
      } catch (err) {
        setPlexStatus(`Plex refresh failed: ${err.message}`, 'err', 8000)
      } finally {
        plexRefreshing.value = false
      }
    }

    return {
      tvhUrl, tvhUsername, tvhPassword, tvhPasswordSet, tvhTesting, tvhStatus, tvhStatusKind,
      tvhOpenEntryBackupSet, tvhUndoing, tvhUndoText, tvhUndoKind, askUndoTvhSecure,
      confirming, confirmBusy, closeConfirm, runConfirmed,
      recordingsRoot, tvhRecordingsPath, recordingsCheck, tvhPathCheck,
      syncCron, syncCronEffective, syncSchedule, timeZone, tzSource,
      syncSchedulePresets: SYNC_SCHEDULE_PRESETS, customSyncSchedule: CUSTOM_SYNC_SCHEDULE,
      ...useSettingsSections(),
      plexUrl, plexToken, plexTokenSet, plexSectionId, plexSections, plexSectionLoads, usePlexLibraries,
      plexProbing, plexRefreshing, plexDetecting,
      plexTokenStatus, plexTokenStatusKind,
      plexDiscovering, plexCandidates, plexPrefsPath, plexPrefsOpen, plexDiscoverText, plexDiscoverKind,
      defaultPlexPrefsPath: DEFAULT_PLEX_PREFS_PATH,
      deleteAfterPlexRefreshOnly,
      adRemovalEnabled, adOriginalRetentionDays, comskipIniOverride,
      status, statusKind, plexStatus, plexStatusKind, saving,
      resetting, resetError, askResetFreetvarr,
      mediaRoot, mediaRootTesting, mediaRootStatus, mediaRootStatusKind, testMediaRoot,
      oneOffRoot, oneOffRootTesting, oneOffRootStatus, oneOffRootStatusKind, testOneOffRoot,
      importUnmatched, addToLibraryDefault, showArtworkLookup, licences: LICENCES, dataCredits, plexOneOffSectionId, plexMoviesSectionId,
      moviesRoot, moviesRootTesting, moviesRootStatus, moviesRootStatusKind, testMoviesRoot,
      save, loadPlexSections, refreshPlexNow, detectPlexToken,
      discoverPlex, usePlexCandidate,
      testTvh, detectTvh, tvhDetecting, tvhCandidates, useTvhCandidate,
      tvhDiscoverText, tvhDiscoverKind,
    }
  },
}
