export const RATINGS_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000]
export const MIN_TMDB_VOTES = 50
export const REVIEW_LINK_GAP_PX = 12

export const ratingsKeyOf = ({ title, kind, year }) => {
  const name = String(title || '').trim()
  if (!name) return ''
  return `${ratingsKindOf(kind)}|${name.toLowerCase()}|${yearOf(year) ?? ''}`
}

export const ratingsUrlOf = ({ title, kind, year }) => {
  const base = `/api/epg/programme-ratings?title=${encodeURIComponent(String(title || '').trim())}&kind=${ratingsKindOf(kind)}`
  return yearOf(year) ? `${base}&year=${yearOf(year)}` : base
}

const yearOf = (year) => {
  const value = Number(year)
  return Number.isInteger(value) && value > 1800 ? value : null
}

export const ratingsKindOf = (kind) => (kind === 'movie' ? 'movie' : '')

export const retryDelayOf = (attempt) => RATINGS_RETRY_DELAYS_MS[attempt] ?? null

export const isSettledRatings = (ratings) => ratings?.status === 'ready' || ratings?.status === 'none'

export const classificationOf = (value) => {
  const code = String(value || '').trim().toUpperCase().replace(/\s+/g, '')
  return CLASSIFICATION_TONES[code] ? code : null
}

export const classificationToneOf = (value) => CLASSIFICATION_TONES[classificationOf(value)] || null

export const adviceLineOf = (advice) => {
  const words = adviceWordsOf(advice)
  if (!words.length) return ''
  const line = words.join(', ').toLowerCase()
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}`
}

export const classificationLabelOf = ({ classification, advice }) => {
  const code = classificationOf(classification)
  if (!code) return ''
  const adviceLine = adviceLineOf(advice)
  return adviceLine ? `Classified ${code}: ${adviceLine.toLowerCase()}` : `Classified ${code}`
}

export const shownClassificationOf = ({ classification, advice }) => {
  const code = classificationOf(classification)
  if (!code) return null
  return {
    code,
    tone: CLASSIFICATION_TONES[code],
    name: CLASSIFICATION_NAMES[code],
    adviceLine: adviceLineOf(advice),
    ariaLabel: `${classificationLabelOf({ classification: code, advice })}. ${CLASSIFICATION_NAMES[code]}`,
  }
}

const adviceWordsOf = (advice) => (Array.isArray(advice) ? advice : [])
  .map((item) => String(item || '').trim())
  .filter(Boolean)
  .map((item) => ADVICE_WORDS[item.toUpperCase()] || item.replace(/\s+/g, ' '))
  .filter((word, index, words) => words.findIndex((other) => other.toLowerCase() === word.toLowerCase()) === index)

export const shownScoreOf = (ratings) => {
  if (ratings?.status !== 'ready') return null
  const score = Number(ratings.score)
  if (ratings.score == null || !Number.isFinite(score) || score <= 0) return null
  const source = sourceNameOf(ratings.source)
  if (!source) return null
  if (ratings.source === 'tmdb' && !(Number(ratings.votes) >= MIN_TMDB_VOTES)) return null
  return {
    label: score.toFixed(1),
    outOf: `${score.toFixed(1)} out of 10`,
    votesLine: votesLineOf({ source: ratings.source, votes: ratings.votes }),
    ariaLabel: `Rated ${score.toFixed(1)} out of 10 by ${source} users`,
    linkLabel: `Open on ${source}`,
    url: safeLinkOf(ratings.url),
  }
}

export const shownReviewOf = (ratings) => {
  if (ratings?.status !== 'ready') return null
  const reviews = ratings.reviews
  const snippet = String(reviews?.snippet || '').trim()
  const count = Number(reviews?.count)
  const url = safeLinkOf(reviews?.url)
  if (!snippet || !(count >= 1) || !url) return null
  return { snippet: stripOuterQuotes(snippet), linkLabel: reviewsLinkLabelOf(count), url }
}

export const reviewsLinkLabelOf = (count) => (Number(count) === 1 ? 'Read 1 review' : `Read ${Number(count).toLocaleString('en-AU')} reviews`)

export const votesLineOf = ({ source, votes }) => {
  const name = sourceNameOf(source)
  if (!name) return ''
  const count = Number(votes)
  if (source !== 'tmdb' || !(count > 0)) return `${name} users`
  return `${name} users, ${count.toLocaleString('en-AU')} ${count === 1 ? 'vote' : 'votes'}`
}

export const sourceNameOf = (source) => SOURCE_NAMES[source] || ''

export const linkFitsLastLine = ({ lastLineRight, boxLeft, boxWidth, linkWidth, gap = REVIEW_LINK_GAP_PX }) => {
  if (![lastLineRight, boxLeft, boxWidth, linkWidth].every(Number.isFinite)) return false
  if (boxWidth <= 0 || linkWidth <= 0) return false
  return lastLineRight - boxLeft + gap + linkWidth <= boxWidth
}

export const lastLineRightOf = (rects) => {
  const drawn = Array.from(rects || []).filter((rect) => rect.width > 0)
  return drawn.length ? drawn[drawn.length - 1].right : null
}

const safeLinkOf = (url) => (/^https:\/\//i.test(String(url || '')) ? String(url) : null)

const stripOuterQuotes = (text) => text.replace(/^["“”']+|["“”']+$/g, '').trim()

const SOURCE_NAMES = { tmdb: 'TMDB', tvmaze: 'TVmaze' }

const CLASSIFICATION_TONES = {
  P: 'g',
  C: 'g',
  G: 'g',
  PG: 'pg',
  M: 'm',
  'MA15+': 'ma',
  'AV15+': 'ma',
  'R18+': 'r',
}

const CLASSIFICATION_NAMES = {
  P: 'Preschool children',
  C: 'Children',
  G: 'General',
  PG: 'Parental guidance recommended',
  M: 'Recommended for mature audiences',
  'MA15+': 'Not suitable for people under 15',
  'AV15+': 'Adult violence, not suitable under 15',
  'R18+': 'Restricted to 18 and over',
}

const ADVICE_WORDS = {
  A: 'Adult themes',
  D: 'Drug references',
  H: 'Horror',
  L: 'Language',
  N: 'Nudity',
  S: 'Sex references',
  V: 'Violence',
}
