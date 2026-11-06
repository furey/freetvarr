import { TitleVariantError, setSeriesTitleVariant } from './epg.js'

export const mountSeriesVariantRoutes = ({ app, csrf, limiter = passThrough, onError, setVariant = setSeriesTitleVariant }) => {
  app.post('/api/epg/series-title-variant', limiter, csrf, async (req, res) => {
    const { series_link_ids, variant, enabled } = req.body || {}
    const problem = titleVariantProblemOf({ seriesLinkIds: series_link_ids, variant, enabled })
    if (problem) return res.status(400).json({ error: problem })
    try {
      res.json(await setVariant({ seriesLinkIds: series_link_ids, variant: variant.trim(), enabled }))
    } catch (err) {
      if (err instanceof TitleVariantError) return res.status(400).json({ error: err.message, code: err.code })
      onError(res, err, 'series-title-variant')
    }
  })
}

const titleVariantProblemOf = ({ seriesLinkIds, variant, enabled }) => {
  if (!Array.isArray(seriesLinkIds) || seriesLinkIds.length === 0) return 'series_link_ids must be a non-empty array'
  if (typeof variant !== 'string' || !variant.trim() || variant.length > MAX_TITLE_TEXT) return 'variant must be a non-empty title'
  if (typeof enabled !== 'boolean') return 'enabled must be true or false'
  return null
}

const passThrough = (req, res, next) => next()

const MAX_TITLE_TEXT = 200
