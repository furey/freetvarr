import {
  ref,
  reactive,
  computed,
  onMounted,
  watch,
  nextTick,
} from '/vendor/vue.esm-browser.prod.js'
import { revealStepMs, isStepResolved, pacedSteps, STEP_PACING } from '/paced-reveal.js'
import { DEFAULT_SYNC_CRON, SYNC_SCHEDULE_PRESETS, syncSchedulePreset } from '/sync-schedule.js'
import { withBrowserNetwork } from '/lan-network.js'
import { wizardSkipConfirm } from '/wizard-skip.js'
import { useConfirm } from '/components/dialogs.js'
import { api, fetchSettings } from '/shared/api.js'
import { FLASH_DEFAULT_MS } from '/shared/composables.js'
import { DOCS_BASE } from '/shared/constants.js'
import { tvhDetectSummary, tvhTestSummary } from '/shared/format.js'
import {
  makeStatus,
  usePathCheck,
  recordingsFolderStatus,
  describeRecordingsFolder,
  tvhRecordingsPathStatus,
  describeTvhRecordingsPath,
} from '/shared/path-check.js'
import { tz, browserTimeZone } from '/shared/time.js'
import { wait, prefersReducedMotion } from '/shared/utils.js'
import { secureStepDot, BOOTSTRAP_REVEAL_POLL_MS } from '/views/welcome-shared.js'

const syncFrequency = (cron) => {
  const preset = SYNC_SCHEDULE_PRESETS.find((p) => p.cron === syncSchedulePreset(cron))
  return preset ? preset.label.toLowerCase() : 'on your sync schedule'
}

