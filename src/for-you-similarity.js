export const tokensOf = (text) => String(text || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/)
  .filter((token) => token.length > 2 && !STOP_WORDS.has(token))

export const bm25VectorsOf = ({ docs, k1 = 1.2, b = 0.75 }) => {
  const tokenised = new Map([...docs].map(([key, text]) => [key, tokensOf(text)]))
  const documentFrequency = new Map()
  for (const tokens of tokenised.values()) for (const token of new Set(tokens)) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1)
  const count = tokenised.size || 1
  const averageLength = [...tokenised.values()].reduce((sum, tokens) => sum + tokens.length, 0) / count || 1
  const vectors = new Map()
  for (const [key, tokens] of tokenised) {
    const frequency = new Map()
    for (const token of tokens) frequency.set(token, (frequency.get(token) || 0) + 1)
    const weights = new Map()
    for (const [token, tf] of frequency) {
      const df = documentFrequency.get(token)
      const idf = Math.log(1 + (count - df + 0.5) / (df + 0.5))
      weights.set(token, idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * tokens.length) / averageLength))))
    }
    vectors.set(key, normaliseSparse(weights))
  }
  return vectors
}

export const sparseCosine = (a, b) => {
  if (!a || !b) return 0
  const [small, large] = a.size < b.size ? [a, b] : [b, a]
  let sum = 0
  for (const [token, weight] of small) sum += weight * (large.get(token) || 0)
  return sum
}

export const denseCosine = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0
}

export const dotProduct = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i]
  return dot
}

export const meanVectorOf = (vectors = []) => {
  const present = vectors.filter(Boolean)
  if (!present.length) return null
  const mean = new Float32Array(present[0].length)
  for (const vector of present) for (let i = 0; i < mean.length; i += 1) mean[i] += vector[i] / present.length
  return mean
}

export const unitVectorOf = (vector) => {
  if (!vector) return null
  const norm = Math.sqrt(dotProduct(vector, vector))
  if (!norm) return null
  return vector.map((value) => value / norm)
}

export const nearestLikedOf = ({ vector, anchors = [], cosine = denseCosine, excludeKey = null, topK = 3 }) => anchors
  .filter((anchor) => anchor.key !== excludeKey)
  .map((anchor) => ({ key: anchor.key, title: anchor.title, affinity: anchor.affinity, similarity: cosine(vector, anchor.vector) }))
  .sort((a, b) => b.similarity * (0.5 + 0.5 * b.affinity) - a.similarity * (0.5 + 0.5 * a.affinity))
  .slice(0, topK)

export const similarityScoreOf = ({ similarity, floor, span }) => Math.max(0, Math.min(1, (similarity - floor) / span))

export const SIMILARITY_SCALES = {
  embedding: { floor: 0.25, span: 0.4 },
  bm25: { floor: 0.04, span: 0.3 },
}

const normaliseSparse = (weights) => {
  const norm = Math.sqrt([...weights.values()].reduce((sum, weight) => sum + weight * weight, 0))
  if (!norm) return weights
  for (const [token, weight] of weights) weights.set(token, weight / norm)
  return weights
}

const STOP_WORDS = new Set(`the and for with from that this their they them then than when what where who whom which while into onto over under
about after before again also are was were been being have has had his her hers him she you your yours our ours its it's not but all any can
will would could should may might must one two three new episode series season part tonight week today show shows program programme
more most some such only own same very just out off back down get gets got take takes make makes made way ways lives life
year years time times first last next day days each other another every both few many much now here there how why`.split(/\s+/))
