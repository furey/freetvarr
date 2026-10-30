import { ref, computed } from '/vendor/vue.esm-browser.prod.js'
import {
  allEpisodesOf,
  deletableEpisodesOf,
  episodeInfoOf,
  episodeMenuOf,
  importedEpisodesOf,
  isRecorded,
  latestEarlierEpisodeOf,
  markedText,
  menuPendingLabelOf,
  movedText,
  runningEpisodeOf,
  showInfoOf,
  showMenuOf,
  undoMovesOf,
  unmarkedText,
  watchedChangeTargets,
} from '/library-menus.js'
import { episodeById, episodeHeading, episodeMetaOf, recordingRowOf } from '/show-page.js'
import { adConfirmOf, adStartedToastOf, restoreConfirmOf, restoredToastOf } from '/ad-confirm.js'
import { openPlexLink } from '/components/library-menus.js'
import { loadNicknames } from '/components/also-known-as.js'
import { holdAtLeast } from '/pending.js'
import { api, fetchSettings } from '/shared/api.js'
import { playRecording } from '/shared/playback-session.js'
import { watchLive, watchRecordingFromStart } from '/shared/live-session.js'
import { useProgrammeSheet } from '/shared/programme-sheet-store.js'
import { fromStartRecordingOf, liveInProgressOf, recordingChannelOf } from '/in-progress-display.js'
import { recordingNow, refreshAfterRecordingChange } from '/shared/recording-now.js'
import { navigate } from '/shared/router.js'
import { toast } from '/shared/toast.js'
import { showHrefOf } from '/show-key.js'
import { tz } from '/shared/time.js'

export const SELECT_TIP = 'Tip: tap Select on the show page to mark or delete several episodes at once.'