export const WelcomeView = {
  template: `
    <div class="view-reveal welcome-page">
      <header class="welcome-header">
        <div class="welcome-header-top">
          <brand-wordmark class="welcome-wordmark" data-intro-target />
          <button v-if="step < totalSteps" type="button" class="welcome-later" @click="skipToSettings">Finish later <arrow-right-icon /></button>
        </div>
        <p class="welcome-step">Step {{ step }} of {{ totalSteps }}</p>
        <h1 class="ui-page-title">{{ stepTitle }}</h1>
        <div class="welcome-progress" role="progressbar" :aria-valuenow="step" aria-valuemin="1" :aria-valuemax="totalSteps"
          :aria-label="'Setup step ' + step + ' of ' + totalSteps">
          <span v-for="n in totalSteps" :key="n" :class="['welcome-progress-step', { 'is-done': n < step, 'is-current': n === step }]"></span>
        </div>
      </header>
      <section class="welcome-card" :aria-label="stepTitle">
        <div class="welcome-body">

          <div v-if="step === 1" class="space-y-4">
            <p class="text-ink text-base leading-relaxed">
              Freetvarr gives you a TV guide, records shows and series, and lets you watch live and recorded TV on any screen. Recordings are saved into your media library.
            </p>
            <p class="text-ink-dim text-sm leading-relaxed">
              Setup takes about two minutes. The only step you must finish is connecting to TVHeadend, the program that runs your tuner. Plex is optional.
            </p>
            <p v-if="hasExistingConfig" class="ui-banner is-info">
              Your existing settings are filled in. Leave a field as it is to keep its stored value; stored secrets show as <code>••••• (stored)</code>.
            </p>
            <time-zone-field v-model="timeZone" :source="tzSource" hint />
          </div>

          <div v-if="step === 2" class="space-y-4">
            <p class="text-ink text-sm leading-relaxed">
              Freetvarr needs the address of your TVHeadend server.
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="detectTvh()" :disabled="tvhDetecting">
                <template v-if="tvhDetecting && !tvhAutoScanning">Scanning…</template><template v-else><search-icon /> Auto-discover TVHeadend</template>
              </button>
              <span v-if="tvhDiscoverText"
                :class="['status-readout', tvhDiscoverKind]">{{ tvhDiscoverText }}</span>
            </div>
            <div v-if="tvhCandidates.length > 1" class="space-y-2">
              <p class="text-sm text-ink-dim">Several TVHeadend servers answered. Pick one:</p>
              <ul class="space-y-2">
                <li v-for="c in tvhCandidates" :key="c.url">
                  <button type="button" class="btn" @click="useTvhCandidate(c)">
                    Use {{ c.url }}
                  </button>
                </li>
              </ul>
            </div>
            <div class="field-row">
              <label class="field-label">TVHeadend URL</label>
              <input v-no-autofill type="text" class="field-input" v-model="tvhUrl" placeholder="e.g. http://192.168.1.10:9981" />
            </div>
            <div v-if="showSecure && !secureStepsVisible" class="space-y-4">
              <p class="text-ink text-sm leading-relaxed">
                <strong class="welcome-alert">This TVHeadend has no logins yet</strong>, so anyone on your network can change it. Freetvarr can secure it: it makes an admin login for you and a separate login for itself, then turns off the open access.
              </p>
              <div class="grid gap-4 md:grid-cols-2">
                <div class="field-row">
                  <label class="field-label">Admin username</label>
                  <input v-no-autofill type="text" class="field-input" v-model="secureAdminUsername" :disabled="securing" />
                </div>
                <div class="field-row">
                  <label class="field-label">Admin password</label>
                  <div class="flex items-center gap-2">
                    <input v-no-autofill.new-password ref="secureAdminPasswordInput" :type="secureShowPassword ? 'text' : 'password'" class="field-input" v-model="secureAdminPassword" :disabled="securing" />
                    <button type="button" class="btn btn-sm btn-icon" @click="secureShowPassword = !secureShowPassword" :aria-label="secureShowPassword ? 'Hide password' : 'Show password'" :aria-pressed="secureShowPassword"><eye-off-icon v-if="secureShowPassword" /><eye-icon v-else /></button>
                  </div>
                </div>
              </div>
              <div class="field-row">
                <label class="field-label">Allowed networks</label>
                <input v-no-autofill type="text" class="field-input" v-model="securePrefixes" :disabled="securing" placeholder="e.g. 192.168.1.0/24, 127.0.0.0/8" />
                <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                  Both logins work only from these networks. Freetvarr guessed them from this computer's networks and this browser's network; add any network you sign in to TVHeadend from.
                </p>
              </div>
              <p class="text-xs text-ink-mute leading-relaxed">
                Keep the admin password somewhere safe: you sign in to TVHeadend with it, and Freetvarr does not store it. Freetvarr signs in as <code>freetvarr</code> with a random password it keeps for itself.
              </p>
              <div class="action-row flex flex-wrap items-center gap-3">
                <button type="button" class="btn btn-primary" @click="secureTvh" :disabled="securing || !secureReady">
                  <template v-if="securing">Securing…</template><template v-else>Secure TVHeadend and connect Freetvarr</template>
                </button>
                <span v-if="secureInputProblem" class="welcome-hint is-warning">{{ secureInputProblem }}</span>
              </div>
              <manual-option label="Enter a login instead" :disabled="securing" @choose="useManualLogin">
                Make your own TVHeadend logins, then give Freetvarr the one you made for it.
              </manual-option>
            </div>
            <ol v-if="secureStepsVisible" class="welcome-steps">
              <li v-for="s in secureShownSteps" :key="s.id" class="step-row">
                <span class="step-marker">
                  <span v-if="s.status === 'running'" class="step-spinner"></span>
                  <span v-else :class="['led-dot', 'sm', secureStepDot(s.status)]"></span>
                </span>
                <span :class="s.status === 'pending' ? 'text-ink-mute' : 'text-ink'">{{ s.label }}</span>
              </li>
            </ol>
            <div v-if="secureError" class="space-y-1">
              <p class="status-readout err">{{ secureError }}</p>
              <p v-if="secureNext" class="text-sm text-ink">{{ secureNext }}</p>
              <button v-if="showSecure && !securing" type="button" class="btn btn-sm" @click="backToSecureForm">
                Back to the form
              </button>
            </div>
            <p v-if="securedAs" class="status-readout ok">
              TVHeadend is secured. Sign in to TVHeadend as {{ securedAs }} from now on; Freetvarr signs in as freetvarr.
            </p>
            <template v-if="!showSecure">
              <p v-if="!securedAs" class="text-ink-dim text-sm leading-relaxed">
                Enter the TVHeadend login Freetvarr should use. Leave both blank if TVHeadend allows anonymous access.
              </p>
              <div class="grid gap-4 md:grid-cols-2">
                <div class="field-row">
                  <label class="field-label">Username</label>
                  <input v-no-autofill type="text" class="field-input" v-model="tvhUsername" v-autofocus="manualLogin" />
                </div>
                <div class="field-row">
                  <label class="field-label">Password</label>
                  <input v-no-autofill type="password" class="field-input" v-model="tvhPassword"
                    :placeholder="tvhPasswordSet ? '••••• (stored)' : ''" autocomplete="off" />
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <button type="button" class="btn" @click="testTvh" :disabled="tvhTesting">
                  <template v-if="tvhTesting">Testing…</template><template v-else><pulse-icon /> Test connection</template>
                </button>
                <span v-if="tvhText" :class="['status-readout', tvhKind]">{{ tvhText }}</span>
              </div>
            </template>
          </div>

          <channel-setup-step v-if="step === 3" :tvh-url="tvhUrl" @state="channelState = $event" />

          <guide-setup-step v-if="step === 4" :tvh-url="tvhUrl" ref="guideStep" @state="guideState = $event" @back="step = 3" />

          <div v-if="step === 5" class="space-y-4">
            <p v-if="storageChecking" class="status-readout busy">Checking the folders…</p>
            <template v-else-if="storageChecked">
              <template v-if="!storageProblems.length">
                <p class="text-ink text-sm leading-relaxed">{{ storageSummary }}</p>
                <p class="status-readout ok">The folder checks passed.</p>
              </template>
              <div v-for="p in storageProblems" :key="p.text" class="space-y-1">
                <p class="status-readout err">{{ p.text }}</p>
                <p class="text-sm text-ink leading-relaxed">{{ p.fix }}</p>
              </div>
              <p v-for="note in storageNotes" :key="note" class="status-readout info">{{ note }}</p>
              <button v-if="storageProblems.length" type="button" class="btn btn-sm" @click="checkStorage">
                <refresh-icon /> Check again
              </button>
            </template>
            <details class="settings-disclosure" :open="storageAdvancedOpen" @toggle="storageAdvancedOpen = $event.target.open">
              <summary @click="focusFirstFieldOnOpen">Advanced: change folders</summary>
              <div class="settings-disclosure-body space-y-4">
                <p class="text-xs text-ink-mute leading-relaxed">
                  Enter each folder as the app sees it inside its container, from the <code>volumes</code> in <code>docker-compose.yml</code>. If you change a folder there, change it here too. The data folder is the one that <code>DATA_PATH</code> sets in <code>.env</code>.
                </p>
                <div class="field-row">
                  <label class="field-label">TV library folder</label>
                  <input v-no-autofill type="text" class="field-input" v-model="mediaRoot" @input="clearStaleLibraryStatus" placeholder="/data/media/tv" />
                  <div class="flex flex-wrap items-center gap-3 mt-2">
                    <button type="button" class="btn btn-sm" @click="testMediaRoot" :disabled="mediaRootTesting">
                      <template v-if="mediaRootTesting">Testing…</template><template v-else><pulse-icon /> Test path</template>
                    </button>
                    <span v-if="mediaRootStatus" :class="['status-readout', mediaRootStatusKind]">{{ mediaRootStatus }}</span>
                  </div>
                </div>
                <div class="grid gap-4 md:grid-cols-2">
                  <div class="field-row">
                    <label class="field-label">Recordings folder (as Freetvarr sees it)</label>
                    <input v-no-autofill type="text" class="field-input" v-model="recordingsRoot" @input="recordingsCheck.clear" placeholder="/data/recordings" />
                    <div class="flex flex-wrap items-center gap-3 mt-2">
                      <button type="button" class="btn btn-sm" @click="recordingsCheck.run" :disabled="recordingsCheck.checking">
                        <template v-if="recordingsCheck.checking">Checking…</template><template v-else><pulse-icon /> Test path</template>
                      </button>
                      <span v-if="recordingsCheck.text" :class="['status-readout', recordingsCheck.kind]">{{ recordingsCheck.text }}</span>
                    </div>
                  </div>
                  <div class="field-row">
                    <label class="field-label">Recordings folder (as TVHeadend sees it)</label>
                    <input v-no-autofill type="text" class="field-input" v-model="tvhRecordingsPath" @input="tvhPathCheck.clear" placeholder="/recordings" />
                    <div class="flex flex-wrap items-center gap-3 mt-2">
                      <button type="button" class="btn btn-sm" @click="tvhPathCheck.run" :disabled="tvhPathCheck.checking">
                        <template v-if="tvhPathCheck.checking">Checking…</template><template v-else><pulse-icon /> Check TVHeadend</template>
                      </button>
                      <span v-if="tvhPathCheck.text" :class="['status-readout', tvhPathCheck.kind]">{{ tvhPathCheck.text }}</span>
                    </div>
                  </div>
                </div>
                <p class="text-xs text-ink-mute leading-relaxed">
                  TVHeadend and Freetvarr share the recordings folder. Each can see it at a different path.
                </p>
              </div>
            </details>
          </div>

          <div v-if="step === 6" class="space-y-4">
            <p v-if="plexChecking" class="status-readout busy">Looking for Plex…</p>
            <template v-else-if="plexConnected">
              <p class="status-readout ok">Connected to Plex at {{ plexUrl }}.</p>
              <div v-if="plexShowSections.length" class="field-row">
                <label class="field-label" for="wizard-plex-tv-library">TV library</label>
                <select id="wizard-plex-tv-library" class="field-input" v-model="plexSectionId">
                  <option value="">Pick a library</option>
                  <option v-for="sec in plexShowSections" :key="sec.key" :value="sec.key">{{ sec.title }}</option>
                </select>
                <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                  After each sync, Freetvarr asks Plex to refresh this library.
                </p>
              </div>
            </template>
            <div v-else-if="plexCandidates.length > 1" class="space-y-2">
              <p class="text-sm text-ink-dim">Freetvarr found more than one Plex server. Pick yours:</p>
              <ul class="space-y-2">
                <li v-for="c in plexCandidates" :key="c.ip + ':' + c.port">
                  <button type="button" class="btn" @click="usePlexCandidate(c)">
                    Use {{ c.name || 'Plex' }} ({{ c.ip }}:{{ c.port }})
                  </button>
                </li>
              </ul>
            </div>
            <div v-else-if="plexProblem" class="space-y-2">
              <p class="status-readout err">{{ plexProblem.text }}</p>
              <p class="text-sm text-ink leading-relaxed">{{ plexProblem.fix }} <a :href="plexDocsUrl" target="_blank" rel="noopener noreferrer">Plex setup</a> has the details.</p>
              <button type="button" class="btn btn-sm" @click="findPlex"><refresh-icon /> Check again</button>
            </div>
            <template v-else>
              <p class="text-ink text-sm leading-relaxed">
                Freetvarr works without Plex. Recordings still go into your TV library folder for any media player.
              </p>
              <p class="text-ink-dim text-sm leading-relaxed">
                To add Plex, see <a :href="plexDocsUrl" target="_blank" rel="noopener noreferrer">Plex setup</a>.
              </p>
            </template>
            <plex-library-setup v-if="!plexChecking" :plex-url="plexUrl" :plex-token="plexToken" :loads="plexSectionLoads"
              @created="usePlexLibraries" />
            <details class="settings-disclosure" :open="plexAdvancedOpen" @toggle="plexAdvancedOpen = $event.target.open">
              <summary @click="focusFirstFieldOnOpen">Advanced: connect Plex by hand</summary>
              <div class="settings-disclosure-body space-y-4">
                <div class="field-row">
                  <label class="field-label">Plex address</label>
                  <input v-no-autofill type="text" class="field-input" v-model="plexUrl" placeholder="e.g. http://192.168.1.10:32400" />
                </div>
                <div class="field-row">
                  <label class="field-label">Plex token</label>
                  <input v-no-autofill type="password" class="field-input" v-model="plexToken"
                    :placeholder="plexTokenSet ? '••••• (stored)' : 'paste your Plex token'" autocomplete="off" />
                  <div class="mt-2 flex flex-wrap items-center gap-3">
                    <button type="button" class="btn btn-sm" @click="detectPlexToken" :disabled="plexDetectingToken">
                      <template v-if="plexDetectingToken">Detecting…</template><template v-else><bolt-icon /> Auto-detect token</template>
                    </button>
                    <span v-if="plexTokenStatus" :class="['status-readout', plexTokenStatusKind]">{{ plexTokenStatus }}</span>
                  </div>
                  <p class="text-xs text-ink-mute mt-2 leading-relaxed">
                    Auto-detect token reads the token from Plex's settings file. It works with the Plex in Freetvarr's compose file. For another Plex, enter the path to its <code>Preferences.xml</code> below, or paste the token from Plex.
                  </p>
                </div>
                <div class="field-row">
                  <label class="field-label">Preferences.xml path <span class="text-ink-mute">(as Freetvarr sees it)</span></label>
                  <input v-no-autofill type="text" class="field-input" v-model="plexPrefsPath"
                    placeholder="/plex/Library/Application Support/Plex Media Server/Preferences.xml" />
                </div>
                <div v-if="!plexShowSections.length" class="field-row">
                  <label class="field-label">TV library number</label>
                  <input v-no-autofill type="text" class="field-input" v-model="plexSectionId"
                    placeholder="Connect lists your libraries" />
                </div>
                <div class="flex flex-wrap items-center gap-3">
                  <button type="button" class="btn" @click="loadPlexSections()" :disabled="plexProbing || !plexUrl.trim()">
                    <template v-if="plexProbing">Connecting…</template><template v-else><pulse-icon /> Connect</template>
                  </button>
                  <span v-if="plexSectionsText"
                    :class="['status-readout', plexSectionsKind]">{{ plexSectionsText }}</span>
                </div>
              </div>
            </details>
          </div>

          <div v-if="step === 7" class="space-y-4">
            <p v-if="!readySkipped.length" class="welcome-done">
              <span class="ui-dot is-ok" aria-hidden="true"></span> Setup is done. Freetvarr is ready to record.
            </p>
            <div v-else class="space-y-2">
              <p class="text-ink text-base leading-relaxed">Setup is not finished yet.</p>
              <ul class="space-y-1 text-sm text-ink-dim">
                <li v-for="item in readySkipped" :key="item.step">
                  {{ item.text }}
                  <button type="button" class="btn-link" @click="step = item.step">{{ item.action }}</button>
                </li>
              </ul>
            </div>
            <p class="text-ink-dim text-sm leading-relaxed">
              Next: open the <strong class="text-ink">Guide</strong>, pick a programme, and press <strong class="text-ink">Record</strong> or <strong class="text-ink">Record series</strong>. Freetvarr checks for finished recordings {{ syncFrequencyText }} and adds them to your library. You can change how often in Settings.
            </p>
            <p class="text-ink-dim text-sm leading-relaxed">
              To check the whole setup, <a href="#/settings/system/health">run the health checks</a>. It checks {{ plexIsSetUp ? 'TVHeadend, Plex, and the folders' : 'TVHeadend and the folders' }} and lists anything to fix.
            </p>
          </div>

        </div>
        <footer class="welcome-footer">
          <button type="button" class="btn" @click="back" :disabled="step === 1 || saving"><arrow-left-icon /> Back</button>
          <div class="welcome-footer-end">
            <span v-if="saveStatusText"
              :class="['status-readout', saveStatusKind]">{{ saveStatusText }}</span>
            <span v-else-if="!canAdvance" class="welcome-hint is-warning">{{ advanceHint }}</span>
            <button type="button" :class="['btn', 'welcome-next', { 'btn-primary': nextIsPrimary }]" @click="next" :disabled="!canAdvance || saving">
              {{ nextLabel }} <arrow-right-icon />
            </button>
          </div>
        </footer>
      </section>
      <confirm-dialog :open="Boolean(confirming)" :dialog="confirming?.dialog" :icon="confirming?.icon"
        :busy="confirmBusy" @confirm="runConfirmed" @cancel="closeConfirm" />
    </div>
  `,
  setup() {
    const [plexSectionsText, plexSectionsKind, setPlexSections] = makeStatus()
    const [tvhText, tvhKind, setTvhText] = makeStatus()
    const [saveStatusText, saveStatusKind, setSaveStatus, clearSaveStatus] = makeStatus()
    const step = ref(1)
    const totalSteps = 7
    const STEP_TITLES = {
      1: 'Welcome',
      2: 'TVHeadend',
      3: 'Channels',
      4: 'Guide',
      5: 'Storage',
      6: 'Plex',
      7: 'Ready',
    }
    const stepTitle = computed(() => STEP_TITLES[step.value] || 'Welcome')
    const saving = ref(false)

    const tvhUrl = ref('')
    const tvhUsername = ref('')
    const tvhPassword = ref('')
    const tvhPasswordSet = ref(false)
    const tvhTesting = ref(false)
    const tvhConnected = ref(false)
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

    const timeZone = ref(browserTimeZone())
    const tzSource = ref('system')

    const plexUrl = ref('')
    const plexToken = ref('')
    const plexSectionId = ref('')
    const plexSections = ref([])
    const plexProbing = ref(false)
    const plexCandidates = ref([])
    const plexDetectingToken = ref(false)
    const plexTokenStatus = ref('')
    const plexTokenStatusKind = ref('ok')
    const plexPrefsPath = ref('')
    const plexSectionLoads = ref(0)

    const setPlexTokenStatus = (msg, kind = 'ok', ms = FLASH_DEFAULT_MS) => {
      plexTokenStatus.value = msg
      plexTokenStatusKind.value = kind
      if (ms > 0) setTimeout(() => (plexTokenStatus.value = ''), ms)
    }

    const plexTokenSet = ref(false)

    const mediaRoot = ref('')
    const mediaRootTesting = ref(false)
    const mediaRootStatus = ref('')
    const mediaRootStatusKind = ref('ok')

    const saved = reactive({
      mediaRoot: '', recordingsRoot: '', tvhRecordingsPath: '', plexUrl: '', plexSectionId: '', plexPrefsPath: '',
    })
    const syncCron = ref(DEFAULT_SYNC_CRON)
    const syncFrequencyText = computed(() => syncFrequency(syncCron.value))

    const hasExistingConfig = computed(() =>
      Boolean(tvhUrl.value || tvhPasswordSet.value || saved.plexUrl || plexTokenSet.value || saved.plexSectionId),
    )

    onMounted(async () => {
      const s = await fetchSettings().catch(() => ({}))
      tvhUrl.value = s.tvh_url || ''
      tvhConnected.value = Boolean(s.tvh_url)
      tvhUsername.value = s.tvh_username || ''
      tvhPasswordSet.value = Boolean(s.tvh_password_set)
      syncCron.value = s.sync_cron_effective || DEFAULT_SYNC_CRON
      tzSource.value = s.tz_source || 'system'
      timeZone.value = s.time_zone || s.tz_env || browserTimeZone() || s.tz || 'UTC'
      recordingsRoot.value = s.recordings_root || ''
      tvhRecordingsPath.value = s.tvh_recordings_path || ''
      mediaRoot.value = s.media_root || ''
      plexUrl.value = s.plex_url || ''
      plexTokenSet.value = Boolean(s.plex_token_set)
      plexSectionId.value = s.plex_tv_section_id || ''
      plexPrefsPath.value = s.plex_prefs_path || ''
      Object.assign(saved, {
        mediaRoot: mediaRoot.value,
        recordingsRoot: recordingsRoot.value,
        tvhRecordingsPath: tvhRecordingsPath.value,
        plexUrl: plexUrl.value,
        plexSectionId: plexSectionId.value,
        plexPrefsPath: plexPrefsPath.value,
      })
    })

    const showMediaRootResult = (r) => {
      mediaRootStatus.value = r.ok ? `${r.path} is writable.` : r.error
      mediaRootStatusKind.value = r.ok ? 'ok' : 'err'
    }

    const testMediaRoot = async () => {
      mediaRootTesting.value = true
      mediaRootStatus.value = ''
      try {
        showMediaRootResult(await api('POST', '/api/media-root-test', { path: mediaRoot.value }))
      } catch (err) {
        mediaRootStatus.value = `Test failed: ${err.message}`
        mediaRootStatusKind.value = 'err'
      } finally {
        mediaRootTesting.value = false
      }
    }

    const storageChecking = ref(false)
    const storageChecked = ref(false)
    const storageProblems = ref([])
    const storageNotes = ref([])
    const storageAdvancedOpen = ref(false)
    const storageSummary = computed(() => storageSummaryText({
      mediaRoot: mediaRoot.value,
      recordingsRoot: recordingsRoot.value,
    }))
    const storageChanges = computed(() => changedSettings([
      ['media_root', mediaRoot.value, saved.mediaRoot],
      ['recordings_root', recordingsRoot.value, saved.recordingsRoot],
      ['tvh_recordings_path', tvhRecordingsPath.value, saved.tvhRecordingsPath],
    ]))

    const clearStaleLibraryStatus = () => {
      mediaRootStatus.value = ''
      recordingsCheck.clear()
    }

    const checkStorage = async () => {
      storageChecking.value = true
      mediaRootTesting.value = true
      mediaRootStatus.value = 'Checking…'
      mediaRootStatusKind.value = 'busy'
      recordingsCheck.begin()
      tvhPathCheck.begin()
      const folders = {
        mediaRoot: mediaRoot.value,
        recordingsRoot: recordingsRoot.value,
        tvhRecordingsPath: tvhRecordingsPath.value,
      }
      const [library, recordings, tvh] = await Promise.all([
        api('POST', '/api/media-root-test', { path: folders.mediaRoot }).catch(failedCheck),
        api('POST', '/api/recordings-root-test', { path: folders.recordingsRoot, media_root: folders.mediaRoot })
          .catch(failedCheck),
        api('POST', '/api/tvh-recordings-path-check', { path: folders.tvhRecordingsPath }).catch(failedCheck),
      ])
      if (tvh.ok && !tvh.configured && tvh.tvhPath) tvhRecordingsPath.value = tvh.tvhPath
      showMediaRootResult(library)
      mediaRootTesting.value = false
      recordingsCheck.show(describeRecordingsFolder(recordings))
      tvhPathCheck.show(describeTvhRecordingsPath({ r: tvh, fill: (value) => (tvhRecordingsPath.value = value) }))
      const outcome = storageCheckOutcome({ folders, library, recordings, tvh })
      storageProblems.value = outcome.problems
      storageNotes.value = outcome.notes
      storageAdvancedOpen.value = outcome.problems.length > 0
      storageChecked.value = true
      storageChecking.value = false
    }

    const plexChecking = ref(false)
    const plexConnected = ref(false)
    const plexProblem = ref(null)
    const plexAdvancedOpen = ref(false)
    const plexEditedByHand = computed(() =>
      [plexUrl.value, plexToken.value, plexSectionId.value].some((field) => String(field ?? '').trim()))
    const plexDocsUrl = `${DOCS_BASE}guide/plex`
    const plexShowSections = computed(() => plexSections.value.filter((sec) => sec.type === 'show'))
    const hasPlexToken = () => Boolean(plexToken.value || plexTokenSet.value)

    let sectionAutoLoadTimer = null
    watch([plexUrl, plexToken], ([url, token]) => {
      plexConnected.value = false
      clearTimeout(sectionAutoLoadTimer)
      if (!url || !token || plexChecking.value) return
      sectionAutoLoadTimer = setTimeout(() => loadPlexSections({ silent: true }), 600)
    })

    const channelState = ref({ busy: false, channels: 0, actionShown: false })
    const guideStep = ref(null)
    const guideState = ref({ busy: false, linked: 0, pending: 0 })

    const readySkipped = computed(() => {
      if (!channelState.value.channels) {
        return [{
          step: 3,
          text: 'No channels yet. The TV Guide stays empty until you scan for channels.',
          action: 'Go to Channels',
        }]
      }
      if (!guideState.value.linked) {
        return [{
          step: 4,
          text: 'No guide linked yet. Freetvarr cannot record a show by name without one.',
          action: 'Go to Guide',
        }]
      }
      return []
    })

    const canAdvance = computed(() => {
      if (step.value === 2) return Boolean(tvhUrl.value.trim()) && !showSecure.value
      if (step.value === 3) return !channelState.value.busy
      if (step.value === 4) return !guideState.value.busy
      return true
    })

    const advanceHint = computed(() => {
      if (step.value === 3) return 'Wait for the channel setup to finish.'
      if (step.value === 4) return 'Wait for the guide setup to finish.'
      return tvhUrl.value.trim()
        ? 'Secure TVHeadend first, or choose to set up users yourself.'
        : 'A TVHeadend URL is required to continue.'
    })

    const plexWillSave = computed(() => plexConnected.value || plexEditedByHand.value)
    const plexIsSetUp = computed(() => plexWillSave.value || Boolean(saved.plexUrl))

    const nextLabel = computed(() => {
      if (step.value === totalSteps) return 'Open the Guide'
      if (step.value === 2) return 'Save and next'
      if (step.value === 3) return channelState.value.channels ? 'Next' : 'Skip'
      if (step.value === 4) {
        if (guideState.value.pending) return 'Save and next'
        return guideState.value.linked ? 'Next' : 'Skip'
      }
      if (step.value === 5) return Object.keys(storageChanges.value).length ? 'Save and next' : 'Next'
      if (step.value === 6) {
        if (plexConnected.value) return 'Next'
        return plexEditedByHand.value ? 'Save and next' : 'Skip'
      }
      return 'Next'
    })

    const nextIsPrimary = computed(() => {
      if (step.value === 3) return channelState.value.channels > 0 && !channelState.value.actionShown
      if (step.value === 4) return nextLabel.value !== 'Skip'
      return true
    })

    const dismiss = async () => {
      try {
        await api('POST', '/api/settings', { welcome_dismissed: true })
      } catch { /* wizard closes anyway */ }
    }

    const { confirming, confirmBusy, askConfirm, closeConfirm, runConfirmed } = useConfirm()

    const leaveSetup = async () => {
      await dismiss()
      window.location.hash = '#/settings'
    }

    const skipToSettings = () => askConfirm({
      dialog: wizardSkipConfirm({ tvhConnected: tvhConnected.value }),
      run: leaveSetup,
    })

    const back = () => {
      if (step.value > 1) {
        clearSaveStatus()
        step.value--
      }
    }

    const saveStorage = async () => {
      if (!Object.keys(storageChanges.value).length) return
      await api('POST', '/api/settings', storageChanges.value)
      Object.assign(saved, {
        mediaRoot: mediaRoot.value,
        recordingsRoot: recordingsRoot.value,
        tvhRecordingsPath: tvhRecordingsPath.value,
      })
    }

    const savePlex = async () => {
      if (!plexWillSave.value) return
      const body = {
        plex_url: plexUrl.value,
        plex_tv_section_id: plexSectionId.value,
        ...changedSettings([['plex_prefs_path', plexPrefsPath.value, saved.plexPrefsPath]]),
        ...(plexToken.value ? { plex_token: plexToken.value } : {}),
      }
      await api('POST', '/api/settings', body)
      Object.assign(saved, {
        plexUrl: plexUrl.value,
        plexSectionId: plexSectionId.value,
        plexPrefsPath: plexPrefsPath.value,
      })
    }

    const next = async () => {
      if (step.value === totalSteps) {
        await dismiss()
        window.location.hash = '#/guide'
        return
      }
      clearSaveStatus()
      saving.value = true
      try {
        if (step.value === 1) {
          await api('POST', '/api/settings', { time_zone: timeZone.value })
          tz.value = timeZone.value
          tzSource.value = 'setting'
        } else if (step.value === 2) {
          const connected = await testTvh()
          if (!connected) {
            setSaveStatus('Connection failed. Correct the TVHeadend details to continue.', 'err', 0)
            return
          }
        } else if (step.value === 4) {
          await guideStep.value?.saveLinks()
        } else if (step.value === 5) {
          await saveStorage()
        } else if (step.value === 6) {
          await savePlex()
        }
        step.value++
      } catch (err) {
        setSaveStatus(`Save failed: ${err.message}`, 'err', 5000)
      } finally {
        saving.value = false
      }
    }

    const fetchPlexSections = async () => {
      const body = { plex_url: plexUrl.value }
      if (plexToken.value) body.plex_token = plexToken.value
      const { sections = [] } = await api('POST', '/api/plex-sections', body)
      plexSections.value = sections
      plexSectionLoads.value++
      plexConnected.value = true
      plexProblem.value = null
      if (!plexSectionId.value) plexSectionId.value = guessPlexTvSection({ sections, mediaRoot: mediaRoot.value })
      return sections
    }

    const loadPlexSections = async ({ silent = false } = {}) => {
      plexProbing.value = true
      try {
        const sections = await fetchPlexSections()
        if (!silent) setPlexSections(`Connected. Plex has ${sections.length} libraries.`, 'ok', 5000)
      } catch (err) {
        plexConnected.value = false
        if (!silent) setPlexSections(`Could not reach Plex: ${err.message}`, 'err', 5000)
      } finally {
        plexProbing.value = false
      }
    }

    const usePlexLibraries = (selected) => {
      if (selected.tv) plexSectionId.value = selected.tv
      loadPlexSections({ silent: true })
    }

    const connectPlexAt = async ({ url, guessed = false }) => {
      const before = plexUrl.value
      plexUrl.value = url
      try {
        await fetchPlexSections()
        return {}
      } catch (err) {
        if (guessed) plexUrl.value = before
        return { problem: plexUnreachableProblem({ url, error: err.message }) }
      }
    }

    const connectFoundPlex = async (url) => {
      if (hasPlexToken()) return connectPlexAt({ url })
      plexUrl.value = url
      return { problem: plexNoTokenProblem(url) }
    }

    const detectPlexTokenQuietly = async () => {
      const r = await api('POST', '/api/plex-detect-token').catch(() => ({}))
      if (!r.ok) return
      plexToken.value = r.token || ''
      plexTokenSet.value = true
    }

    const discoverPlexServers = () => api('POST', '/api/discover-plex')
      .then((r) => r.servers || [])
      .catch(() => [])

    const locatePlex = async () => {
      if (plexUrl.value && hasPlexToken()) return connectPlexAt({ url: plexUrl.value })
      const [, servers] = await Promise.all([detectPlexTokenQuietly(), discoverPlexServers()])
      if (servers.length > 1) {
        plexCandidates.value = servers
        return {}
      }
      if (servers.length === 1) return connectFoundPlex(plexServerUrl(servers[0]))
      if (hasPlexToken()) return connectPlexAt({ url: LOCAL_PLEX_URL, guessed: true })
      return {}
    }

    const runPlexCheck = async (task) => {
      plexChecking.value = true
      plexProblem.value = null
      try {
        const { problem = null } = await task()
        plexProblem.value = problem
        plexAdvancedOpen.value = Boolean(problem)
      } finally {
        plexChecking.value = false
      }
    }

    const findPlex = () => {
      plexCandidates.value = []
      return runPlexCheck(locatePlex)
    }

    const usePlexCandidate = (c) => {
      plexCandidates.value = []
      return runPlexCheck(() => connectFoundPlex(plexServerUrl(c)))
    }

    const detectPlexToken = async () => {
      plexDetectingToken.value = true
      try {
        if (plexPrefsPath.value) {
          await api('POST', '/api/settings', { plex_prefs_path: plexPrefsPath.value })
        }
        const r = await api('POST', '/api/plex-detect-token')
        if (r.ok) {
          plexToken.value = r.token || ''
          setPlexTokenStatus(`Token detected from ${r.source}.`, 'ok', 5000)
        } else {
          setPlexTokenStatus(`Auto-detect failed: ${r.reason}`, 'err', 8000)
        }
      } catch (err) {
        setPlexTokenStatus(`Auto-detect failed: ${err.message}`, 'err', 8000)
      } finally {
        plexDetectingToken.value = false
      }
    }

    const tvhDetecting = ref(false)
    const tvhCandidates = ref([])
    const [tvhDiscoverText, tvhDiscoverKind, setTvhDiscover] = makeStatus()
    const useTvhCandidate = (c) => {
      tvhUrl.value = c.url
      tvhCandidates.value = []
      setTvhDiscover(tvhDetectSummary(c), c.loopback ? 'info' : 'ok', 0)
    }
    const tvhAutoScanning = ref(false)
    const detectTvh = async ({ quiet = false } = {}) => {
      tvhDetecting.value = true
      tvhAutoScanning.value = quiet
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
        if (quiet) setTvhDiscover('', 'info', 0)
        else setTvhDiscover(`Auto-discover failed: ${err.message}`, 'err', 8000)
      } finally {
        tvhDetecting.value = false
        tvhAutoScanning.value = false
      }
    }
    watch(step, (curr) => {
      if (curr === 2 && !tvhUrl.value.trim()) detectTvh({ quiet: true })
      if (curr === 2) checkBootstrap()
      if (curr === 5) checkStorage()
      if (curr === 6) findPlex()
    })
    watch([tvhUrl, tvhUsername, tvhPassword], () => {
      if (step.value === 2) clearSaveStatus()
    })

    const bootstrap = ref(null)
    const manualLogin = ref(false)
    const securing = ref(false)
    const securedAs = ref('')
    const secureAdminUsername = ref('admin')
    const secureAdminPassword = ref('')
    const secureShowPassword = ref(false)
    const secureAdminPasswordInput = ref(null)
    const securePrefixes = ref('')
    const secureSteps = ref([])
    const secureRevealed = ref(0)
    const secureShownSteps = computed(() =>
      pacedSteps({ steps: secureSteps.value, revealed: secureRevealed.value }))
    const secureError = ref('')
    const secureStepsVisible = computed(() => secureShownSteps.value.length > 0)
    const secureNext = ref('')
    const showSecure = computed(() => Boolean(bootstrap.value?.fresh) && !manualLogin.value && !securedAs.value)
    const secureInputProblem = computed(() => bootstrapInputProblem({
      username: secureAdminUsername.value,
      password: secureAdminPassword.value,
      prefixes: securePrefixes.value,
    }))
    const secureReady = computed(() => !secureInputProblem.value)

    let bootstrapCheckTimer = null
    const checkBootstrap = () => {
      clearTimeout(bootstrapCheckTimer)
      const url = tvhUrl.value.trim()
      if (!url || step.value !== 2) return
      bootstrapCheckTimer = setTimeout(async () => {
        const status = await api('GET', `/api/tvh-bootstrap/status?url=${encodeURIComponent(url)}`).catch(() => null)
        if (url !== tvhUrl.value.trim()) return
        bootstrap.value = status
        if (status?.fresh && !securePrefixes.value) {
          securePrefixes.value = withBrowserNetwork({
            prefixes: status.suggestedPrefixes,
            host: window.location.hostname,
          }).join(', ')
        }
      }, BOOTSTRAP_CHECK_DELAY_MS)
    }
    watch(tvhUrl, () => {
      bootstrap.value = null
      checkBootstrap()
    })
    watch(showSecure, async (visible) => {
      if (!visible) return
      await nextTick()
      secureAdminPasswordInput.value?.focus()
    })

    const backToSecureForm = async () => {
      secureSteps.value = []
      secureRevealed.value = 0
      secureError.value = ''
      secureNext.value = ''
      await nextTick()
      secureAdminPasswordInput.value?.focus()
    }

    const focusFirstFieldOnOpen = (event) => {
      const disclosure = event.currentTarget.parentElement
      if (disclosure.open) return
      requestAnimationFrame(() => disclosure.querySelector('input')?.focus())
    }

    const useManualLogin = () => {
      manualLogin.value = true
      secureSteps.value = []
      secureRevealed.value = 0
      secureError.value = ''
      secureNext.value = ''
    }

    const revealSecureSteps = async (isSettled) => {
      if (!prefersReducedMotion()) {
        const stepMs = revealStepMs(secureSteps.value.length, STEP_PACING)
        while (secureRevealed.value < secureSteps.value.length) {
          const shownAt = Date.now()
          while (!isStepResolved(secureSteps.value[secureRevealed.value])) {
            if (isSettled()) break
            await wait(BOOTSTRAP_REVEAL_POLL_MS)
          }
          const step = secureSteps.value[secureRevealed.value]
          if (!isStepResolved(step)) break
          await wait(Math.max(0, stepMs - (Date.now() - shownAt)))
          secureRevealed.value += 1
          if (step.status === 'failed') break
        }
      }
      secureRevealed.value = secureSteps.value.length
    }

    const secureTvh = async () => {
      securing.value = true
      secureError.value = ''
      secureNext.value = ''
      secureRevealed.value = 0
      secureSteps.value = (bootstrap.value?.steps || []).map((s) => ({ ...s, status: 'pending' }))
      let settled = false
      const reveal = revealSecureSteps(() => settled)
      const poll = setInterval(async () => {
        const progress = await api('GET', '/api/tvh-bootstrap/progress').catch(() => null)
        if (!settled && progress?.steps?.length) secureSteps.value = progress.steps
      }, BOOTSTRAP_POLL_MS)
      try {
        const result = await api('POST', '/api/tvh-bootstrap/apply', {
          url: tvhUrl.value.trim(),
          admin_username: secureAdminUsername.value.trim(),
          admin_password: secureAdminPassword.value,
          prefixes: securePrefixes.value,
        })
        settled = true
        secureSteps.value = result.steps
        await reveal
        securedAs.value = result.adminUsername
        secureAdminPassword.value = ''
        tvhUsername.value = result.username
        tvhPassword.value = ''
        tvhPasswordSet.value = true
        await testTvh()
      } catch (err) {
        settled = true
        if (err.data?.steps) secureSteps.value = err.data.steps
        await reveal
        secureError.value = err.message
        secureNext.value = err.data?.next || ''
        if (err.data?.code === 'not-fresh') manualLogin.value = true
      } finally {
        clearInterval(poll)
        securing.value = false
      }
    }

    const testTvh = async () => {
      tvhTesting.value = true
      setTvhText('Contacting TVHeadend…', 'busy', 0)
      try {
        const r = await api('POST', '/api/tvh-test', {
          tvh_url: tvhUrl.value.trim(),
          tvh_username: tvhUsername.value.trim(),
          ...(tvhPassword.value ? { tvh_password: tvhPassword.value } : {}),
        })
        if (tvhPassword.value) {
          tvhPasswordSet.value = true
          tvhPassword.value = ''
        }
        setTvhText(tvhTestSummary(r), 'ok', 8000)
        tvhConnected.value = true
        return true
      } catch (err) {
        setTvhText(`Failed: ${err.message}`, 'err', 0)
        return false
      } finally {
        tvhTesting.value = false
      }
    }

    return {
      step, totalSteps, stepTitle, saving, canAdvance, nextLabel, nextIsPrimary, plexIsSetUp, syncFrequencyText, guideStep, hasExistingConfig, channelState, guideState, readySkipped,
      timeZone, tzSource,
      tvhUrl, tvhUsername, tvhPassword, tvhPasswordSet, tvhTesting,
      recordingsRoot, tvhRecordingsPath, recordingsCheck, tvhPathCheck,
      plexUrl, plexToken, plexTokenSet, plexSectionId, plexSections, plexProbing,
      plexCandidates, plexDetectingToken, plexPrefsPath, plexSectionLoads, usePlexLibraries,
      plexChecking, plexConnected, plexProblem, plexAdvancedOpen, plexEditedByHand, plexDocsUrl, plexShowSections, findPlex,
      storageChecking, storageChecked, storageProblems, storageNotes, storageAdvancedOpen, storageSummary, checkStorage, clearStaleLibraryStatus,
      focusFirstFieldOnOpen, manualLogin,
      plexTokenStatus, plexTokenStatusKind,
      mediaRoot, mediaRootTesting, mediaRootStatus, mediaRootStatusKind, testMediaRoot,
      back, next, skipToSettings, confirming, confirmBusy, closeConfirm, runConfirmed, loadPlexSections, testTvh, advanceHint,
      showSecure, secureStepsVisible, backToSecureForm, securing, securedAs, secureAdminUsername, secureAdminPassword, secureShowPassword, secureAdminPasswordInput,
      securePrefixes, secureShownSteps, secureError, secureNext, secureInputProblem, secureReady,
      secureTvh, useManualLogin, secureStepDot,
      detectTvh, tvhDetecting, tvhAutoScanning, tvhCandidates, useTvhCandidate, tvhDiscoverText, tvhDiscoverKind,
      usePlexCandidate, detectPlexToken,
      plexSectionsText, plexSectionsKind,
      tvhText, tvhKind,
      saveStatusText, saveStatusKind,
    }
  },
}

