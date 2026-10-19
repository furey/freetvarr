import { ref, computed, watch, nextTick, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { staleBuild, serverAbout, loadedBuild, latestBuild, fetchServerAbout } from '/shared/api.js'
import { live, playback, playerMini } from '/shared/player-shared.js'
import { overlayStack } from '/overlay-stack.js'
import {
  UPDATE_APPEAR_DELAY_MS,
  laterAfterPlaybackOf,
  laterOf,
  shownVersionOf,
  updateCardBottomOf,
  updateCardCopyOf,
  updateCardVisibleOf,
} from '/update-card.js'

export const StaleBuildBanner = {
  template: `
    <teleport to="body">
      <transition name="update-card">
        <section v-if="visible" class="update-card" role="status" aria-live="polite" aria-labelledby="update-card-title"
          :style="placementStyle">
          <div class="update-card-head">
            <span class="update-card-mark" aria-hidden="true"><span></span><span></span><span></span></span>
            <div class="update-card-text">
              <h2 id="update-card-title" class="update-card-title">{{ copy.title }}</h2>
              <p v-if="copy.version" class="update-card-meta">
                Version {{ copy.version }} · <a :href="copy.releaseUrl" target="_blank" rel="noopener">What's new</a>
              </p>
              <p class="update-card-body">{{ copy.body }}</p>
              <p v-if="copy.note" class="update-card-note">{{ copy.note }}</p>
            </div>
          </div>
          <div class="update-card-actions">
            <button type="button" class="ui-button ui-button-secondary update-card-button" @click="chooseLater">Later</button>
            <button type="button" class="ui-button ui-button-primary update-card-button" @click="reloadPage">
              <refresh-icon /> {{ copy.reloadLabel }}
            </button>
          </div>
        </section>
      </transition>
    </teleport>
  `,

  setup() {
    const ready = ref(false)
    const later = ref(null)
    const nowMs = ref(Date.now())
    const loadedVersion = ref(null)
    const miniRect = ref(null)
    const viewport = ref(viewportOf())
    let appearTimer = null
    let clockTimer = null

    const playing = computed(() => live.open || playback.open)
    const playerFull = computed(() => playing.value && !playerMini.value)
    const visible = computed(() => updateCardVisibleOf({
      stale: staleBuild.value,
      ready: ready.value,
      playerFull: playerFull.value,
      later: later.value,
      playing: playing.value,
      nowMs: nowMs.value,
    }))
    const copy = computed(() => updateCardCopyOf({
      playing: playing.value,
      version: shownVersionOf({ latestVersion: latestVersionOf(), loadedVersion: loadedVersion.value }),
    }))
    const placementStyle = computed(() => {
      const bottom = updateCardBottomOf({ ...viewport.value, miniRect: miniRect.value })
      return bottom == null ? null : { bottom: `${bottom}px` }
    })

    const latestVersionOf = () => (serverAbout.value.build === latestBuild.value ? serverAbout.value.version : null)
    const noteLoadedVersion = (about) => {
      if (about?.build && about.build === loadedBuild && about.version) loadedVersion.value = about.version
    }
    const onStale = (stale) => {
      clearTimeout(appearTimer)
      if (!stale) return
      if (serverAbout.value.build !== latestBuild.value) fetchServerAbout().catch(() => {})
      appearTimer = setTimeout(() => { ready.value = true }, UPDATE_APPEAR_DELAY_MS)
    }
    const measure = async () => {
      await nextTick()
      viewport.value = viewportOf()
      const mini = [...document.querySelectorAll('.pl-backdrop.is-mini')].find((el) => el.getClientRects().length > 0)
      miniRect.value = playerMini.value && mini ? mini.getBoundingClientRect() : null
    }
    const chooseLater = () => {
      later.value = laterOf({ playing: playing.value, nowMs: Date.now() })
    }
    const reloadPage = () => window.location.reload()
    const onKeydown = (e) => {
      if (e.key !== 'Escape' || !visible.value || overlayStack.size() > 0 || e.defaultPrevented) return
      chooseLater()
    }

    watch(serverAbout, noteLoadedVersion, { immediate: true })
    watch(staleBuild, onStale, { immediate: true })
    watch(playing, (isPlaying) => { later.value = laterAfterPlaybackOf({ later: later.value, playing: isPlaying }) })
    watch([visible, playerMini, playing], measure)
    onMounted(() => {
      window.addEventListener('resize', measure)
      window.addEventListener('keydown', onKeydown)
      clockTimer = setInterval(() => { nowMs.value = Date.now() }, CLOCK_TICK_MS)
    })
    onUnmounted(() => {
      clearTimeout(appearTimer)
      clearInterval(clockTimer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('keydown', onKeydown)
    })

    return { visible, copy, placementStyle, chooseLater, reloadPage }
  },
}

const PHONE_QUERY = '(max-width: 767px)'
const RAIL_WIDTH = 88
const CLOCK_TICK_MS = 30_000

const viewportOf = () => {
  const phone = window.matchMedia(PHONE_QUERY).matches
  return {
    phone,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    railWidth: phone ? 0 : RAIL_WIDTH,
  }
}
