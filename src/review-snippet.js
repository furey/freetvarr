export const pickReviewSnippet = ({ reviews = [], average = null } = {}) => {
  let best = null
  for (const review of reviews) {
    sentencesOf(plainTextOf(review?.content)).forEach((sentence, index) => {
      if (!isQuotable(sentence)) return
      const score = snippetScoreOf({ sentence, isFirst: index === 0, rating: reviewRatingOf(review), average })
      if (!best || score > best.score) best = { sentence, score }
    })
  }
  return best?.sentence || null
}

export const plainTextOf = (text) => String(text || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/https?:\/\/\S+/g, ' ')
  .replace(/^\s{0,3}(?:#{1,6}|>+|[-*+]|\d+\.)\s+/gm, '')
  .replace(/(\*{1,3}|_{1,3}|~~|`+)(\S(?:.*?\S)?)\1/g, '$2')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, ' ')
  .trim()

export const sentencesOf = (text) => String(text || '')
  .split(/(?<=[.!?…])["'”’)]*\s+(?=["'“‘(]*[\p{Lu}\d])/u)
  .map((sentence) => sentence.trim().replace(/^["'“‘]+|["'”’]+$/g, '').trim())
  .filter(Boolean)

export const isQuotable = (sentence) => sentence.length >= MIN_SNIPPET_LENGTH
  && sentence.length <= MAX_SNIPPET_LENGTH
  && !SPOILER_RISK.test(sentence)
  && (!FIRST_PERSON.test(sentence) || judgementCountOf(sentence) > 0)

export const judgementCountOf = (sentence) => (String(sentence).toLowerCase().match(JUDGEMENT_WORDS) || []).length

export const snippetScoreOf = ({ sentence, isFirst = false, rating = null, average = null }) => {
  const distance = Number.isFinite(rating) && Number.isFinite(average) ? Math.abs(rating - average) : UNKNOWN_RATING_DISTANCE
  return 3 * judgementCountOf(sentence) - distance - (isFirst ? 1 : 0)
}

const reviewRatingOf = (review) => {
  const rating = review?.author_details?.rating ?? review?.rating
  return rating == null || rating === '' ? null : Number(rating)
}

const MIN_SNIPPET_LENGTH = 50
const MAX_SNIPPET_LENGTH = 170
const UNKNOWN_RATING_DISTANCE = 3
const SPOILER_RISK = /\b(?:spoilers?|ending|endings|twists?|dies|died|killed|death of|finale)\b/i
const FIRST_PERSON = /\b(?:I|I'm|I’m|I've|I’ve|I'd|I’d|I'll|I’ll|me|my|mine|myself)\b/
const JUDGEMENT_WORDS = new RegExp(`\\b(?:${[
  'brilliant', 'brilliantly', 'masterpiece', 'masterful', 'gripping', 'stunning', 'beautiful', 'beautifully',
  'superb', 'superbly', 'excellent', 'compelling', 'moving', 'powerful', 'funny', 'hilarious', 'charming',
  'clever', 'tense', 'thrilling', 'haunting', 'wonderful', 'wonderfully', 'great', 'best', 'fantastic',
  'memorable', 'captivating', 'delightful', 'engaging', 'entertaining', 'heartfelt', 'gorgeous', 'outstanding',
  'remarkable', 'riveting', 'witty', 'poignant', 'impressive', 'perfect', 'perfectly', 'terrific',
  'magnificent', 'enjoyable', 'flawless', 'stellar', 'unforgettable', 'gem', 'classic', 'timeless',
  'dull', 'boring', 'disappointing', 'mediocre', 'uneven', 'flawed', 'overlong', 'predictable', 'forgettable',
  'tedious', 'weak',
].join('|')})\\b`, 'g')
