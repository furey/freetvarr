import {
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
} from '/vendor/vue.esm-browser.prod.js'
import { revealStepMs, isStepResolved, pacedSteps, STEP_PACING } from '/paced-reveal.js'
import { DEFAULT_SYNC_CRON, SYNC_SCHEDULE_PRESETS, syncSchedulePreset } from '/sync-schedule.js'
import { withBrowserNetwork } from '/lan-network.js'
import { wizardSkipConfirm } from '/wizard-skip.js'
import { useConfirm } from '/components/dialogs.js'
import { morphBarsIntoChips } from '/components/setup-morph.js'
import {
  SETUP_STEPS,
  partFills,
  stepCaption,
  railGroups,
  stepDoneValues,
  readySummaryRows,
  isSetupComplete,
} from '/setup-steps.js'
import {
  failedCheck,
  changedSettings,
  storageSummaryText,
  storageCheckOutcome,
  folderRows,
  guessPlexTvSection,
  plexServerUrl,
  plexNoTokenProblem,
  plexUnreachableProblem,
  LOCAL_PLEX_URL,
} from '/setup-folders.js'
import { formatClock } from '/time-format.js'
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
import { SetupRunList, SetupStatusIcon, BOOTSTRAP_REVEAL_POLL_MS } from '/views/welcome-shared.js'
import { SystemTour } from '/components/system-tour.js'

const syncFrequency = (cron) => {
  const preset = SYNC_SCHEDULE_PRESETS.find((p) => p.cron === syncSchedulePreset(cron))
  return preset ? preset.label.toLowerCase() : 'on your sync schedule'
}