export const useLibraryActions = ({ show, reload, showToast, openOptions, selectTip = SELECT_TIP, canMove = false }) => {
  const menuEpisode = ref(null)
  const showMenuOpen = ref(false)
  const info = ref(null)
  const deleteRequest = ref(null)
  const busy = ref(false)
  const pendingKey = ref('')
  const adRemovalEnabled = ref(false)
  const artworkVersion = ref(0)
  const pictureOpen = ref(false)
  const moveRequest = ref(null)
  const actionRequest = ref(null)
  const retentionDays = ref(null)

  const activeIds = computed(() => new Set((recordingNow.value.active || []).map((r) => String(r.dvrUuid))))
  const episodes = computed(() => allEpisodesOf(show.value))
  const showGroups = computed(() => (show.value ? showMenuOf({ show: show.value, activeIds: activeIds.value, canMove }) : []))
  const episodeGroups = computed(() => (menuEpisode.value
    ? episodeMenuOf({ episode: menuEpisode.value, episodes: episodes.value, activeIds: activeIds.value, adRemovalEnabled: adRemovalEnabled.value, canMove })
    : []))
  const showMenuSubtitle = computed(() => {
    const list = episodes.value
    if (!list.length) return ''
    const unwatched = list.filter((e) => !e.watched && !e.failed).length
    return `${list.length === 1 ? '1 episode' : `${list.length} episodes`} · ${unwatched} unwatched`
  })
  const episodeTip = computed(() => (selectTip ? selectTip : ''))

  fetchSettings().then((settings) => {
    adRemovalEnabled.value = Boolean(settings.ad_removal_enabled)
    retentionDays.value = settings.ad_original_retention_days ?? null
  }).catch(() => {})

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

  const { openProgramme } = useProgrammeSheet()
  const liveItemOf = (episode) => liveInProgressOf({ episode, active: recordingNow.value.active || [] })

  const watchFromStart = (episode) => {
    const item = liveItemOf(episode)
    if (!item) return
    const title = show.value?.title || episode.title
    watchRecordingFromStart({ channel: recordingChannelOf(item), recording: fromStartRecordingOf({ item, title, episode }), nowTitle: title })
  }

  const watchRecordingLive = (episode) => {
    const item = liveItemOf(episode)
    if (item) watchLive({ channel: recordingChannelOf(item), nowTitle: show.value?.title || episode.title })
  }

  const openRecordingProgramme = (episode) => {
    const item = liveItemOf(episode)
    if (!item) return
    openProgramme({
      channelId: item.channelId,
      channelHint: { name: item.channelName, hasLogo: true },
      programme: {
        program_id: item.programId,
        programId: item.programId,
        title: episode.title,
        episode_title: episode.episodeTitle,
        start: item.start,
        end: item.stop,
        channelId: item.channelId,
        has_image: item.hasImage,
      },
    })
  }

  const setEpisodesWatched = (list, watched) => run('Marking episodes', async () => {
    const targets = watchedChangeTargets({ episodes: list, watched })
    const results = await Promise.allSettled(targets.map((episode) => api('POST', `/api/recordings/${encodeURIComponent(episode.recordingId)}/watched`, { watched })))
    const failures = results.filter((result) => result.status === 'rejected')
    await reload()
    if (!failures.length) return showToast({ title: markedText({ count: targets.length, watched }) })
    showToast({ kind: 'error', title: unmarkedText({ failed: failures.length, total: targets.length }), detail: failures[0].reason?.message || '' })
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

  const moveToShelf = ({ kind, shelf }) => run(`Moving to ${shelf}`, async () => {
    await api('PUT', `/api/programme-kind/${encodeURIComponent(show.value.key)}`, { kind, title: show.value.title })
    showToast({ title: `Moved to ${shelf}`, detail: 'Recorded files move to the matching folder in a moment.' })
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

  const leadOf = (episode) => ({
    image: episode.image || `/api/epg/show-image?title=${encodeURIComponent(show.value?.title || '')}&w=384`,
    title: episodeHeading(episode),
    meta: [show.value?.title, episodeMetaOf({ episode: { ...episode, watched: false, positionS: null, status: null, libraryState: null }, timeZone: tz.value })].filter(Boolean).join(' · '),
    fallbackTitle: show.value?.title || '',
  })

  const recordingPath = (episode, action) => `/api/recordings/${encodeURIComponent(episode.recordingId)}/${action}`

  const askRemoveAds = (episode) => {
    actionRequest.value = {
      lead: leadOf(episode),
      copy: adConfirmOf({ episode, retentionDays: retentionDays.value, timeZone: tz.value, nowMs: Date.now() }),
      run: async () => {
        const result = await api('POST', recordingPath(episode, 'ad-scan'))
        return { toast: adStartedToastOf({ mode: result.mode, heading: episodeHeading(episode) }) }
      },
    }
  }

  const askRestore = (episode) => {
    actionRequest.value = {
      lead: leadOf(episode),
      copy: restoreConfirmOf({ episode }),
      run: async () => {
        const result = await api('POST', recordingPath(episode, 'restore-original'))
        return { toast: restoredToastOf({ uncut: result.uncut, heading: episodeHeading(episode) }) }
      },
    }
  }

  const cancelAction = () => { actionRequest.value = null }

  const onActionDone = async (result) => {
    actionRequest.value = null
    if (result?.toast) showToast(result.toast)
    await reload()
  }

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

  const openMove = (list) => {
    moveRequest.value = {
      ids: list.map((episode) => episode.recordingId),
      fromKey: show.value.key,
      fromTitle: show.value.title,
      leavesShow: list.length >= episodes.value.length,
    }
  }

  const closeMove = () => { moveRequest.value = null }

  const moveToShow = (title) => run('Moving', async () => {
    const request = moveRequest.value
    if (!request) return
    const result = await api('POST', '/api/library/recordings/show', { ids: request.ids, title })
    moveRequest.value = null
    toast({ text: movedText(title), action: { label: 'Undo', run: () => undoMove({ request, previous: result.previous }) } })
    if (request.leavesShow) return navigate(showHrefOf(title))
    await reload()
  })

  const undoMove = ({ request, previous }) => run('Undo', async () => {
    for (const move of undoMovesOf(previous)) await api('POST', '/api/library/recordings/show', move)
    showToast({ title: `Moved back to ${request.fromTitle}` })
    if (request.leavesShow) return navigate(showHrefOf(request.fromTitle))
    await reload()
  })

  const chooseShowAction = (key) => runFromMenu(key, () => startShowAction(key))

  const startShowAction = (key) => {
    const current = show.value
    if (key === 'from-start') return watchFromStart(runningEpisodeOf(current))
    if (key === 'stop-recording') return openRecordingProgramme(runningEpisodeOf(current))
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
    if (key === 'move') return openMove(importedEpisodesOf(current).filter(isRecorded))
    if (key === 'plex') return openInPlex(`${keyPath()}/plex-link`)
    if (key === 'change-picture') {
      pictureOpen.value = true
      return
    }
    if (key === 'refresh-artwork') return refreshArtwork()
    if (key === 'kind-show') return moveToShelf({ kind: 'show', shelf: 'Shows' })
    if (key === 'kind-one-off') return moveToShelf({ kind: 'one-off', shelf: 'One-offs' })
    if (key === 'delete-watched') return askDelete({ variant: 'watched', list: episodes.value.filter((e) => e.watched) })
    if (key === 'delete-all') return askDelete({ variant: 'all', list: episodes.value })
  }

  const chooseEpisodeAction = (key) => {
    const episode = menuEpisode.value
    return runFromMenu(key, () => startEpisodeAction(key, episode))
  }

  const startEpisodeAction = (key, episode) => {
    if (!episode) return
    if (key === 'from-start') return watchFromStart(episode)
    if (key === 'watch-live') return watchRecordingLive(episode)
    if (key === 'stop-recording') return openRecordingProgramme(episode)
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
    if (key === 'move') return openMove([episode])
    if (key === 'import') return importEpisode(episode)
    if (key === 'remove-ads') return askRemoveAds(episode)
    if (key === 'restore-original') return askRestore(episode)
    if (key === 'plex') return openInPlex(`/api/library/recordings/${encodeURIComponent(episode.recordingId)}/plex-link`)
    if (key === 'delete-episode') return askDelete({ variant: 'episode', list: [episode] })
  }

  return {
    menuEpisode, showMenuOpen, info, deleteRequest, busy, pendingKey, adRemovalEnabled, artworkVersion, activeIds,
    pictureOpen, closePicture, onPictureChanged, moveRequest, closeMove, moveToShow,
    actionRequest, cancelAction, onActionDone,
    showGroups, episodeGroups, showMenuSubtitle, episodeTip,
    openShowMenu, openEpisodeMenu, closeMenus, chooseShowAction, chooseEpisodeAction,
    askDelete, cancelDelete, onDeleted, setEpisodesWatched, runPending, play,
    watchFromStart, watchRecordingLive, openRecordingProgramme, liveItemOf,
  }
}
