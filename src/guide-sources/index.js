import { createFreeviewAuSource } from './freeview-au.js'
import { createMjhAu } from './mjh-au.js'
import { createMjhNz } from './mjh-nz.js'

export const createGuideSources = ({ freeviewAu = createFreeviewAuSource(), mjhAu = createMjhAu(), mjhNz = createMjhNz() } = {}) => {
  const ranked = { au: [freeviewAu, mjhAu], nz: [mjhNz] }
  return {
    all: () => [freeviewAu, mjhAu, mjhNz],
    forCountry: (country) => ranked[country] ?? [],
    feedSourceOf: (country) => (ranked[country] ?? []).find((source) => source.feeds) ?? null,
  }
}

export const guideSources = createGuideSources()

export const xmltvFeedsOf = (country) => guideSources.feedSourceOf(country)?.feeds ?? []
