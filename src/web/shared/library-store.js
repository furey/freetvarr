import { viewStoreOf } from '/shared/view-store.js'
import { LIBRARY_CACHE } from '/view-cache.js'

export const libraryStore = viewStoreOf(LIBRARY_CACHE)

export const librarySummaryOf = (key) => libraryStore.cached()?.shows.find((show) => show.key === key) ?? null
