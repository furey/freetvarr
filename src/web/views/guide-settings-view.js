import { ref, computed, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import {
  addedChannelsOf,
  broadcastIntroOf,
  broadcastMetaOf,
  channelChoicesOf,
  channelStateOf,
  channelsChangeOf,
  daysAheadOf,
  listedChannelsOf,
  listingChoicesOf,
  listingModeHintOf,
  pinnableChannelsOf,
  repointReasonTextOf,
  sourceMetaOf,
  unmergeDoneTextOf,
  unmergeIntroOf,
  unmergeLinksTextOf,
  feedProvidersOf,
  suggestedFeedsHintOf,
  suggestedFeedsNoteOf,
} from '/guide-sources-text.js'
import { api } from '/shared/api.js'
import { fmtClockTz } from '/shared/time.js'
import { loadGuideNotice } from '/shared/guide-notice.js'
import { usePacedJob, SETUP_POLL_MS, SetupRunList } from '/views/welcome-shared.js'

export const GuideSettingsView = {
  components: { SetupRunList },
  template: `
    <div v-page-reveal class="settings-page guide-settings">
      <teleport defer to="#settings-page-info">
        <info-button title="Guide" doc="guide/settings#guide" piece="guide">
          <p>Freetvarr merges the free guide sources for your country into one guide, and serves it to TVHeadend at <code>/guide/xmltv.xml</code>. In Australia and New Zealand, Freeview gives the listings for the next 8 to 9 days, and i.mjh.nz gives the channel names and the days after. In other countries, TVHeadend keeps its own guide, and this page lists XMLTV feeds that other people publish for your country.</p>
          <p>Each time it builds the merged guide, Freetvarr scores each source on each channel: the hours of the next 2 days it covers, how many days ahead it goes, how many listings have a description, and how many listings the other source agrees with.</p>
        </info-button>
      </teleport>
      <p v-if="error" class="ui-banner is-error" role="alert">{{ error }}</p>
      <div v-if="!status && !error" class="ui-group ui-skeleton-surface" aria-hidden="true">
        <div v-for="i in 4" :key="i" class="ui-group-row"><span class="ui-skeleton is-line"></span></div>
      </div>
      <template v-else-if="status">
        <div v-if="!status.available" class="settings-group" data-setting="broadcast-guide">
          <h3 class="ui-group-label">Broadcast guide</h3>
          <p class="settings-note guide-settings-text guide-settings-lead">{{ broadcastIntro }}</p>
          <div v-if="status.broadcast" class="ui-group">
            <div class="ui-group-row guide-source-row">
              <span class="health-check-mark"><span :class="['ui-dot', status.broadcast.short ? 'is-warn' : 'is-ok']" role="img" :aria-label="status.broadcast.short ? 'Short' : 'Healthy'"></span></span>
              <span class="ui-group-row-main">
                <span class="ui-group-row-title">TVHeadend guide</span>
                <span class="ui-group-row-meta">{{ broadcastMeta }}</span>
              </span>
            </div>
          </div>
        </div>
        <template v-else>
          <div class="settings-group" data-setting="merged-guide">
            <h3 class="ui-group-label">Merged guide</h3>
            <template v-if="showSteps && !unmergeDone">
              <setup-run-list :steps="steps" />
              <template v-if="result && result.ok">
                <p class="settings-note guide-settings-text">{{ doneText }}</p>
              </template>
              <template v-else-if="result">
                <p class="settings-note guide-settings-text is-error" role="alert">{{ result.error }}</p>
                <p v-if="result.next" class="settings-note guide-settings-text">{{ result.next }}</p>
                <div class="settings-row-actions guide-settings-actions">
                  <button type="button" class="ui-button ui-button-primary" :disabled="starting" @click="confirm">Try again</button>
                  <button type="button" class="setup-quiet-link" :disabled="starting" @click="keep">Keep my grabber as it is</button>
                </div>
              </template>
            </template>
            <template v-else-if="confirmed">
              <div class="ui-group">
                <div class="ui-group-row">
                  <span class="ui-group-row-main">
                    <span class="ui-group-row-title">TVHeadend reads the merged guide</span>
                    <span class="ui-group-row-meta ui-mono guide-settings-url">{{ repoint.grabberUrl || repoint.feedUrl }}</span>
                  </span>
                </div>
              </div>
              <div v-if="unmerge" class="guide-unmerge" data-setting="unmerge">
                <p class="settings-note guide-settings-text guide-settings-lead">{{ unmergeIntro }}</p>
                <div class="ui-group guide-plan">
                  <div class="ui-group-row">
                    <span class="ui-group-row-main">
                      <span class="ui-group-row-title">TVHeadend guide grabber</span>
                      <span class="ui-group-row-meta">Reads now: <span class="ui-mono guide-settings-url">{{ unmerge.grabberUrl }}</span></span>
                      <span class="ui-group-row-meta">Reads after: <span class="ui-mono guide-settings-url">{{ unmerge.afterUrl }}</span></span>
                    </span>
                  </div>
                  <div v-if="unmergeLinksText" class="ui-group-row">
                    <span class="ui-group-row-main">
                      <span class="ui-group-row-title">Channel links</span>
                      <span class="ui-group-row-meta">{{ unmergeLinksText }}</span>
                    </span>
                  </div>
                </div>
                <div class="settings-row-actions guide-settings-actions">
                  <button type="button" :class="['ui-button', 'ui-button-primary', { 'is-pending': starting }]" :disabled="starting" @click="confirmUnmerge">Stop using the merged guide</button>
                  <button type="button" class="setup-quiet-link" :disabled="starting" @click="unmerge = null">Keep the merged guide</button>
                </div>
              </div>
              <p v-if="actionError" class="settings-note guide-settings-text is-error" role="alert">{{ actionError }}</p>
              <div v-if="!unmerge" class="settings-row-actions guide-settings-actions" data-setting="unmerge-offer">
                <button type="button" class="setup-quiet-link" :disabled="planning" @click="planUnmerge">Stop using the merged guide</button>
              </div>
            </template>
            <template v-else-if="repoint.reason">
              <p v-if="unmergeDone" class="settings-note guide-settings-text" role="status">{{ doneText }}</p>
              <p class="settings-note guide-settings-text">{{ reasonText }}</p>
            </template>
            <template v-else>
              <p v-if="unmergeDone" class="settings-note guide-settings-text" role="status">{{ doneText }}</p>
              <p class="settings-note guide-settings-text guide-settings-lead">{{ planIntro }}</p>
              <div class="ui-group guide-plan">
                <div class="ui-group-row">
                  <span class="ui-group-row-main">
                    <span class="ui-group-row-title">TVHeadend guide grabber</span>
                    <span class="ui-group-row-meta">Reads now: <span class="ui-mono guide-settings-url">{{ repoint.grabberUrl || 'nothing' }}</span></span>
                    <span class="ui-group-row-meta">Reads after: <span class="ui-mono guide-settings-url">{{ repoint.feedUrl }}</span></span>
                  </span>
                </div>
                <div v-if="repoint.region" class="ui-group-row">
                  <span class="ui-group-row-main">
                    <span class="ui-group-row-title">Region</span>
                    <span v-if="repoint.rebuild" class="ui-group-row-meta">Freetvarr first builds the merged guide for {{ repoint.region }}, the region your grabber reads. This takes about 15 minutes.</span>
                  </span>
                  <span class="ui-group-row-value">{{ repoint.region }}</span>
                </div>
                <div v-if="!repoint.rebuild" class="ui-group-row">
                  <span class="ui-group-row-main">
                    <span class="ui-group-row-title">Guide channels</span>
                    <span v-if="addedText" class="ui-group-row-meta">Added from {{ primaryLabel }}: {{ addedText }}</span>
                  </span>
                  <span class="ui-group-row-value">{{ channelsText }}</span>
                </div>
                <div class="ui-group-row">
                  <span class="ui-group-row-main">
                    <span class="ui-group-row-title">Days ahead</span>
                    <span class="ui-group-row-meta">{{ daysText }}</span>
                  </span>
                </div>
              </div>
              <p v-if="kept && !unmergeDone" class="settings-note guide-settings-text">You kept your grabber as it is. You can still use the merged guide.</p>
              <p v-if="actionError" class="settings-note guide-settings-text is-error" role="alert">{{ actionError }}</p>
              <div class="settings-row-actions guide-settings-actions">
                <button type="button" :class="['ui-button', 'ui-button-primary', { 'is-pending': starting }]" :disabled="starting" @click="confirm">Use the merged guide</button>
                <button v-if="!kept" type="button" class="setup-quiet-link" :disabled="starting" @click="keep">Keep my grabber as it is</button>
              </div>
            </template>
          </div>

          <template v-if="status.mergedOn">
            <div class="settings-group" data-setting="listings-source">
              <h3 class="ui-group-label">Listings source</h3>
              <div class="ui-group">
                <div class="settings-row">
                  <span id="listings-source-label" class="field-label">Use first</span>
                  <ui-segmented fill aria-labelledby="listings-source-label" :model-value="status.choice.mode"
                    :options="modeChoices" :disabled="saving" @update:model-value="setMode" />
                  <p class="settings-hint guide-settings-text">{{ modeHint }}</p>
                </div>
              </div>
            </div>

            <div class="settings-group" data-setting="source-health">
              <h3 class="ui-group-label">Source health</h3>
              <div class="ui-group">
                <div v-for="source in status.sources" :key="source.id" class="ui-group-row guide-source-row">
                  <span class="health-check-mark"><span :class="['ui-dot', dotOf(source)]" role="img" :aria-label="source.degraded ? 'Degraded' : 'Healthy'"></span></span>
                  <span class="ui-group-row-main">
                    <span class="ui-group-row-title">{{ source.label }}<template v-if="source.degraded"> (degraded)</template></span>
                    <span class="ui-group-row-meta">{{ metaOf(source) }}</span>
                  </span>
                </div>
              </div>
            </div>

            <div class="settings-group" data-setting="channel-sources">
              <h3 class="ui-group-label">Channel sources</h3>
              <div class="ui-group">
                <div v-for="channel in listedChannels" :key="channel.id" class="settings-row guide-channel-row">
                  <label class="field-label" :for="'guide-pin-' + channel.id">{{ channel.name }}<span v-if="channel.lcn" class="settings-label-note"> ({{ channel.lcn }})</span></label>
                  <select :id="'guide-pin-' + channel.id" class="field-input" :value="channel.pin || ''" :disabled="saving"
                    @change="setPin(channel.id, $event.target.value)">
                    <option v-for="choice in choicesOf(channel)" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
                  </select>
                  <p class="settings-hint guide-settings-text">{{ stateOf(channel) }}</p>
                </div>
                <div class="settings-row guide-channel-row" data-setting="pin-channel">
                  <label class="field-label" for="guide-pin-new">Pin a channel</label>
                  <select id="guide-pin-new" class="field-input" v-model="newPin" :disabled="saving || !pinnable.length" @change="newPinSource = ''">
                    <option value="">{{ pinnable.length ? 'Choose a channel' : 'No channel has two sources' }}</option>
                    <option v-for="channel in pinnable" :key="channel.id" :value="channel.id">{{ channel.lcn ? channel.lcn + ' ' : '' }}{{ channel.name }}</option>
                  </select>
                  <template v-if="newPinChannel">
                    <select class="field-input guide-pin-source" aria-label="Source for this channel" v-model="newPinSource" :disabled="saving">
                      <option value="">Choose a source</option>
                      <option v-for="choice in choicesOf(newPinChannel).slice(1)" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
                    </select>
                    <div class="settings-row-actions guide-settings-actions">
                      <button type="button" class="ui-button ui-button-primary" :disabled="saving || !newPinSource" @click="pinNew">Pin</button>
                    </div>
                  </template>
                  <p class="settings-hint guide-settings-text">A pinned channel always uses its source first, even while that source is degraded.</p>
                </div>
              </div>
            </div>
          </template>
        </template>
        <div v-if="suggestedFeeds.length" class="settings-group" data-setting="suggested-feeds">
          <h3 class="ui-group-label">Third-party feeds</h3>
          <p class="settings-note guide-settings-text">{{ suggestedNote }}</p>
          <div class="ui-group">
            <template v-for="feed in suggestedFeeds" :key="feed.url">
              <copy-row :label="feed.name" :value="feed.url" />
            </template>
          </div>
          <p class="settings-note guide-settings-text">{{ suggestedHint }} <span>Listed by: <template v-for="(provider, index) in feedProviders" :key="provider.name"><a :href="provider.source" target="_blank" rel="noopener noreferrer">{{ provider.name }}</a><template v-if="index < feedProviders.length - 1">, </template></template>.</span></p>
        </div>
      </template>
    </div>
  `,
  setup() {
    const status = ref(null)
    const error = ref('')
    const actionError = ref('')
    const saving = ref(false)
    const starting = ref(false)
    const newPin = ref('')
    const newPinSource = ref('')
    const job = ref(null)
    const paced = usePacedJob(job)
    let pollTimer = null

    const repoint = computed(() => status.value?.repoint ?? {})
    const steps = computed(() => paced.shown.value.steps)
    const result = computed(() => paced.shown.value.result)
    const showSteps = computed(() => Boolean(job.value) && (paced.shown.value.running || Boolean(result.value)))
    const confirmed = computed(() => Boolean(status.value?.mergedOn) && (repoint.value.state === 'confirmed' || repoint.value.pointed))
    const kept = computed(() => repoint.value.state === 'kept')
    const primaryLabel = computed(() => status.value?.sources?.[0]?.label ?? '')
    const reasonText = computed(() => repointReasonTextOf(repoint.value.reason))
    const channelsText = computed(() => channelsChangeOf(repoint.value))
    const addedText = computed(() => addedChannelsOf({ names: repoint.value.added }))
    const daysText = computed(() => daysAheadOf(repoint.value.days))
    const planIntro = computed(() => `Freetvarr can merge ${status.value.sources.map((source) => source.label).join(' and ')} into one guide, and point TVHeadend's guide grabber at it. Check what changes, then choose.`)
    const doneText = computed(() => {
      const outcome = result.value
      if (outcome.kind === 'unmerge') return unmergeDoneTextOf(outcome)
      const linked = outcome.linked ? ` Freetvarr linked ${outcome.linked} ${outcome.linked === 1 ? 'channel' : 'channels'} to the new guide.` : ''
      const updated = outcome.updated ? '' : ' TVHeadend has not shown new listings yet; they appear after its next import.'
      return `TVHeadend reads the merged guide.${linked}${updated}`
    })
    const modeChoices = computed(() => listingChoicesOf(status.value?.sources ?? []))
    const modeHint = computed(() => listingModeHintOf({ mode: status.value.choice.mode, sources: status.value.sources }))
    const listedChannels = computed(() => listedChannelsOf(status.value?.channels))
    const pinnable = computed(() => pinnableChannelsOf(status.value?.channels))
    const suggestions = computed(() => status.value?.suggestions ?? { feeds: [] })
    const suggestedFeeds = computed(() => suggestions.value.feeds ?? [])
    const suggestedNote = computed(() => suggestedFeedsNoteOf(suggestions.value))
    const suggestedHint = computed(() => suggestedFeedsHintOf(suggestions.value))
    const feedProviders = computed(() => feedProvidersOf(suggestedFeeds.value))
    const broadcastIntro = computed(() => broadcastIntroOf({ country: suggestions.value.country, broadcast: status.value?.broadcast }))
    const broadcastMeta = computed(() => broadcastMetaOf(status.value?.broadcast))
    const newPinChannel = computed(() => pinnable.value.find((channel) => channel.id === newPin.value) ?? null)

    const unmerge = ref(null)
    const planning = ref(false)
    const unmergeDone = computed(() => result.value?.kind === 'unmerge' && Boolean(result.value.ok) && !paced.shown.value.running)
    const unmergeIntro = computed(() => unmergeIntroOf(unmerge.value))
    const unmergeLinksText = computed(() => unmergeLinksTextOf(unmerge.value))

    const planUnmerge = async () => {
      planning.value = true
      actionError.value = ''
      try {
        unmerge.value = (await api('GET', '/api/guide-sources/unmerge')).plan
      } catch (err) {
        actionError.value = err.message
      } finally {
        planning.value = false
      }
    }

    const confirmUnmerge = async () => {
      starting.value = true
      actionError.value = ''
      try {
        const started = await api('POST', '/api/guide-sources/unmerge')
        unmerge.value = null
        job.value = { kind: 'unmerge', running: true, steps: started.steps, result: null }
        paced.begin()
        startPolling()
      } catch (err) {
        actionError.value = err.message
      } finally {
        starting.value = false
      }
    }

    const load = async () => {
      try {
        const loaded = await api('GET', '/api/guide-sources')
        status.value = loaded
        error.value = ''
        if (loaded.job && !job.value) adoptJob(loaded.job)
      } catch (err) {
        error.value = `Could not load the guide sources: ${err.message}`
      }
    }

    const adoptJob = (serverJob) => {
      job.value = serverJob
      if (!serverJob.running) return paced.showAll()
      paced.begin()
      startPolling()
    }

    const startPolling = () => {
      clearInterval(pollTimer)
      pollTimer = setInterval(async () => {
        const progress = await api('GET', '/api/guide-sources/repoint/progress').catch(() => null)
        if (!progress) return
        job.value = progress
        if (progress.running) return
        clearInterval(pollTimer)
        await load()
        loadGuideNotice({ fresh: true })
      }, SETUP_POLL_MS)
    }

    const confirm = async () => {
      starting.value = true
      actionError.value = ''
      try {
        const started = await api('POST', '/api/guide-sources/repoint')
        job.value = { running: true, steps: started.steps, result: null }
        paced.begin()
        startPolling()
      } catch (err) {
        actionError.value = err.message
      } finally {
        starting.value = false
      }
    }

    const keep = async () => {
      actionError.value = ''
      try {
        await api('POST', '/api/guide-sources/keep-grabber')
        job.value = null
        await load()
        loadGuideNotice({ fresh: true })
      } catch (err) {
        actionError.value = err.message
      }
    }

    const save = async (path, body) => {
      saving.value = true
      error.value = ''
      try {
        await api('POST', path, body)
        await load()
      } catch (err) {
        error.value = `Could not save: ${err.message}`
      } finally {
        saving.value = false
      }
    }

    const setMode = (mode) => save('/api/guide-sources/mode', { mode })
    const setPin = (channel, source) => save('/api/guide-sources/pins', { channel, source })
    const pinNew = async () => {
      await setPin(newPin.value, newPinSource.value)
      newPin.value = ''
      newPinSource.value = ''
    }

    const choicesOf = (channel) => channelChoicesOf({ channel, sources: status.value.sources })
    const stateOf = (channel) => channelStateOf({ channel, sources: status.value.sources })
    const metaOf = (source) => sourceMetaOf({ source, clockOf: fmtClockTz })
    const dotOf = (source) => {
      if (!source.measured) return 'is-skip'
      return source.degraded ? 'is-warn' : 'is-ok'
    }

    onMounted(load)
    onUnmounted(() => clearInterval(pollTimer))

    return {
      status, error, actionError, saving, starting, repoint, steps, result, showSteps, confirmed, kept,
      primaryLabel, reasonText, channelsText, addedText, daysText, planIntro, doneText,
      suggestedFeeds, suggestedNote, suggestedHint, feedProviders, broadcastIntro, broadcastMeta,
      modeChoices, modeHint, listedChannels, pinnable, newPin, newPinSource, newPinChannel,
      unmerge, planning, unmergeDone, unmergeIntro, unmergeLinksText, planUnmerge, confirmUnmerge,
      confirm, keep, setMode, setPin, pinNew, choicesOf, stateOf, metaOf, dotOf,
    }
  },
}
