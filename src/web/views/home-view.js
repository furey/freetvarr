import { ref, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { artFallbackStyle } from '/art-fallback.js'
import {
  continueWatchingOf,
  newRecordingsOf,
  favouriteOnNowOf,
  tonightOf,
  tonightMetaOf,
  newCardMetaOf,
  onNowMetaOf,
  episodeCodeOf,
  minutesLeftOf,
  watchedFractionOf,
  greetingFor,
  showHrefOfRecording,
  splitClock,
} from '/home-feed.js'
import { playRecording } from '/shared/playback-session.js'
import { watchLive, liveChannelOf } from '/shared/live-session.js'
import { playback } from '/shared/player-shared.js'
import { recordingChangeTick } from '/shared/recording-now.js'
import { now, tz, fmtClockTz } from '/shared/time.js'

const LIBRARY_PAGE_SIZE = 100

export const HomeView = {
  template: `
    <div class="ui-page home-page">
      <page-header :title="greeting" brand />
      <template v-if="!loaded">
        <div class="ui-skeleton is-hero home-hero-skeleton"></div>
        <div class="ui-scroller home-skeleton-row">
          <div v-for="n in 4" :key="n" class="ui-skeleton is-card"></div>
        </div>
      </template>
      <template v-else>
        <section v-if="hero" class="ui-hero home-hero" aria-label="Continue watching">
          <div class="home-hero-backdrop ui-art-fallback" :style="heroFallbackStyle">
            <img v-if="heroImageUrl && !heroImageFailed" class="ui-hero-art" :src="heroImageUrl" alt=""
              decoding="async" @error="heroImageFailed = true" />
          </div>
          <div class="ui-hero-scrim"></div>
          <div class="ui-hero-body">
            <div class="ui-hero-kicker">Continue watching</div>
            <h2 class="ui-hero-title">{{ hero.title }}</h2>
            <div class="ui-hero-meta ui-only-wide">{{ heroMeta }}</div>
            <div class="ui-hero-meta ui-only-phone">{{ heroMetaShort }}</div>
            <div class="ui-progress home-hero-progress" role="progressbar" aria-label="Watched"
              :aria-valuenow="heroPercent" aria-valuemin="0" aria-valuemax="100">
              <span class="ui-progress-fill" :style="{ width: heroPercent + '%' }"></span>
            </div>
            <div class="ui-hero-actions">
              <button type="button" class="ui-button ui-button-primary" @click="playRecording(hero)">
                <play-icon /> Resume
              </button>
              <a :href="heroShowHref" class="ui-button ui-button-secondary ui-only-wide">Episodes</a>
            </div>
          </div>
        </section>

        <section v-if="newRecordings.length" class="ui-section" aria-labelledby="home-new-title">
          <div class="ui-row-header">
            <h2 id="home-new-title" class="ui-section-title">New recordings</h2>
            <a href="#/recordings" class="ui-row-link">See all</a>
          </div>
          <div class="ui-scroller">
            <a v-for="r in newRecordings" :key="r.recording_id" :href="showHref(r)" class="ui-card"
              :aria-label="newCardLabel(r)">
              <div class="ui-card-art ui-art-fallback" :style="fallbackStyleOf(r.title)">
                <programme-image :source="r.image_path ? '/api/recordings/' + r.recording_id + '/image' : null"
                  :title="r.title" variant="info" />
                <span class="ui-art-badge ui-new-badge">NEW</span>
              </div>
              <div class="ui-card-title">{{ r.title }}</div>
              <div class="ui-card-meta">{{ newCardMeta(r) }}</div>
            </a>
          </div>
        </section>

        <section v-if="!hero && !newRecordings.length" class="ui-empty" aria-label="Nothing recorded yet">
          <h2 class="ui-empty-title">Nothing recorded yet</h2>
          <p class="ui-empty-text">Find a show in the Guide and record it. New recordings show up here.</p>
          <a href="#/guide" class="ui-button ui-button-primary">Find a show in the Guide</a>
        </section>

        <section v-if="onNow.length" class="ui-section" aria-labelledby="home-on-now-title">
          <div class="ui-row-header">
            <h2 id="home-on-now-title" class="ui-section-title">On now</h2>
            <a href="#/live" class="ui-row-link">Live TV</a>
          </div>
          <div class="ui-scroller">
            <button v-for="item in onNow" :key="item.channel.id" type="button" class="ui-card home-card-button"
              :aria-label="'Watch ' + item.channel.name + ' live, ' + item.program.title + ' on now'"
              @click="watchChannel(item)">
              <div class="ui-card-art ui-art-fallback" :style="fallbackStyleOf(item.program.title)">
                <programme-image :event-id="item.program.has_image ? item.program.program_id : null"
                  :channel-id="item.channel.id" :has-logo="item.channel.hasLogo"
                  :title="item.program.title" variant="info" />
                <span class="ui-art-badge ui-channel-tag is-end">{{ channelTag(item.channel) }}</span>
                <span class="ui-art-bar ui-progress is-live" role="progressbar" :aria-label="'Progress of ' + item.program.title"
                  :aria-valuenow="item.percent" aria-valuemin="0" aria-valuemax="100">
                  <span class="ui-progress-fill" :style="{ width: item.percent + '%' }"></span>
                </span>
              </div>
              <div class="ui-card-title">{{ item.program.title }}</div>
              <div class="ui-card-meta">{{ onNowMetaOf({ item }) }}</div>
            </button>
          </div>
        </section>

        <section v-if="tonight.length" class="ui-section" aria-labelledby="home-tonight-title">
          <div class="ui-row-header">
            <h2 id="home-tonight-title" class="ui-section-title">Recording tonight</h2>
            <a href="#/recordings/scheduled" class="ui-row-link">Scheduled</a>
          </div>
          <ul class="home-tonight">
            <li v-for="item in tonight" :key="item.programId">
              <a :href="'#/recordings/scheduled'" class="home-tonight-item">
                <span class="home-tonight-time">
                  <span class="home-tonight-clock ui-tabular">{{ clockOf(item).time }}</span>
                  <span class="home-tonight-period">{{ clockOf(item).period }}</span>
                </span>
                <span class="home-tonight-text">
                  <span class="home-tonight-title">{{ item.name }}</span>
                  <span class="ui-meta">{{ tonightMeta(item) }}</span>
                </span>
              </a>
            </li>
          </ul>
        </section>
      </template>
    </div>
  `,
  setup() {
    const recordings = ref([])
    const nowEntries = ref([])
    const upcoming = ref([])
    const activeProgramIds = ref([])
    const loaded = ref(false)
    const heroImageFailed = ref(false)

    const nowMs = computed(() => now.value.getTime())
    const greeting = computed(() => greetingFor({ nowMs: nowMs.value, timeZone: tz.value }))
    const hero = computed(() => continueWatchingOf(recordings.value))
    const newRecordings = computed(() => newRecordingsOf(recordings.value))
    const onNow = computed(() => favouriteOnNowOf({ entries: nowEntries.value, nowMs: nowMs.value }))
    const tonight = computed(() => tonightOf({
      upcoming: upcoming.value,
      activeProgramIds: activeProgramIds.value,
      nowMs: nowMs.value,
      timeZone: tz.value,
    }))

    const heroMeta = computed(() => {
      const r = hero.value
      return [
        episodeCodeOf(r),
        r.episode_title,
        r.channel_name,
        `${minutesLeftOf(r)} min left`,
      ].filter(Boolean).join(' · ')
    })
    const heroMetaShort = computed(() => [episodeCodeOf(hero.value), `${minutesLeftOf(hero.value)} min left`].filter(Boolean).join(' · '))
    const heroPercent = computed(() => Math.round(watchedFractionOf(hero.value) * 100))
    const heroShowHref = computed(() => showHrefOfRecording(hero.value))
    const heroFallbackStyle = computed(() => artFallbackStyle(hero.value.title))
    const heroImageUrl = computed(() => {
      const r = hero.value
      if (r.image_path) return `/api/recordings/${encodeURIComponent(r.recording_id)}/image`
      return `/api/epg/show-image?title=${encodeURIComponent(r.title)}&w=768`
    })
    watch(() => hero.value?.recording_id, () => { heroImageFailed.value = false })

    const settled = (promise, fallback) => promise.catch(() => fallback)

    const load = async () => {
      const [library, nowData, state] = await Promise.all([
        settled(api('GET', `/api/recordings?pageSize=${LIBRARY_PAGE_SIZE}&sort=aired_at&dir=desc`), { recordings: [] }),
        settled(api('GET', '/api/epg/now?all=1'), { entries: [] }),
        settled(api('GET', '/api/epg/state'), { upcomingRecordings: [], activeRecordingIds: [] }),
      ])
      recordings.value = library.recordings ?? []
      nowEntries.value = nowData.entries ?? []
      upcoming.value = state.upcomingRecordings ?? []
      activeProgramIds.value = state.activeRecordingIds ?? []
      loaded.value = true
    }

    onMounted(load)
    watch(recordingChangeTick, load)
    const stopWatchingPlayer = watch(() => playback.open, (open, wasOpen) => { if (wasOpen && !open) load() })
    onUnmounted(stopWatchingPlayer)

    const watchChannel = (item) => watchLive({
      channel: liveChannelOf(item.channel),
      nowTitle: item.program.title || '',
    })

    const showHref = (recording) => showHrefOfRecording(recording)
    const newCardMeta = (recording) => newCardMetaOf({ recording, nowMs: nowMs.value, timeZone: tz.value })
    const newCardLabel = (recording) => `${recording.title}, new recording, ${newCardMeta(recording)}`
    const channelTag = (channel) => channel.number != null ? String(channel.number) : channel.name
    const clockOf = (item) => splitClock(fmtClockTz(item.startDate))
    const fallbackStyleOf = (title) => artFallbackStyle(title)

    return {
      loaded, greeting, hero, heroMeta, heroMetaShort, heroPercent, heroShowHref, heroFallbackStyle, heroImageUrl, heroImageFailed,
      newRecordings, onNow, tonight, playRecording, watchChannel, showHref, newCardMeta, newCardLabel,
      channelTag, clockOf, fallbackStyleOf, onNowMetaOf, tonightMeta: tonightMetaOf,
    }
  },
}