const bootstrapInputProblem = ({ username, password, prefixes }) => {
  if (!username.trim()) return 'Choose an admin username.'
  if (password.length < BOOTSTRAP_MIN_PASSWORD) return `Choose an admin password of at least ${BOOTSTRAP_MIN_PASSWORD} characters.`
  if (!prefixes.trim()) return 'Enter at least one allowed network.'
  return ''
}

const failedCheck = (err) => ({ ok: false, problem: 'request', error: err.message })

const changedSettings = (entries) => Object.fromEntries(
  entries.filter(([, value, savedValue]) => value !== savedValue).map(([key, value]) => [key, value]),
)

const storageSummaryText = ({ mediaRoot, recordingsRoot }) => {
  const inDataFolder = [mediaRoot, recordingsRoot].every((folder) => isInsideFolder({ folder, root: COMPOSE_DATA_ROOT }))
  if (inDataFolder) return 'Recordings and your TV library are saved in the data folder inside the folder you installed Freetvarr to.'
  return `Freetvarr reads recordings from ${recordingsRoot} and saves your TV library to ${mediaRoot}.`
}

const storageCheckOutcome = ({ folders, library, recordings, tvh }) => {
  const problems = [
    folderProblem({ result: library, path: folders.mediaRoot, name: 'TV library folder', access: 'save to' }),
    folderProblem({ result: recordings, path: folders.recordingsRoot, name: 'recordings folder', access: 'read' }),
    tvhFolderProblem({ result: tvh, configured: folders.tvhRecordingsPath }),
  ].filter(Boolean)
  const notes = recordings.ok && recordings.hardlinks === false ? [COPY_IMPORT_NOTE] : []
  return { problems, notes }
}

