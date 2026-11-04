export const recordRequestError = (body = {}) =>
  body.channel_id == null || body.program_id == null ? 'channel_id and program_id are required' : null

export const seriesRequestError = (body = {}) =>
  body.series_link == null || body.channel_id == null || body.program_id == null
    ? 'series_link, channel_id and program_id are required'
    : null
