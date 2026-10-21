import { ref, computed } from '/vendor/vue.esm-browser.prod.js'
import {
  allEpisodesOf,
  deletableEpisodesOf,
  episodeInfoOf,
  episodeMenuOf,
  latestEarlierEpisodeOf,
  markedText,
  menuPendingLabelOf,
  showInfoOf,
  showMenuOf,
  watchedChangeTargets,
} from '/library-menus.js'
import { episodeById, episodeHeading, episodeMetaOf, recordingRowOf } from '/show-page.js'
import { openPlexLink } from '/components/library-menus.js'
import { loadNicknames } from '/components/also-known-as.js'
import { holdAtLeast } from '/pending.js'
import { api, fetchSettings } from '/shared/api.js'
import { playRecording } from '/shared/playback-session.js'
import { recordingNow, refreshAfterRecordingChange } from '/shared/recording-now.js'
import { tz } from '/shared/time.js'

export const SELECT_TIP = 'Tip: tap Select on the show page to mark or delete several episodes at once.'

export const useLibraryActions = ({ show, reload, showToast, openOptions, selectTip = SELECT_TIP }) => {
  const menuEpisode = ref(null)
  const showMenuOpen = ref(false)
  const info = ref(null)
  const deleteRequest = ref(null)
  const busy = ref(false)
  const pendingKey = ref('')
  const adRemovalEnabled = ref(false)
  const artworkVersion = ref(0)
  const pictureOpen = ref(false)

  const activeIds = computed(() => new Set((recordingNow.value.active || []).map((r) => String(r.dvrUuid))))
  const episodes = computed(() => allEpisodesOf(show.value))
  const showGroups = computed(() => (show.value ? showMenuOf({ show: show.value, activeIds: activeIds.value }) : []))
  const episodeGroups = computed(() => (menuEpisode.value
    ? episodeMenuOf({ episode: menuEpisode.value, episodes: episodes.value, activeIds: activeIds.value, adRemovalEnabled: adRemovalEnabled.value })
    : []))
  const showMenuSubtitle = computed(() => {
    const list = episodes.value
    if (!list.length) return ''
    const unwatched = list.filter((e) => !e.watched && !e.failed).length
    return `${list.length === 1 ? '1 episode' : `${list.length} episodes`} · ${unwatched} unwatched`
  })
  const episodeTip = computed(() => (selectTip ? selectTip : ''))

  fetchSettings().then((settings) => { adRemovalEnabled.value = Boolean(settings.ad_removal_enabled) }).catch(() => {})

  const keyPath = () => `/api/library/shows/${encodeURIComponent(show.value.key)}`

  const openShowMenu = () => { showMenuOpen.value = true }
  const openEpisodeMenu = (episode) => { menuEpisode.value = episode }
  const closeMenus = () => {
    showMenuOpen.value = false
    menuEpisode.value = null
  }

  const run = async (what, task) => {
    busy.value = true
    try {
      await holdAtLeast({ task })
    } catch (err) {
      showToast({ kind: 'error', title: `${what} failed`, detail: err.message })
    } finally {
      busy.value = false
    }
  }

  const runPending = async (key, action) => {
    pendingKey.value = key
    try {
      await action()
    } finally {
      pendingKey.value = ''
    }
  }

  const runFromMenu = async (key, action) => {
    if (!menuPendingLabelOf(key)) {
      closeMenus()
      return action()
    }
    await runPending(key, action)
    closeMenus()
  }

  const play = (episode, options) => playRecording(recordingRowOf(episode), options)

  const setEpisodesWatched = (list, watched) => run('Marking episodes', async () => {
    const targets = watchedChangeTargets({ episodes: list, watched })
    await Promise.all(targets.map((episode) => api('POST', `/api/recordings/${encodeURIComponent(episode.recordingId)}/watched`, { watched })))
    showToast({ title: markedText({ count: targets.length, watched }) })
    await reload()
  })

  const setShowWatched = (watched, throughRecordingId = null) => run('Marking episodes', async () => {
    const result = await api('POST', `${keyPath()}/watched`, {
      watched,
      ...(throughRecordingId ? { through_recording_id: throughRecordingId } : {}),
    })
    showToast({ title: markedText({ count: result.changed || 0, watched }) })
    await reload()
  })

  const setSeriesPaused = (paused) => run(paused ? 'Pausing' : 'Resuming', async () => {
    const autorecs = show.value.rule?.autorecs || []
    await api('POST', '/api/epg/pause-series', { series_link_ids: autorecs.map((a) => a.seriesLinkId), paused })
    refreshAfterRecordingChange()
    showToast({ title: paused ? 'Paused the series recording' : 'Recording new episodes again', detail: paused ? 'New episodes do not record until you resume.' : '' })
    await reload()
  })

  const refreshArtwork = () => run('Refreshing the artwork', async () => {
    await api('POST', `${keyPath()}/refresh-artwork`)
    artworkVersion.value += 1
    showToast({ title: 'Refreshing the artwork', detail: 'New pictures appear in a moment.' })
    await reload()
  })

  const closePicture = () => { pictureOpen.value = false }

  const onPictureChanged = () => reload()

  const openShowInfo = async (current) => {
    info.value = showInfoOf({ show: current, timeZone: tz.value })
    const nicknames = await loadNicknames(current.key).catch(() => [])
    if (!nicknames.length || info.value?.title !== current.title) return
    info.value = showInfoOf({ show: current, timeZone: tz.value, nicknames: nicknames.map((nickname) => nickname.name) })
  }

  const openInPlex = (url) => openPlexLink({
    url,
    onMissing: (reason) => showToast({ kind: 'error', title: 'Cannot open in Plex', detail: reason }),
  })

  const removeAdsAgain = (episode) => run('Removing ads', async () => {
    const result = await api('POST', `/api/recordings/${encodeURIComponent(episode.recordingId)}/ad-scan`)
    showToast(result.mode === 'detect'
      ? { title: `Scanning ${episodeHeading(episode)} for ad breaks`, detail: 'This takes a few minutes.' }
      : { title: `Removing ads from ${episodeHeading(episode)}`, detail: 'This takes a few minutes.' })
  })

  const importEpisode = (episode) => run('Import', async () => {
    await api('POST', `/api/recordings/${encodeURIComponent(episode.recordingId)}/library`, { choice: 'include' })
    showToast({ title: `Importing ${episodeHeading(episode)}` })
    await reload()
  })

  const askDelete = ({ variant, list }) => {
    const deletable = deletableEpisodesOf({ episodes: list, activeIds: activeIds.value })
    if (!deletable.length) return
    deleteRequest.value = {
      variant,
      show: show.value,
      episodes: deletable,
      totalCount: episodes.value.length,
      leadMeta: variant === 'episode'
        ? [show.value.title, episodeMetaOf({ episode: { ...deletable[0], watched: false, positionS: null, status: null, libraryState: null }, timeZone: tz.value })].filter(Boolean).join(' · ')
        : '',
    }
  }

  const cancelDelete = () => { deleteRequest.value = null }

  const onDeleted = async (outcome) => {
    deleteRequest.value = null
    showToast({
      kind: outcome.kind === 'ok' ? 'ok' : 'error',
      title: outcome.title,
      detail: [outcome.detail, outcome.stoppedSeries ? 'Stopped recording this show.' : ''].filter(Boolean).join(' · '),
      failures: outcome.failures,
    })
    await reload()
  }

  const chooseShowAction = (key) => runFromMenu(key, () => startShowAction(key))

  const startShowAction = (key) => {
    const current = show.value
    if (key === 'play-next') {
      const next = episodeById({ show: current, recordingId: current.resumeNext?.recordingId })
      return next && play(next)
    }
    if (key === 'mark-all-watched') return setShowWatched(true)
    if (key === 'mark-all-unwatched') return setShowWatched(false)
    if (key === 'options') return openOptions?.()
    if (key === 'pause-series') return setSeriesPaused(true)
    if (key === 'resume-series') return setSeriesPaused(false)
    if (key === 'show-info') return openShowInfo(current)
    if (key === 'plex') return openInPlex(`${keyPath()}/plex-link`)
    if (key === 'change-picture') {
      pictureOpen.value = true
      return
    }
    if (key === 'refresh-artwork') return refreshArtwork()
    if (key === 'delete-watched') return askDelete({ variant: 'watched', list: episodes.value.filter((e) => e.watched) })
    if (key === 'delete-all') return askDelete({ variant: 'all', list: episodes.value })
  }

  const chooseEpisodeAction = (key) => {
    const episode = menuEpisode.value
    return runFromMenu(key, () => startEpisodeAction(key, episode))
  }

  const startEpisodeAction = (key, episode) => {
    if (!episode) return
    if (key === 'resume') return play(episode)
    if (key === 'play-start') return play(episode, { fromStart: episode.positionS > 0 && !episode.watched })
    if (key === 'watched') return setEpisodesWatched([episode], true)
    if (key === 'unwatched') return setEpisodesWatched([episode], false)
    if (key === 'watched-earlier') {
      const earlier = latestEarlierEpisodeOf({ episodes: episodes.value, episode })
      return earlier && setShowWatched(true, earlier.recordingId)
    }
    if (key === 'episode-info') {
      info.value = episodeInfoOf({ episode, showTitle: show.value.title, timeZone: tz.value })
      return
    }
    if (key === 'import') return importEpisode(episode)
    if (key === 'remove-ads') return removeAdsAgain(episode)
    if (key === 'plex') return openInPlex(`/api/library/recordings/${encodeURIComponent(episode.recordingId)}/plex-link`)
    if (key === 'delete-episode') return askDelete({ variant: 'episode', list: [episode] })
  }

  return {
    menuEpisode, showMenuOpen, info, deleteRequest, busy, pendingKey, adRemovalEnabled, artworkVersion, activeIds,
    pictureOpen, closePicture, onPictureChanged,
    showGroups, episodeGroups, showMenuSubtitle, episodeTip,
    openShowMenu, openEpisodeMenu, closeMenus, chooseShowAction, chooseEpisodeAction,
    askDelete, cancelDelete, onDeleted, setEpisodesWatched, runPending, play,
  }
}
