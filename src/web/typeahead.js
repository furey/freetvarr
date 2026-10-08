export const filterOptions = ({ options, query }) => {
  const terms = words(query)
  if (!terms.length) return options
  const phrase = normalise(query)
  return options
    .map((option, index) => ({ option, index, rank: rankOption({ option, terms, phrase }) }))
    .filter(({ rank }) => rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ option }) => option)
}

export const optionLabel = ({ options, value, noneLabel }) =>
  options.find((o) => o.id === value)?.name ?? noneLabel

export const nextIndex = ({ current, delta, length }) => {
  if (!length) return -1
  if (current < 0) return delta > 0 ? 0 : length - 1
  return (current + delta + length) % length
}

const RANK_EXACT = 0
const RANK_PREFIX = 1
const RANK_WORD_PREFIX = 2
const RANK_NUMBER = 3
const RANK_CONTAINS = 4

const normalise = (text) => String(text ?? '').toLowerCase().trim().replace(/\s+/g, ' ')

const words = (text) => normalise(text).split(' ').filter(Boolean)

const rankOption = ({ option, terms, phrase }) => {
  const name = normalise(option.name)
  const number = option.number ? String(option.number) : ''
  const nameWords = words(name)
  const matchesTerm = (term) => name.includes(term) || number === term
  if (!terms.every(matchesTerm)) return null
  if (name === phrase) return RANK_EXACT
  if (name.startsWith(phrase)) return RANK_PREFIX
  if (terms.every((term) => nameWords.some((w) => w.startsWith(term)))) return RANK_WORD_PREFIX
  if (number && terms.includes(number)) return RANK_NUMBER
  return RANK_CONTAINS
}
