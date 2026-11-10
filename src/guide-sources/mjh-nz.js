import { cityRegionOf, createMjhSource } from './mjh-feed.js'

export const MJH_NZ_FEEDS = [{ region: 'New Zealand', url: 'https://i.mjh.nz/nz/epg.xml' }]

export const createMjhNz = (options = {}) => createMjhSource({
  id: 'mjh-nz',
  countries: ['nz'],
  feeds: MJH_NZ_FEEDS,
  regionOf: (timeZone) => cityRegionOf({ feeds: MJH_NZ_FEEDS, timeZone }),
  ...options,
})
