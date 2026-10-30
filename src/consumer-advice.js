export const cleanGuideText = ({ episodeTitle, synopsis }) => {
  const title = stripBoilerplate(episodeTitle)
  const summary = stripBoilerplate(synopsis)
  return {
    episodeTitle: title.text || null,
    synopsis: summary.text,
    advice: uniqueAdvice([...title.advice, ...summary.advice]),
  }
}

export const stripBoilerplate = (value) => {
  const text = String(value ?? '')
  const advice = []
  const cleaned = text
    .replace(CONSUMER_ADVICE, (_, list) => {
      advice.push(...adviceItemsOf(list))
      return ' '
    })
    .replace(AUDIO_DESCRIBED, ' ')
    .replace(COUNTRY_OF_ORIGIN, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { text: cleaned, advice: uniqueAdvice(advice) }
}

export const adviceItemsOf = (list) => String(list || '')
  .split(ADVICE_SEPARATOR)
  .flatMap(splitLetterRun)
  .map((item) => item.trim())
  .filter(Boolean)
  .map(adviceItemOf)

const splitLetterRun = (item) => (LETTER_RUN.test(item.trim()) ? item.trim().split(/\s+/) : [item])

const adviceItemOf = (item) => (ADVICE_LETTER.test(item)
  ? item.toUpperCase()
  : item.replace(/\s+/g, ' '))

const uniqueAdvice = (items) => [...new Map(items.map((item) => [item.toLowerCase(), item])).values()]

const CONSUMER_ADVICE = /(?:^|\s+)Consumer\s+Advice\s*:\s*([^.]*?)\s*(?:\.|$)(?=\s|$)/gi
const AUDIO_DESCRIBED = /(?:^|\s+)Audio\s+Described\s*(?:\(AD\)\s*\.?|\.)(?=\s|$)/gi
const COUNTRY_OF_ORIGIN = /^\s*From:\s*[^.]{2,40}\.(?=\s|$)/i
const ADVICE_SEPARATOR = /\s*(?:,|;|&|\/|\band\b)\s*/i
const ADVICE_LETTER = /^[adhlnsv]$/i
const LETTER_RUN = /^[adhlnsv](?:\s+[adhlnsv])+$/i