const folderProblem = ({ result, path, name, access }) => {
  if (result.ok) return null
  const changeIt = `Change the ${name} under Advanced: change folders.`
  const problems = {
    empty: { text: `The ${name} is blank.`, fix: changeIt },
    relative: { text: `The ${name} must start with /.`, fix: changeIt },
    'not-folder': { text: `${path} is a file, not a folder.`, fix: changeIt },
    missing: {
      text: `Your ${name} ${path} does not exist.`,
      fix: `Check that docker-compose.yml shares this folder with Freetvarr, then run docker compose up -d. Or change the ${name} under Advanced: change folders.`,
    },
    denied: {
      text: `Freetvarr cannot ${access} your ${name} ${path}.`,
      fix: 'Set PUID and PGID in .env to the owner of the data folder, then run docker compose up -d.',
    },
    request: { text: `Freetvarr could not check your ${name}: ${withoutFullStop(result.error)}.`, fix: 'Press Check again.' },
  }
  return problems[result.problem]
    || { text: `Freetvarr cannot ${access} your ${name} ${path}: ${withoutFullStop(result.error)}.`, fix: changeIt }
}

const tvhFolderProblem = ({ result, configured }) => {
  if (!result.ok) {
    return {
      text: 'Freetvarr could not ask TVHeadend where it saves recordings.',
      fix: 'Go back to the TVHeadend step and press Test connection.',
    }
  }
  if (!result.tvhPath) {
    return {
      text: 'TVHeadend has no folder set for recordings.',
      fix: 'In TVHeadend, set the recording path in the DVR profile, then press Check again.',
    }
  }
  if (result.matches || !result.configured) return null
  return {
    text: `TVHeadend saves recordings to ${result.tvhPath}, but Freetvarr expects ${configured}.`,
    fix: `Set the recording path in TVHeadend's DVR profile to ${configured}, or change the folders under Advanced: change folders.`,
  }
}