export const WelcomeView = {
  components: { SetupRunList, SetupStatusIcon, SystemTour },
  template: `
    <div :class="['setup-page', { 'has-rail': step > 1 }]">
      <system-tour v-if="step === 1 && touring" @done="startFromTour" />
      <section v-else-if="step === 1" class="setup-hero" aria-labelledby="setup-hero-title">
        <button type="button" class="setup-later setup-hero-later" @click="skipToSettings">Finish later</button>
        <div class="setup-hero-inner">
          <h1 id="setup-hero-title" class="setup-hero-title"><brand-wordmark class="setup-hero-word" data-intro-target /></h1>
          <p class="setup-hero-lede">Record free-to-air TV and watch it on any screen.</p>
          <p class="setup-hero-sub">Setup connects Freetvarr to your tuner. Most of it runs by itself; you check what it finds.</p>
        </div>
        <div class="setup-hero-inner">
          <ol class="ui-group setup-plan">
            <li v-for="(part, index) in PLAN" :key="part.title" class="ui-group-row">
              <span class="setup-plan-num" aria-hidden="true">{{ index + 1 }}</span>
              <span class="ui-group-row-main"><span class="ui-group-row-title">{{ part.title }}</span><span class="ui-group-row-meta">{{ part.meta }}</span></span>
            </li>
          </ol>
        </div>
        <div class="setup-hero-inner setup-block">
          <div class="ui-group">
            <div class="setup-select-row">
              <label class="ui-group-row-main" for="setup-time-zone">
                <span class="ui-group-row-title">Time zone</span>
                <span class="ui-group-row-meta ui-tabular">Now {{ zoneClock }}</span>
              </label>
              <select id="setup-time-zone" class="field-input" v-model="timeZone">
                <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
              </select>
            </div>
          </div>
          <p class="setup-quiet-text">{{ zoneSourceText }}</p>
          <p v-if="hasExistingConfig" class="setup-quiet-text">Your saved settings are filled in. A field you leave as it is keeps its saved value.</p>
        </div>
        <div class="setup-hero-inner setup-hero-start">
          <button type="button" class="ui-button ui-button-secondary" @click="touring = true">How it works</button>
          <button type="button" class="ui-button ui-button-primary" @click="next" :disabled="saving">Start setup <arrow-right-icon /></button>
          <p v-if="saveStatusText" class="setup-hint is-error">{{ saveStatusText }}</p>
        </div>
      </section>

      <template v-else>
        <div class="setup-top">
          <div :class="['setup-progress', { 'is-hidden': markState === 'chips' }]" role="progressbar" aria-valuemin="0" :aria-valuemax="STEP_COUNT"
            :aria-valuenow="Math.min(current, STEP_COUNT)" :aria-label="caption">
            <div v-for="(fill, index) in fills" :key="index" class="setup-progress-chip"><span class="setup-progress-track" data-morph-chrome></span><span class="setup-progress-fill" data-morph-bar :style="{ transform: 'scaleX(' + fill + ')' }"></span></div>
          </div>
          <div class="setup-top-row" data-morph-chrome>
            <span class="ui-meta">{{ caption }}</span>
            <button v-if="!isReady" type="button" class="setup-later" @click="skipToSettings">Finish later</button>
          </div>
        </div>

        <aside class="setup-rail" aria-label="Setup steps">
          <div v-for="group in rail" :key="group.label" class="setup-rail-group">
            <p class="setup-rail-label">
              <span :class="['setup-rail-bar', { 'is-hidden': markState === 'chips' }]"><span class="setup-progress-track" data-morph-chrome></span><span class="setup-progress-fill" data-morph-bar :style="{ transform: 'scaleX(' + group.fill + ')' }"></span></span>
              {{ group.label }}
            </p>
            <template v-for="item in group.steps" :key="item.key">
              <button v-if="item.state === 'done' && !isReady" type="button" class="setup-rail-step is-done" @click="jumpTo(item.index)">
                <span class="setup-rail-step-title">{{ item.title }}</span>
                <span v-if="item.value" class="setup-rail-step-value">{{ item.value }}</span>
              </button>
              <div v-else :class="['setup-rail-step', 'is-' + item.state]" :aria-current="item.state === 'current' ? 'step' : null">
                <span class="setup-rail-step-title">{{ item.title }}</span>
                <span v-if="item.value" class="setup-rail-step-value">{{ item.value }}</span>
              </div>
            </template>
          </div>
          <div class="setup-rail-foot">
            <button v-if="!isReady" type="button" class="setup-later" @click="skipToSettings">Finish later</button>
          </div>
        </aside>

        <main class="setup-main">
          <header class="setup-head">
            <brand-mark v-if="isReady && complete" ref="doneMark" :class="['setup-done-mark', { 'is-shown': markState === 'chips' }]" />
            <h1 ref="heading" tabindex="-1" class="ui-page-title">{{ stepTitle }}</h1>
            <p v-if="subtitle" class="ui-page-subtitle">{{ subtitle }}</p>
          </header>

          <div v-if="step === 2" class="setup-body">
            <div class="setup-block">
              <div class="setup-fields">
                <div class="field-row">
                  <label class="field-label" for="setup-tvh-url">TVHeadend address</label>
                  <input v-no-autofill id="setup-tvh-url" type="text" inputmode="url" :class="['field-input', { 'is-invalid': tvhKind === 'err' }]" v-model="tvhUrl" placeholder="e.g. http://192.168.1.10:9981" />
                  <p v-if="tvhKind === 'err' && tvhText" class="setup-hint is-error" role="status">{{ tvhText }}</p>
                  <p v-else-if="tvhDetecting" class="setup-hint"><span class="setup-spinner" aria-hidden="true"></span>Searching your network…</p>
                  <p v-else-if="tvhDiscoverText" class="setup-hint">
                    <span :class="tvhDiscoverKind === 'err' ? 'setup-text-error' : tvhDiscoverKind === 'ok' ? 'setup-text-ok' : ''">{{ tvhDiscoverText }}</span>
                    · <button type="button" class="setup-inline-link" @click="detectTvh()">Search again</button>
                  </p>
                  <p v-else class="setup-hint"><button type="button" class="setup-inline-link" @click="detectTvh()">Search your network</button></p>
                </div>
              </div>
              <div v-if="tvhCandidates.length > 1" class="ui-group">
                <button v-for="c in tvhCandidates" :key="c.url" type="button" class="ui-group-row" @click="useTvhCandidate(c)">
                  <span class="ui-group-row-main"><span class="ui-group-row-title">Use this TVHeadend</span><span class="ui-group-row-meta setup-mono">{{ c.url }}</span></span>
                </button>
              </div>
            </div>

            <div v-if="showSecure && !secureStepsVisible" class="setup-block">
              <h2 class="ui-group-label">Secure TVHeadend</h2>
              <div class="ui-banner is-warning"><span class="ui-banner-text">This TVHeadend has no logins yet, so anyone on your network can change it. Freetvarr makes an admin login for you and one for itself, then turns off open access.</span></div>
              <div class="setup-fields is-two">
                <div class="field-row">
                  <label class="field-label" for="setup-admin-user">Admin username</label>
                  <input v-no-autofill id="setup-admin-user" type="text" class="field-input" v-model="secureAdminUsername" :disabled="securing" />
                </div>
                <div class="field-row">
                  <label class="field-label" for="setup-admin-password">Admin password</label>
                  <div class="field-action-controls keeps-inline">
                    <input v-no-autofill.new-password id="setup-admin-password" ref="secureAdminPasswordInput" :type="secureShowPassword ? 'text' : 'password'" class="field-input" v-model="secureAdminPassword" :disabled="securing" />
                    <button type="button" class="ui-icon-button" @click="secureShowPassword = !secureShowPassword" :aria-label="secureShowPassword ? 'Hide password' : 'Show password'" :aria-pressed="secureShowPassword"><eye-off-icon v-if="secureShowPassword" /><eye-icon v-else /></button>
                  </div>
                  <p class="setup-hint">You sign in to TVHeadend with this. Freetvarr does not keep it.</p>
                </div>
                <div class="field-row is-wide">
                  <label class="field-label" for="setup-prefixes">Allowed networks</label>
                  <input v-no-autofill id="setup-prefixes" type="text" class="field-input" v-model="securePrefixes" :disabled="securing" placeholder="e.g. 192.168.1.0/24, 127.0.0.0/8" />
                  <p class="setup-hint">Both logins work only from these networks. Freetvarr guessed them from this computer and this browser; add any network you sign in to TVHeadend from.</p>
                </div>
              </div>
              <p class="setup-hint">Freetvarr signs in as <span class="setup-mono">freetvarr</span> with a password it makes and keeps for itself.</p>
              <button type="button" class="setup-quiet-link" :disabled="securing" @click="useManualLogin">Use my own TVHeadend login instead</button>
            </div>

            <div v-if="secureStepsVisible" class="setup-block">
              <setup-run-list :steps="secureShownSteps" />
            </div>
            <div v-if="secureError" class="setup-block">
              <p class="setup-hint is-error">{{ secureError }}</p>
              <p v-if="secureNext" class="setup-hint">{{ secureNext }}</p>
              <button v-if="showSecure && !securing" type="button" class="setup-quiet-link" @click="backToSecureForm">Back to the form</button>
            </div>
            <p v-if="securedAs" class="setup-hint"><span class="setup-text-ok">TVHeadend is secured.</span> Sign in to TVHeadend as {{ securedAs }} from now on; Freetvarr signs in as freetvarr.</p>

            <div v-if="!showSecure" class="setup-block">
              <div class="setup-fields is-two">
                <div class="field-row">
                  <label class="field-label" for="setup-tvh-user">Username</label>
                  <input v-no-autofill id="setup-tvh-user" type="text" class="field-input" v-model="tvhUsername" v-autofocus="manualLogin" />
                </div>
                <div class="field-row">
                  <label class="field-label" for="setup-tvh-password">Password</label>
                  <input v-no-autofill id="setup-tvh-password" type="password" class="field-input" v-model="tvhPassword"
                    :placeholder="tvhPasswordSet ? '••••• (stored)' : ''" autocomplete="off" />
                </div>
              </div>
              <p v-if="tvhTesting" class="setup-hint"><span class="setup-spinner" aria-hidden="true"></span>Contacting TVHeadend…</p>
              <p v-else-if="tvhKind === 'ok' && tvhText" class="setup-hint setup-text-ok" role="status">{{ tvhText }}</p>
              <p v-else-if="!securedAs" class="setup-hint">Leave both blank if TVHeadend allows access without a login.</p>
              <button v-if="canSecureAgain" type="button" class="setup-quiet-link" @click="manualLogin = false">Let Freetvarr secure TVHeadend instead</button>
            </div>
          </div>

          <channel-setup-step v-if="step === 3" ref="channelStep" :tvh-url="tvhUrl" action-in-bar @state="channelState = $event" />

          <guide-setup-step v-if="step === 4" ref="guideStep" :tvh-url="tvhUrl" action-in-bar @state="guideState = $event" @back="step = 3" />

          <div v-if="step === 5" class="setup-body">
            <div class="setup-block">
              <setup-run-list v-if="storageChecking" :steps="FOLDER_CHECK_STEPS" />
              <div v-else-if="storageChecked" class="ui-group">
                <div v-for="row in storageRows" :key="row.key" class="ui-group-row">
                  <setup-status-icon :status="row.ok ? 'done' : 'failed'" />
                  <span class="ui-group-row-main"><span class="ui-group-row-title">{{ row.title }}</span><span class="ui-group-row-meta setup-mono">{{ row.path }}</span></span>
                  <span class="ui-group-row-value">{{ row.value }}</span>
                </div>
              </div>
              <template v-for="p in storageProblems" :key="p.text">
                <p class="setup-hint is-error">{{ p.text }}</p>
                <p class="setup-hint">{{ p.fix }}</p>
              </template>
              <p v-for="note in storageNotes" :key="note" class="setup-hint">{{ note }}</p>
              <div class="setup-link-row">
                <button v-if="storageChecked" type="button" class="setup-quiet-link" @click="checkStorage">Check again</button>
                <button type="button" class="setup-quiet-link ui-disclosure-trigger" :aria-expanded="String(storageAdvancedOpen)" @click="storageAdvancedOpen = !storageAdvancedOpen">Change folders</button>
              </div>
            </div>
            <div v-if="storageAdvancedOpen" class="setup-block">
              <div class="setup-fields">
                <div class="field-row">
                  <label class="field-label" for="setup-media-root">TV library folder</label>
                  <div class="field-action-controls">
                    <input v-no-autofill v-autofocus id="setup-media-root" type="text" :class="['field-input', 'setup-mono-input', { 'is-invalid': mediaRootStatus && mediaRootStatusKind === 'err' }]" v-model="mediaRoot" @input="clearStaleLibraryStatus" placeholder="/data/media/tv" />
                    <button type="button" class="ui-button ui-button-secondary" @click="testMediaRoot" :disabled="mediaRootTesting">Test</button>
                  </div>
                  <p v-if="mediaRootStatus && !mediaRootTesting" :class="['setup-hint', { 'is-error': mediaRootStatusKind === 'err' }]" role="status">{{ mediaRootStatus }}</p>
                </div>
                <div class="field-row">
                  <label class="field-label" for="setup-recordings-root">Recordings folder, as Freetvarr sees it</label>
                  <div class="field-action-controls">
                    <input v-no-autofill id="setup-recordings-root" type="text" :class="['field-input', 'setup-mono-input', { 'is-invalid': recordingsCheck.text && recordingsCheck.kind === 'err' }]" v-model="recordingsRoot" @input="recordingsCheck.clear" placeholder="/data/recordings" />
                    <button type="button" class="ui-button ui-button-secondary" @click="recordingsCheck.run" :disabled="recordingsCheck.checking">Test</button>
                  </div>
                  <p v-if="recordingsCheck.text && !recordingsCheck.checking" :class="['setup-hint', { 'is-error': recordingsCheck.kind === 'err' }]" role="status">{{ recordingsCheck.text }}</p>
                </div>
                <div class="field-row">
                  <label class="field-label" for="setup-tvh-path">Recordings folder, as TVHeadend sees it</label>
                  <div class="field-action-controls">
                    <input v-no-autofill id="setup-tvh-path" type="text" :class="['field-input', 'setup-mono-input', { 'is-invalid': tvhPathCheck.text && tvhPathCheck.kind === 'err' }]" v-model="tvhRecordingsPath" @input="tvhPathCheck.clear" placeholder="/recordings" />
                    <button type="button" class="ui-button ui-button-secondary" @click="tvhPathCheck.run" :disabled="tvhPathCheck.checking">Test</button>
                  </div>
                  <p v-if="tvhPathCheck.text && !tvhPathCheck.checking" :class="['setup-hint', { 'is-error': tvhPathCheck.kind === 'err' }]" role="status">{{ tvhPathCheck.text }}</p>
                </div>
              </div>
              <p class="setup-hint">Enter each folder as Freetvarr sees it inside its container, from the volumes in docker-compose.yml. If you change a folder there, change it here too. TVHeadend and Freetvarr share the recordings folder, and each can see it at a different path.</p>
            </div>
          </div>

          <div v-if="step === 6" class="setup-body">
            <div class="setup-block">
              <setup-run-list v-if="plexChecking" :steps="PLEX_LOOK_STEPS" />
              <div v-else-if="plexConnected" class="ui-group">
                <div class="ui-group-row">
                  <setup-status-icon status="done" />
                  <span class="ui-group-row-main"><span class="ui-group-row-title">Plex</span><span class="ui-group-row-meta setup-mono">{{ plexUrl }}</span></span>
                  <span class="ui-group-row-value">Connected</span>
                </div>
                <div v-if="plexShowSections.length" class="setup-select-row">
                  <label class="ui-group-row-main" for="wizard-plex-tv-library"><span class="ui-group-row-title">TV library</span></label>
                  <select id="wizard-plex-tv-library" class="field-input" v-model="plexSectionId">
                    <option value="">Pick a library</option>
                    <option v-for="sec in plexShowSections" :key="sec.key" :value="sec.key">{{ sec.title }}</option>
                  </select>
                </div>
              </div>
              <div v-else-if="plexCandidates.length > 1" class="ui-group">
                <button v-for="c in plexCandidates" :key="c.ip + ':' + c.port" type="button" class="ui-group-row" @click="usePlexCandidate(c)">
                  <span class="ui-group-row-main"><span class="ui-group-row-title">{{ c.name || 'Plex' }}</span><span class="ui-group-row-meta setup-mono">{{ c.ip }}:{{ c.port }}</span></span>
                </button>
              </div>
              <template v-else-if="plexProblem">
                <p class="setup-hint is-error">{{ plexProblem.text }}</p>
                <p class="setup-hint">{{ plexProblem.fix }} <a :href="plexDocsUrl" target="_blank" rel="noopener noreferrer">Plex setup</a> has the details.</p>
                <button type="button" class="setup-quiet-link" @click="findPlex">Check again</button>
              </template>
              <p v-else class="setup-hint">Freetvarr did not find Plex. Recordings still go into your TV library folder for any media player. To add Plex, see <a :href="plexDocsUrl" target="_blank" rel="noopener noreferrer">Plex setup</a>.</p>
              <plex-library-setup v-if="!plexChecking" :plex-url="plexUrl" :plex-token="plexToken" :loads="plexSectionLoads"
                @created="usePlexLibraries" />
              <button type="button" class="setup-quiet-link ui-disclosure-trigger" :aria-expanded="String(plexAdvancedOpen)" @click="plexAdvancedOpen = !plexAdvancedOpen">Connect Plex by hand</button>
            </div>
            <div v-if="plexAdvancedOpen" class="setup-block">
              <div class="setup-fields">
                <div class="field-row">
                  <label class="field-label" for="setup-plex-url">Plex address</label>
                  <input v-no-autofill v-autofocus id="setup-plex-url" type="text" class="field-input" v-model="plexUrl" placeholder="e.g. http://192.168.1.10:32400" />
                </div>
                <div class="field-row">
                  <label class="field-label" for="setup-plex-token">Plex token</label>
                  <div class="field-action-controls">
                    <input v-no-autofill id="setup-plex-token" type="password" :class="['field-input', { 'is-invalid': plexTokenStatus && plexTokenStatusKind === 'err' }]" v-model="plexToken"
                      :placeholder="plexTokenSet ? '••••• (stored)' : 'Paste your Plex token'" autocomplete="off" />
                    <button type="button" class="ui-button ui-button-secondary" @click="detectPlexToken" :disabled="plexDetectingToken">Find token</button>
                  </div>
                  <p v-if="plexTokenStatus" :class="['setup-hint', { 'is-error': plexTokenStatusKind === 'err' }]" role="status">{{ plexTokenStatus }}</p>
                  <p class="setup-hint">Find token reads the token from Plex's settings file. It works with the Plex in Freetvarr's compose file. If you installed Plex yourself, enter the path to its Preferences.xml below, or paste the token from Plex.</p>
                </div>
                <div class="field-row">
                  <label class="field-label" for="setup-plex-prefs">Preferences.xml path, as Freetvarr sees it</label>
                  <input v-no-autofill id="setup-plex-prefs" type="text" class="field-input setup-mono-input" v-model="plexPrefsPath"
                    placeholder="/plex/Library/Application Support/Plex Media Server/Preferences.xml" />
                </div>
                <div v-if="!plexShowSections.length" class="field-row">
                  <label class="field-label" for="setup-plex-section">TV library number</label>
                  <input v-no-autofill id="setup-plex-section" type="text" class="field-input" v-model="plexSectionId" placeholder="Connect lists your libraries" />
                </div>
              </div>
              <p v-if="plexSectionsText" :class="['setup-hint', { 'is-error': plexSectionsKind === 'err' }]">{{ plexSectionsText }}</p>
              <button type="button" class="setup-quiet-link" @click="loadPlexSections()" :disabled="plexProbing || !plexUrl.trim()">Connect</button>
            </div>
          </div>

          <div v-if="isReady" class="setup-body">
            <div class="ui-group">
              <div v-for="row in summaryRows" :key="row.key" class="ui-group-row">
                <setup-status-icon :status="row.ok ? 'done' : 'failed'" />
                <span class="ui-group-row-main">
                  <span class="ui-group-row-title">{{ row.title }}</span>
                  <span class="ui-group-row-meta">{{ row.meta }}</span>
                  <button v-if="row.fix" type="button" class="setup-inline-link" @click="jumpToKey(row.fix.step)">{{ row.fix.label }}</button>
                </span>
                <span v-if="row.value" :class="['ui-group-row-value', { 'setup-mono': row.mono }]">{{ row.value }}</span>
              </div>
            </div>
            <p class="setup-quiet-text">Change any of this later in Settings → System → Setup. To check everything, <a href="#/settings/system/health">run the health checks</a>.</p>
            <button type="button" class="ui-button ui-button-primary setup-ready-action" @click="primary.run">{{ primary.label }}</button>
          </div>
        </main>

        <div :class="['setup-bar', { 'is-ready': isReady }]">
          <div class="setup-bar-inner">
            <button v-if="!isReady" type="button" class="ui-button ui-button-secondary setup-back" @click="back" :disabled="saving || securing" aria-label="Back">
              <arrow-left-icon /><span class="setup-back-label">Back</span>
            </button>
            <span :class="['setup-bar-note', { 'is-error': barNote.error }]" role="status">{{ barNote.text }}</span>
            <button v-if="secondary" type="button" class="ui-button ui-button-secondary" @click="secondary.run" :disabled="saving">{{ secondary.label }}</button>
            <button type="button" class="ui-button ui-button-primary setup-next" @click="primary.run" :disabled="primary.disabled">
              {{ primary.label }}
            </button>
          </div>
        </div>
      </template>
      <confirm-dialog :open="Boolean(confirming)" :dialog="confirming?.dialog" :icon="confirming?.icon"
        :busy="confirmBusy" @confirm="runConfirmed" @cancel="closeConfirm" />
    </div>
  `,
  setup() {
    const [plexSectionsText, plexSectionsKind, setPlexSections] = makeStatus()
    const [tvhText, tvhKind, setTvhText] = makeStatus()
    const [saveStatusText, saveStatusKind, setSaveStatus, clearSaveStatus] = makeStatus()
    const step = ref(1)
    const touring = ref(false)
    const totalSteps = FIRST_STEP + SETUP_STEPS.length
    const current = computed(() => step.value - FIRST_STEP)
    const isReady = computed(() => step.value === totalSteps)
    const fills = computed(() => partFills(current.value))
    const caption = computed(() => stepCaption(current.value))
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
    const clockMs = ref(Date.now())
    const clockTimer = setInterval(() => (clockMs.value = Date.now()), 15000)
    onUnmounted(() => clearInterval(clockTimer))
    const zones = computed(() => {
      const known = Intl.supportedValuesOf('timeZone')
      return timeZone.value && !known.includes(timeZone.value) ? [timeZone.value, ...known] : known
    })
    const zoneClock = computed(() => {
      try {
        return formatClock(clockMs.value, timeZone.value)
      } catch {
        return ''
      }
    })
    const zoneSourceText = computed(() => (tzSource.value === 'env'
      ? 'Pre-filled from TZ in your .env file.'
      : 'Pre-filled from this browser. Freetvarr uses it for the guide, recordings, and the sync schedule.'))

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
    const storageRows = ref([])
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
      storageRows.value = folderRows({ folders, library, recordings, tvh })
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

    const channelState = ref({ busy: false, channels: 0, actionShown: false, action: null, intro: '', favourites: [] })
    const channelStep = ref(null)
    const guideStep = ref(null)
    const guideState = ref({ busy: false, linked: 0, total: 0, region: '', pending: 0, action: null, intro: '' })

    const canAdvance = computed(() => {
      if (step.value === 2) return Boolean(tvhUrl.value.trim()) && !showSecure.value
      if (step.value === 3) return !channelState.value.busy
      if (step.value === 4) return !guideState.value.busy
      return true
    })

    const plexWillSave = computed(() => plexConnected.value || plexEditedByHand.value)
    const plexIsSetUp = computed(() => plexWillSave.value || Boolean(saved.plexUrl))
    const plexLibrary = computed(() => plexShowSections.value.find((sec) => String(sec.key) === String(plexSectionId.value))?.title || '')

    const nextLabel = computed(() => {
      if (step.value === 2) return tvhKind.value === 'err' ? 'Try again' : 'Save and next'
      if (step.value === 3) return channelState.value.channels || channelState.value.busy ? 'Next' : 'Skip'
      if (step.value === 4) {
        if (guideState.value.pending) return 'Save and next'
        return guideState.value.linked || guideState.value.busy ? 'Next' : 'Skip'
      }
      if (step.value === 5) return Object.keys(storageChanges.value).length ? 'Save and next' : 'Next'
      if (step.value === 6) return plexEditedByHand.value && !plexConnected.value ? 'Save and next' : 'Next'
      return 'Next'
    })

    const stepTitle = computed(() => {
      if (isReady.value) return complete.value ? 'You’re set' : 'Nearly there'
      return SETUP_STEPS[current.value]?.title || ''
    })

    const subtitle = computed(() => {
      if (step.value === 2) return tvheadendSubtitle()
      if (step.value === 3) return channelState.value.intro
      if (step.value === 4) return guideState.value.intro
      if (step.value === 5) return storageSummary.value
      if (step.value === 6) return 'Optional. Freetvarr asks Plex to refresh after each sync, so new recordings show up there.'
      return complete.value
        ? 'Freetvarr is ready to record. Open the TV guide, pick a programme, and press Record.'
        : 'Freetvarr needs channels and a guide before it can record a show by name.'
    })

    const tvheadendSubtitle = () => {
      if (securedAs.value) return 'TVHeadend is secured and Freetvarr is connected.'
      if (showSecure.value) {
        return tvhDiscoverKind.value === 'ok'
          ? 'Freetvarr found TVHeadend on your network. Check the address, then secure it.'
          : 'Check the TVHeadend address, then secure it.'
      }
      if (manualLogin.value) return 'Enter the login you made for Freetvarr in TVHeadend.'
      return 'Enter the address of your TVHeadend server and the login Freetvarr should use.'
    }

    const doneValues = computed(() => stepDoneValues({
      tvhUrl: tvhUrl.value,
      channels: channelState.value.channels,
      guideLinked: guideState.value.linked,
      guideTotal: guideState.value.total,
      folderProblems: storageProblems.value.length,
      plexLibrary: plexLibrary.value,
      plexConnected: plexWillSave.value,
    }))
    const rail = computed(() => railGroups({ current: current.value, doneValues: doneValues.value }))

    const summaryRows = computed(() => readySummaryRows({
      tvhUrl: tvhUrl.value,
      tvhUsername: tvhUsername.value,
      channels: channelState.value.channels,
      favourites: channelState.value.favourites,
      guideLinked: guideState.value.linked,
      guideTotal: guideState.value.total,
      guideRegion: guideState.value.region,
      syncText: syncFrequencyText.value,
      plexLibrary: plexIsSetUp.value ? plexLibrary.value : '',
      mediaRoot: mediaRoot.value,
    }))
    const complete = computed(() => isSetupComplete(summaryRows.value))

    const primary = computed(() => {
      if (isReady.value) return { label: complete.value ? 'Start watching' : 'Open Freetvarr', disabled: false, run: finish }
      if (step.value === 2 && showSecure.value && !securedAs.value) {
        return { label: securing.value ? 'Securing…' : 'Secure and connect', disabled: securing.value || !secureReady.value, run: secureTvh }
      }
      const child = { 3: [channelState, channelStep], 4: [guideState, guideStep] }[step.value]
      const action = child?.[0].value.action
      if (action) return { label: action.label, disabled: action.disabled || saving.value, run: () => child[1].value?.runAction() }
      return { label: saving.value ? 'Saving…' : nextLabel.value, disabled: !canAdvance.value || saving.value, run: next }
    })

    const secondary = computed(() => {
      const childState = { 3: channelState, 4: guideState }[step.value]?.value
      if (childState?.action && !childState.busy) {
        const kept = step.value === 3 ? childState.channels : childState.linked
        return { label: kept ? 'Next' : 'Skip', run: next }
      }
      if (step.value === 6 && plexWillSave.value) return { label: 'Skip Plex', run: skipPlex }
      return null
    })

    const barNote = computed(() => {
      if (saveStatusText.value) return { text: saveStatusText.value, error: saveStatusKind.value === 'err' }
      if (step.value === 2 && showSecure.value && !securing.value && !secureStepsVisible.value) return { text: secureInputProblem.value }
      if (step.value === 2 && !tvhUrl.value.trim()) return { text: 'Enter the TVHeadend address to continue.' }
      if (step.value === 3 && channelState.value.busy) return { text: 'Next unlocks when the scan finishes.' }
      if (step.value === 4 && guideState.value.busy) return { text: 'Next unlocks when the guide is set up.' }
      return { text: '' }
    })

    const canSecureAgain = computed(() => Boolean(bootstrap.value?.fresh) && manualLogin.value && !securedAs.value)

    const jumpTo = (index) => {
      clearSaveStatus()
      step.value = FIRST_STEP + index
    }

    const jumpToKey = (key) => jumpTo(SETUP_STEPS.findIndex((item) => item.key === key))

    const skipPlex = () => {
      clearSaveStatus()
      step.value = totalSteps
    }

    const heading = ref(null)
    const doneMark = ref(null)
    const markState = ref('bars')

    const visibleOf = (selector) => [...document.querySelectorAll(selector)]
      .filter((element) => element.getBoundingClientRect().width > 0)

    const playDoneMorph = async () => {
      await wait(PROGRESS_FILL_MS + MORPH_HOLD_MS)
      const mark = doneMark.value?.$el
      if (!isReady.value || !complete.value || !mark) return
      const cleanup = await morphBarsIntoChips({
        bars: visibleOf('[data-morph-bar]'),
        chrome: visibleOf('[data-morph-chrome]'),
        mark,
      })
      markState.value = 'chips'
      await nextTick()
      cleanup()
    }

    const railShown = () => window.matchMedia(RAIL_LAYOUT_QUERY).matches

    watch(step, (curr) => {
      markState.value = curr === totalSteps && railShown() ? 'chips' : 'bars'
    }, { flush: 'sync' })

    watch(step, async (curr) => {
      window.scrollTo({ top: 0 })
      await nextTick()
      heading.value?.focus({ preventScroll: true })
      if (curr === totalSteps && complete.value && markState.value === 'bars') playDoneMorph()
    })

    const dismiss = async () => {
      try {
        await api('POST', '/api/settings', { welcome_dismissed: true })
      } catch { /* wizard closes anyway */ }
    }

    const { confirming, confirmBusy, askConfirm, closeConfirm, runConfirmed } = useConfirm()

    const finish = async () => {
      await dismiss()
      window.location.hash = '#/home'
    }

    const leaveSetup = async () => {
      await dismiss()
      window.location.hash = '#/settings'
    }

    const skipToSettings = () => askConfirm({
      dialog: wizardSkipConfirm({ tvhConnected: tvhConnected.value }),
      run: leaveSetup,
    })

    const startFromTour = async () => {
      await next()
      touring.value = false
    }

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
      if (step.value === totalSteps) return finish()
      clearSaveStatus()
      saving.value = true
      try {
        if (step.value === 1) {
          await api('POST', '/api/settings', { time_zone: timeZone.value })
          tz.value = timeZone.value
          tzSource.value = 'setting'
        } else if (step.value === 2) {
          const connected = await testTvh()
          if (!connected) return
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
      setTvhDiscover(c.loopback ? tvhDetectSummary(c) : 'Found on your network', c.loopback ? 'info' : 'ok', 0)
    }
    const tvhAutoScanning = ref(false)
    const detectTvh = async ({ quiet = false } = {}) => {
      tvhDetecting.value = true
      tvhAutoScanning.value = quiet
      tvhCandidates.value = []
      setTvhDiscover('', 'busy', 0)
      try {
        const r = await api('POST', '/api/tvh-detect')
        if (r.candidates.length === 1) useTvhCandidate(r.candidates[0])
        else if (r.candidates.length) {
          tvhCandidates.value = r.candidates
          setTvhDiscover(`${r.candidates.length} TVHeadend servers answered. Pick one.`, 'info', 0)
        } else setTvhDiscover('Freetvarr did not find TVHeadend. Enter its address.', 'info', 0)
      } catch (err) {
        if (quiet) setTvhDiscover('Freetvarr did not find TVHeadend. Enter its address.', 'info', 0)
        else setTvhDiscover(`The search failed: ${err.message}`, 'err', 0)
      } finally {
        tvhDetecting.value = false
        tvhAutoScanning.value = false
      }
    }
    watch(step, (curr) => {
      if (curr === 2 && !tvhUrl.value.trim() && !tvhDiscoverText.value) detectTvh({ quiet: true })
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
        setTvhText(err.message, 'err', 0)
        return false
      } finally {
        tvhTesting.value = false
      }
    }

    return {
      step, touring, startFromTour, totalSteps, current, isReady, fills, caption, rail, stepTitle, subtitle, saving, primary, secondary, barNote,
      summaryRows, complete, markState, doneMark, heading, jumpTo, jumpToKey, channelStep, guideStep,
      hasExistingConfig, channelState, guideState, plexIsSetUp, syncFrequencyText,
      timeZone, tzSource, zones, zoneClock, zoneSourceText,
      tvhUrl, tvhUsername, tvhPassword, tvhPasswordSet, tvhTesting,
      recordingsRoot, tvhRecordingsPath, recordingsCheck, tvhPathCheck,
      plexUrl, plexToken, plexTokenSet, plexSectionId, plexSections, plexProbing,
      plexCandidates, plexDetectingToken, plexPrefsPath, plexSectionLoads, usePlexLibraries,
      plexChecking, plexConnected, plexProblem, plexAdvancedOpen, plexEditedByHand, plexDocsUrl, plexShowSections, findPlex,
      storageChecking, storageChecked, storageProblems, storageNotes, storageRows, storageAdvancedOpen, storageSummary, checkStorage, clearStaleLibraryStatus,
      manualLogin, canSecureAgain,
      plexTokenStatus, plexTokenStatusKind,
      mediaRoot, mediaRootTesting, mediaRootStatus, mediaRootStatusKind, testMediaRoot,
      back, next, skipToSettings, confirming, confirmBusy, closeConfirm, runConfirmed, loadPlexSections, testTvh,
      showSecure, secureStepsVisible, backToSecureForm, securing, securedAs, secureAdminUsername, secureAdminPassword, secureShowPassword, secureAdminPasswordInput,
      securePrefixes, secureShownSteps, secureError, secureNext, secureInputProblem, secureReady,
      secureTvh, useManualLogin,
      detectTvh, tvhDetecting, tvhAutoScanning, tvhCandidates, useTvhCandidate, tvhDiscoverText, tvhDiscoverKind,
      usePlexCandidate, detectPlexToken,
      plexSectionsText, plexSectionsKind,
      tvhText, tvhKind,
      saveStatusText, saveStatusKind,
      PLAN, STEP_COUNT: SETUP_STEPS.length, FOLDER_CHECK_STEPS, PLEX_LOOK_STEPS,
    }
  },
}

const bootstrapInputProblem = ({ username, password, prefixes }) => {
  if (!username.trim()) return 'Choose an admin username.'
  if (password.length < BOOTSTRAP_MIN_PASSWORD) return `Choose an admin password of at least ${BOOTSTRAP_MIN_PASSWORD} characters.`
  if (!prefixes.trim()) return 'Enter at least one allowed network.'
  return ''
}

const FIRST_STEP = 2
const RAIL_LAYOUT_QUERY = '(min-width: 768px) and (min-height: 501px)'
const PROGRESS_FILL_MS = 280
const MORPH_HOLD_MS = 700

const PLAN = [
  { title: 'Connect to TVHeadend', meta: 'TV recording server that controls the tuner' },
  { title: 'Find channels and the guide', meta: 'A scan takes a few minutes' },
  { title: 'Choose where recordings save', meta: 'Plex is optional' },
]

const FOLDER_CHECK_STEPS = [{ id: 'folders', label: 'Check the folders', status: 'running' }]
const PLEX_LOOK_STEPS = [{ id: 'plex', label: 'Look for Plex', status: 'running' }]

const BOOTSTRAP_CHECK_DELAY_MS = 500
const BOOTSTRAP_POLL_MS = 400

const BOOTSTRAP_MIN_PASSWORD = 8
