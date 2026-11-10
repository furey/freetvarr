import { cityRegionOf, createMjhSource } from './mjh-feed.js'

export const MJH_AU_FEEDS = ['Adelaide', 'Brisbane', 'Canberra', 'Darwin', 'Hobart', 'Melbourne', 'Perth', 'Sydney']
  .map((region) => ({ region, url: `https://i.mjh.nz/au/${region}/epg.xml` }))

export const createMjhAu = (options = {}) => createMjhSource({
  id: 'mjh-au',
  countries: ['au'],
  feeds: MJH_AU_FEEDS,
  regionOf: (timeZone) => cityRegionOf({ feeds: MJH_AU_FEEDS, timeZone }),
  ...options,
})
