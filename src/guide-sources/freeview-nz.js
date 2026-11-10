import { FREEVIEW_NZ_API_HOST, freeviewNzRegionOf } from '../freeview-au.js'
import { createFreeviewSource } from './freeview-au.js'

export const NZ_RATING_LABELS = new Set(['G', 'PG', 'M', '16', '18'])

export const createFreeviewNzSource = (options = {}) => createFreeviewSource({
  id: 'freeview-nz',
  countries: ['nz'],
  host: FREEVIEW_NZ_API_HOST,
  regionOf: freeviewNzRegionOf,
  channelsPath: () => '/content/v1/channels',
  ratingLabels: NZ_RATING_LABELS,
  horizonDays: NZ_HORIZON_DAYS,
  ...options,
})

const NZ_HORIZON_DAYS = 8
