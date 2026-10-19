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
    <div class="view-reveal settings-page space-y-6 pb-24">
      <nav ref="sectionNav" class="settings-sections" aria-label="Settings sections">
        <a v-for="s in sections" :key="s.id" :href="'#/settings/' + s.id"
          :data-active="activeSection === s.id" :aria-current="activeSection === s.id ? 'location' : null"
          class="settings-section-link" @click="openSection($event, s.id)">{{ s.label }}</a>
      </nav>
      <form id="settings-form" @submit.prevent="save" class="space-y-6">
        <section id="section-tvheadend" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">TVHEADEND</span>
              <info-button title="TVHEADEND" doc="guide/tvheadend">
                <p>The address and login Freetvarr uses for the TVHeadend API. Freetvarr reads the guide, channels, and recordings from it, and sets and cancels recordings.</p>
                <p><strong>AUTO-DISCOVER TVHEADEND</strong> looks for TVHeadend on your network. The TVHeadend user needs the rights in the setup guide.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">the recorder</span>
          </header>
          <div class="panel-body grid gap-4 md:grid-cols-3">
            <div class="md:col-span-3 flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="detectTvh" :disabled="tvhDetecting">
                <template v-if="tvhDetecting">SCANNING…</template><template v-else><search-icon /> AUTO-DISCOVER TVHEADEND</template>
              </button>
              <span v-if="tvhDiscoverText" :class="['status-readout', tvhDiscoverKind]">{{ tvhDiscoverText }}</span>
              <span v-else class="text-xs font-mono text-ink-dim">looks on this computer, port 9981</span>
            </div>
            <div v-if="tvhCandidates.length > 1" class="md:col-span-3">
              <p class="text-sm text-ink-dim mb-2">Several TVHeadend servers answered. Pick one:</p>
              <ul class="space-y-2">
                <li v-for="c in tvhCandidates" :key="c.url">
                  <button type="button" class="btn" @click="useTvhCandidate(c)">
                    Use {{ c.url }}
                  </button>
                </li>
              </ul>
            </div>
            <div class="field-row md:col-span-3">
              <label class="field-label">TVHeadend URL</label>
              <input v-no-autofill type="text" class="field-input" v-model="tvhUrl" placeholder="e.g. http://192.168.1.10:9981" />
            </div>
            <div class="field-row">
              <label class="field-label">Username</label>
              <input v-no-autofill type="text" class="field-input" v-model="tvhUsername" placeholder="blank if TVHeadend is open" />
            </div>
            <div class="field-row">
              <label class="field-label">Password</label>
              <input v-no-autofill type="password" class="field-input" v-model="tvhPassword"
                :placeholder="tvhPasswordSet ? '••••• (stored)' : 'blank if TVHeadend is open'" autocomplete="off" />
              <p class="text-xs text-ink-mute mt-1">Blank keeps the stored password.</p>
            </div>
            <div class="field-row md:col-span-3 flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="testTvh" :disabled="tvhTesting">
                <template v-if="tvhTesting">TESTING…</template><template v-else><pulse-icon /> TEST CONNECTION</template>
              </button>
              <span v-if="tvhStatus" :class="['status-readout', tvhStatusKind]">{{ tvhStatus }}</span>
            </div>
            <div v-if="tvhOpenEntryBackupSet" class="field-row md:col-span-3 flex flex-wrap items-center gap-3">
              <button type="button" class="btn btn-sm" @click="askUndoTvhSecure" :disabled="tvhUndoing">
                <template v-if="tvhUndoing">RESTORING…</template><template v-else>RESTORE OPEN ACCESS</template>
              </button>
              <span v-if="tvhUndoText" :class="['status-readout', tvhUndoKind]">{{ tvhUndoText }}</span>
              <span v-else class="text-xs text-ink-mute">Undoes the wizard's SECURE TVHEADEND: anyone on your network can change TVHeadend again. The logins stay.</span>
            </div>
          </div>
        </section>

        <section id="section-storage" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">STORAGE</span>
              <info-button title="STORAGE" doc="guide/configuration#the-two-recordings-paths">
                <ul><li><strong>MEDIA ROOT</strong>: where imported episodes go. Plex reads this folder.</li><li><strong>ONE-OFF FOLDER</strong>: where single recordings go, such as sport and specials. Point a separate Plex library at it.</li><li><strong>RECORDINGS FOLDER (AS FREETVARR SEES IT)</strong>: the TVHeadend recordings folder, at the path Freetvarr uses.</li><li><strong>RECORDINGS FOLDER (AS TVHEADEND SEES IT)</strong>: the same folder, at the path TVHeadend reports.</li></ul>
                <p>When both apps see the folder at the same path, the two recordings paths are the same. Keep the recordings and the media root inside one shared folder: imports are then instant and use no extra disk space.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">where recordings go</span>
          </header>
          <div class="panel-body space-y-4">
            <div class="field-row">
              <label class="field-label">Media root <span class="text-ink-mute">(inside container)</span></label>
              <input v-no-autofill type="text" class="field-input" v-model="mediaRoot" placeholder="/data/media/tv" />
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                The folder Freetvarr saves TV episodes to. Plex reads it. Enter the path Freetvarr sees, from the <code>volumes</code> in <code>docker-compose.yml</code>. If you change the folder there, change it here too.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn btn-sm" @click="testMediaRoot" :disabled="mediaRootTesting">
                <template v-if="mediaRootTesting">TESTING…</template><template v-else><pulse-icon /> TEST PATH</template>
              </button>
              <span v-if="mediaRootStatus" :class="['status-readout', mediaRootStatusKind]">{{ mediaRootStatus }}</span>
            </div>
            <div class="field-row">
              <label class="field-label">One-off folder <span class="text-ink-mute">(inside container)</span></label>
              <input v-no-autofill type="text" class="field-input" v-model="oneOffRoot" placeholder="/data/media/one-offs" />
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                Recordings that match no series go here, one folder per title. In Plex, add an "Other Videos" library for this folder.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn btn-sm" @click="testOneOffRoot" :disabled="oneOffRootTesting">
                <template v-if="oneOffRootTesting">TESTING…</template><template v-else><pulse-icon /> TEST PATH</template>
              </button>
              <span v-if="oneOffRootStatus" :class="['status-readout', oneOffRootStatusKind]">{{ oneOffRootStatus }}</span>
            </div>
            <div class="field-row">
              <label class="field-label">Movies folder <span class="text-ink-mute">(inside container, optional)</span></label>
              <input v-no-autofill type="text" class="field-input" v-model="moviesRoot" placeholder="empty: films go to the one-off folder" />
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                Films that match no series go here, as <code>Title (Year)/Title (Year).ts</code>. In Plex, add a "Movies" library for this folder.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn btn-sm" @click="testMoviesRoot" :disabled="moviesRootTesting || !moviesRoot.trim()">
                <template v-if="moviesRootTesting">TESTING…</template><template v-else><pulse-icon /> TEST PATH</template>
              </button>
              <span v-if="moviesRootStatus" :class="['status-readout', moviesRootStatusKind]">{{ moviesRootStatus }}</span>
            </div>
            <div class="settings-block">
              <span class="settings-block-title">LIBRARY RULES</span>
              <toggle-switch v-model="importUnmatched">IMPORT EVERY RECORDING</toggle-switch>
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                On: a recording that matches no series goes to the one-off folder, or to the movies folder if it is a film. Off: Freetvarr imports only your series, and recordings you made with ADD TO LIBRARY on. The others stay in TVHeadend; you can import them from the RECORDINGS tab.
              </p>
            </div>
            <div class="grid gap-4 md:grid-cols-2 pt-1">
              <div class="field-row">
                <label class="field-label">Recordings folder (as Freetvarr sees it)</label>
                <input v-no-autofill type="text" class="field-input" v-model="recordingsRoot" placeholder="/data/recordings" />
                <div class="flex flex-wrap items-center gap-3 mt-2">
                  <button type="button" class="btn btn-sm" @click="recordingsCheck.run" :disabled="recordingsCheck.checking">
                    <template v-if="recordingsCheck.checking">CHECKING…</template><template v-else><pulse-icon /> TEST PATH</template>
                  </button>
                  <span v-if="recordingsCheck.text" :class="['status-readout', recordingsCheck.kind]">{{ recordingsCheck.text }}</span>
                </div>
              </div>
              <div class="field-row">
                <label class="field-label">Recordings folder (as TVHeadend sees it)</label>
                <input v-no-autofill type="text" class="field-input" v-model="tvhRecordingsPath" placeholder="/recordings" />
                <div class="flex flex-wrap items-center gap-3 mt-2">
                  <button type="button" class="btn btn-sm" @click="tvhPathCheck.run" :disabled="tvhPathCheck.checking">
                    <template v-if="tvhPathCheck.checking">CHECKING…</template><template v-else><pulse-icon /> CHECK TVHEADEND</template>
                  </button>
                  <span v-if="tvhPathCheck.text" :class="['status-readout', tvhPathCheck.kind]">{{ tvhPathCheck.text }}</span>
                </div>
              </div>
            </div>
            <p class="text-xs text-ink-mute leading-relaxed">
              TVHeadend and Freetvarr must share this folder. Each can see it at a different path; enter the path each one sees.
            </p>
          </div>
        </section>

        <section id="section-plex" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">PLEX</span>
              <info-button title="PLEX" doc="guide/plex">
                <p>Optional. After a sync imports an episode, Freetvarr asks Plex to refresh the library section, so new episodes show up without a manual scan.</p>
                <p>Freetvarr needs the Plex address, a token, and the section. Without Plex, Freetvarr still imports and files episodes.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">updates Plex after each sync</span>
          </header>
          <div class="panel-body grid gap-4 md:grid-cols-2">
            <div class="md:col-span-2 flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="discoverPlex" :disabled="plexDiscovering">
                <template v-if="plexDiscovering">SCANNING…</template><template v-else><search-icon /> AUTO-DISCOVER PLEX</template>
              </button>
              <span v-if="plexDiscoverText" :class="['status-readout', plexDiscoverKind]">{{ plexDiscoverText }}</span>
              <span v-else class="text-xs font-mono text-ink-dim">looks on your home network</span>
            </div>
            <div v-if="plexCandidates.length > 1" class="md:col-span-2">
              <p class="text-sm text-ink-dim mb-2">Freetvarr found more than one Plex server. Pick yours:</p>
              <ul class="space-y-2">
                <li v-for="c in plexCandidates" :key="c.ip + ':' + c.port">
                  <button type="button" class="btn" @click="usePlexCandidate(c)">
                    Use {{ c.name || 'Plex' }} ({{ c.ip }}:{{ c.port }})
                  </button>
                </li>
              </ul>
            </div>
            <div class="field-row md:col-span-2">
              <label class="field-label">Plex URL</label>
              <input v-no-autofill type="text" class="field-input" v-model="plexUrl" placeholder="http://127.0.0.1:32400" />
            </div>
            <div class="field-row md:col-span-2">
              <label class="field-label">Plex token</label>
              <input v-no-autofill type="password" class="field-input" v-model="plexToken"
                :placeholder="plexTokenSet ? '••••• (stored)' : 'paste your Plex token'" autocomplete="off" />
              <div class="mt-2 flex flex-wrap items-center gap-3">
                <button type="button" class="btn btn-sm" @click="detectPlexToken" :disabled="plexDetecting">
                  <template v-if="plexDetecting">DETECTING…</template><template v-else><bolt-icon /> AUTO-DETECT TOKEN</template>
                </button>
                <span v-if="plexTokenStatus" :class="['status-readout', plexTokenStatusKind]">{{ plexTokenStatus }}</span>
              </div>
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                AUTO-DETECT TOKEN reads the token from Plex's settings file. It works with the Plex in Freetvarr's compose file.
              </p>
            </div>
            <details class="settings-disclosure md:col-span-2" :open="plexPrefsOpen">
              <summary>Token not found?</summary>
              <div class="settings-disclosure-body space-y-2">
                <p class="text-xs text-ink-mute leading-relaxed">
                  If you installed Plex yourself, share the folder that holds its <code>Preferences.xml</code> with Freetvarr in <code>docker-compose.yml</code>, then enter the path Freetvarr sees below. Or paste the token from Plex; <a href="https://furey.github.io/freetvarr/guide/plex#the-token" target="_blank" rel="noopener noreferrer">the Plex guide</a> says where to find it.
                </p>
                <div class="field-row">
                  <label class="field-label">Preferences.xml path <span class="text-ink-mute">(inside container)</span></label>
                  <input v-no-autofill type="text" class="field-input" v-model="plexPrefsPath" :placeholder="defaultPlexPrefsPath" />
                </div>
              </div>
            </details>
            <div class="field-row md:col-span-2">
              <label class="field-label">Plex TV section</label>
              <select v-if="plexSections.length" class="field-input" v-model="plexSectionId">
                <option value="">Pick a section</option>
                <option v-for="sec in plexSections" :key="sec.key" :value="sec.key">
                  {{ sec.title }} (#{{ sec.key }}, {{ sec.type }})
                </option>
              </select>
              <input v-no-autofill v-else type="text" class="field-input" v-model="plexSectionId"
                placeholder="section number; LOAD SECTIONS lists them" />
            </div>
            <div class="field-row md:col-span-2">
              <label class="field-label">Plex one-off section</label>
              <select v-if="plexSections.length" class="field-input" v-model="plexOneOffSectionId">
                <option value="">None</option>
                <option v-for="sec in plexSections" :key="sec.key" :value="sec.key">
                  {{ sec.title }} (#{{ sec.key }}, {{ sec.type }})
                </option>
              </select>
              <input v-no-autofill v-else type="text" class="field-input" v-model="plexOneOffSectionId"
                placeholder="section number of the one-off library" />
            </div>
            <div class="field-row md:col-span-2">
              <label class="field-label">Plex movies section</label>
              <select v-if="plexSections.length" class="field-input" v-model="plexMoviesSectionId">
                <option value="">None</option>
                <option v-for="sec in plexSections" :key="sec.key" :value="sec.key">
                  {{ sec.title }} (#{{ sec.key }}, {{ sec.type }})
                </option>
              </select>
              <input v-no-autofill v-else type="text" class="field-input" v-model="plexMoviesSectionId"
                placeholder="section number of the movies library" />
            </div>
            <div class="md:col-span-2 flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="loadPlexSections" :disabled="plexProbing">
                <template v-if="plexProbing">LOADING…</template><template v-else><download-icon /> LOAD SECTIONS</template>
              </button>
              <button type="button" class="btn" @click="refreshPlexNow" :disabled="plexRefreshing">
                <template v-if="plexRefreshing">REFRESHING…</template><template v-else><refresh-icon /> REFRESH PLEX NOW</template>
              </button>
              <span v-if="plexStatus" :class="['status-readout', plexStatusKind]">{{ plexStatus }}</span>
            </div>
            <plex-library-setup :plex-url="plexUrl" :plex-token="plexToken" :loads="plexSectionLoads"
              @created="usePlexLibraries" />
            <div class="md:col-span-2">
              <toggle-switch v-model="deleteAfterPlexRefreshOnly" class="toggle-prose">
                Wait for Plex before removing recordings from TVHeadend
                <span class="text-ink-mute">(recommended: if Plex does not answer, the recording stays in TVHeadend)</span>
              </toggle-switch>
            </div>
          </div>
        </section>

        <section id="section-schedule" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">SCHEDULE</span>
              <info-button title="SCHEDULE" doc="guide/syncs#scheduled-and-manual">
                <p>The time zone Freetvarr uses for the guide, recordings, and the sync schedule. A <code>TZ</code> value in your .env file only fills in the first choice; the zone you save here wins.</p>
                <p>How often Freetvarr checks TVHeadend for new recordings to import. <strong>Custom</strong> takes a cron expression, such as <code>0 */2 * * *</code> for every two hours.</p>
                <p>A change applies without a restart. <strong>SYNC NOW</strong> on the <strong>DASHBOARD</strong> runs a sync at any time.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">time zone and when Freetvarr syncs</span>
          </header>
          <div class="panel-body space-y-4">
            <time-zone-field v-model="timeZone" :source="tzSource" />
            <div class="field-row md:max-w-xs">
              <label class="field-label" for="settings-sync-schedule">Sync schedule</label>
              <select id="settings-sync-schedule" class="field-input" v-model="syncSchedule">
                <option v-for="preset in syncSchedulePresets" :key="preset.cron" :value="preset.cron">{{ preset.label }}</option>
                <option :value="customSyncSchedule">Custom</option>
              </select>
            </div>
            <div v-if="syncSchedule === customSyncSchedule" class="field-row">
              <label class="field-label" for="settings-sync-cron">Custom schedule <span class="text-ink-mute">(cron)</span></label>
              <input v-no-autofill id="settings-sync-cron" type="text" class="field-input" v-model="syncCron" placeholder="0 */2 * * *" />
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                Five fields: minute, hour, day of month, month, day of week. <code>0 */2 * * *</code> is every two hours.
              </p>
              <p v-if="syncCronEffective && syncCronEffective !== syncCron.trim()" class="text-xs text-ink-dim mt-2">
                Freetvarr syncs on <code>{{ syncCronEffective }}</code> until you save a valid schedule.
              </p>
            </div>
          </div>
        </section>

        <section id="section-pictures" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">PICTURES</span>
              <info-button title="PICTURES" doc="guide/tv-guide#missing-pictures">
                <p>Most programme pictures come from the TV guide. When a guide picture is missing, Freetvarr uses the show's poster from your Plex library, then from TVmaze, a free online TV database.</p>
                <p>A TVmaze lookup sends the programme title to TVmaze. Turn it off to keep every title on your network.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">where missing pictures come from</span>
          </header>
          <div class="panel-body space-y-4">
            <toggle-switch v-model="showArtworkLookup">LOOK UP MISSING PICTURES ON TVMAZE</toggle-switch>
            <p class="text-xs text-ink-mute leading-relaxed">
              On: when the guide and Plex have no picture for a show, Freetvarr sends the title to <a href="https://www.tvmaze.com" target="_blank" rel="noopener">TVmaze</a> and uses its picture. Off: those shows get a title card.
            </p>
          </div>
        </section>

        <section id="section-ad-removal" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">AD REMOVAL</span>
              <info-button title="AD REMOVAL" doc="guide/ad-removal">
                <p>Finds the ad breaks in a recording with comskip, and can cut them out with ffmpeg. Both come with Freetvarr.</p>
                <p>Turn it on here, then set a mode for each series on the <strong>SERIES</strong> tab. <strong>DETECT</strong> saves the breaks in a <code>.edl</code> file beside the video, so apps that read it skip them. <strong>CUT</strong> removes them and keeps the original for a set number of days.</p>
                <p>Detection is not always right. Use <strong>DETECT</strong> on a channel first, and check the breaks before you let it cut.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">optional</span>
          </header>
          <div class="panel-body space-y-4">
            <div>
              <toggle-switch v-model="adRemovalEnabled" class="toggle-prose">
                Enable ad removal
                <span class="text-ink-mute">(set the mode for each series on the SERIES tab)</span>
              </toggle-switch>
            </div>
            <div class="field-row md:max-w-xs">
              <label class="field-label">Keep the original after a cut for (days)</label>
              <input v-no-autofill type="number" min="1" class="field-input" v-model="adOriginalRetentionDays" />
            </div>
            <p class="text-xs font-mono text-ink-dim">
              Detection settings: <code>{{ comskipIniOverride ? 'your /config/comskip.ini' : 'built in, tuned for Australian free-to-air' }}</code>
            </p>
            <p class="text-xs text-ink-mute leading-relaxed">
              Finding the ads uses a lot of processor time: expect several minutes for each episode. CUT saves the recording again without the ads, at the same picture quality, and keeps the original as <code>&lt;file&gt;.ts.orig</code> for the days above. Detection works better on some channels than others, so try DETECT before you use CUT.
            </p>
          </div>
        </section>
      </form>

      <div class="settings-save-bar">
        <div class="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <span v-if="status" :class="['status-readout', statusKind]">{{ status }}</span>
          <span v-else class="hidden sm:inline text-xs font-mono text-ink-mute">Changes apply when you save.</span>
          <button type="submit" form="settings-form" class="btn btn-primary ml-auto" :disabled="saving">
            <template v-if="saving">SAVING…</template><template v-else><check-icon /> SAVE SETTINGS</template>
          </button>
        </div>
      </div>

      <tv-apps-panel :tvh-url="tvhUrl" />

      <section id="section-help" class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">HELP</span>
            <info-button title="HELP" doc="guide/troubleshooting#reporting-a-bug">
              <p><strong>REOPEN WIZARD</strong> walks the first-run setup again, with your saved values filled in.</p>
              <p><strong>RUN DOCTOR</strong> checks your setup and says what to fix.</p>
              <p>The versions Freetvarr is running with. Include them when you report a bug. <strong>COPY</strong> puts them on the clipboard as plain text. The update check asks GitHub for the newest Freetvarr release, from this browser.</p>
            </info-button>
          </span>
          <span class="text-xs font-mono text-ink-dim">setup, checks, and versions</span>
        </header>
        <div class="panel-body help-rows">
          <div class="help-row">
            <div class="max-w-2xl">
              <span class="settings-block-title">SETUP WIZARD</span>
              <p class="text-sm text-ink-dim leading-relaxed">
                Open the guided setup again. Your saved values are filled in, and a saved password or token shows as <code>••••• (stored)</code>, so you can change one step without typing the rest again.
              </p>
            </div>
            <button type="button" class="btn" @click="reopenWizard"><refresh-icon /> REOPEN WIZARD</button>
          </div>
          <div class="help-row">
            <div class="max-w-2xl">
              <span class="settings-block-title">HEALTH CHECK</span>
              <p class="text-sm text-ink-dim leading-relaxed">
                The Doctor checks the TVHeadend login and rights, the tuners, the guide, the folders, Plex, and live TV, then says what to fix.
              </p>
            </div>
            <a href="#/settings/system/health" class="btn no-hover-underline"><pulse-icon /> RUN DOCTOR</a>
          </div>
          <versions-row />
        </div>
      </section>

      <section id="section-danger-zone" class="panel settings-reset">
        <header class="panel-header">
          <span class="panel-title">RESET</span>
          <span class="text-xs font-mono text-ink-dim">cannot be undone</span>
        </header>
        <div class="panel-body space-y-4">
          <div>
            <p class="text-sm text-ink leading-relaxed">
              Delete Freetvarr's settings, series, list of recordings, and sync history. The next time you open Freetvarr, the setup wizard will start from the beginning.
            </p>
            <p class="text-xs text-ink-mute leading-relaxed mt-2">
              Your video files in <code>{{ mediaRoot || '/media/tv' }}</code> and the other library folders will stay where they are, and so will the recordings and settings in TVHeadend. You cannot reset while a sync is running.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button type="button" class="btn btn-danger" @click="askResetFreetvarr" :disabled="resetting">
              <template v-if="resetting">RESETTING…</template><template v-else><trash-icon /> RESET FREETVARR</template>
            </button>
            <span v-if="resetError" class="status-readout err">{{ resetError }}</span>
          </div>
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
        await api('POST', '/api/settings', body)
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

    const reopenWizard = async () => {
      try {
        await api('POST', '/api/settings', { welcome_dismissed: false })
      } catch { /* wizard still opens */ }
      if (window.location.hash === '#/welcome') {
        window.location.reload()
      } else {
        window.location.hash = '#/welcome'
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
      resetting, resetError, askResetFreetvarr, reopenWizard,
      mediaRoot, mediaRootTesting, mediaRootStatus, mediaRootStatusKind, testMediaRoot,
      oneOffRoot, oneOffRootTesting, oneOffRootStatus, oneOffRootStatusKind, testOneOffRoot,
      importUnmatched, showArtworkLookup, plexOneOffSectionId, plexMoviesSectionId,
      moviesRoot, moviesRootTesting, moviesRootStatus, moviesRootStatusKind, testMoviesRoot,
      save, loadPlexSections, refreshPlexNow, detectPlexToken,
      discoverPlex, usePlexCandidate,
      testTvh, detectTvh, tvhDetecting, tvhCandidates, useTvhCandidate,
      tvhDiscoverText, tvhDiscoverKind,
    }
  },
}