const guessPlexTvSection = ({ sections, mediaRoot }) => sections
  .find((sec) => sec.type === 'show' && (sec.locations || []).some((folder) => sameFolder(folder, mediaRoot)))
  ?.key || ''

const plexServerUrl = (server) => `http://${server.ip}:${server.port}`

const plexNoTokenProblem = (url) => ({
  text: `Found Plex at ${url}, but Freetvarr could not find its token.`,
  fix: 'Paste the token under Advanced: connect Plex by hand.',
})

const plexUnreachableProblem = ({ url, error }) => ({
  text: `Freetvarr could not connect to Plex at ${url}: ${withoutFullStop(error)}.`,
  fix: 'Check that Plex is running, then press Check again. Skip leaves your Plex settings as they are.',
})

const isInsideFolder = ({ folder, root }) => {
  const path = withoutTrailingSlash(folder)
  return path === root || path.startsWith(`${root}/`)
}

const sameFolder = (a, b) => withoutTrailingSlash(a) === withoutTrailingSlash(b)

const withoutTrailingSlash = (path) => String(path || '').trim().replace(/(.)\/+$/, '$1')

const withoutFullStop = (text) => String(text || '').trim().replace(/\.+$/, '')

const COMPOSE_DATA_ROOT = '/data'
const LOCAL_PLEX_URL = 'http://127.0.0.1:32400'
const COPY_IMPORT_NOTE = 'Recordings and your TV library are on different disks or mounts, so each import makes a full copy of the recording.'

const BOOTSTRAP_CHECK_DELAY_MS = 500
const BOOTSTRAP_POLL_MS = 400

const BOOTSTRAP_MIN_PASSWORD = 8
