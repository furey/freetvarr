import { isDescriptionLike } from './artwork-match.js'

export const hasEpisodeDetails = (programme) => programme?.series_no != null
  || programme?.episode_no != null
  || (Boolean(programme?.episode_title) && !isDescriptionLike(programme.episode_title))
