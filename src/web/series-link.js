export const ANY_CHANNEL_PREFIX = '|'

export const anyChannelLinkFor = (seriesLink) => {
  const link = String(seriesLink ?? '')
  const separator = link.indexOf('|')
  return separator < 0 ? null : `${ANY_CHANNEL_PREFIX}${link.slice(separator + 1)}`
}

export const isAnyChannelLink = (seriesLink) => String(seriesLink ?? '').startsWith(ANY_CHANNEL_PREFIX)

export const findSeriesLink = ({ links, seriesLink }) => {
  if (seriesLink == null) return null
  const exact = String(seriesLink)
  if (links.has(exact)) return exact
  const anyChannel = anyChannelLinkFor(exact)
  return anyChannel && links.has(anyChannel) ? anyChannel : null
}
