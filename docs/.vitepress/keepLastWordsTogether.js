const noBreakSpace = ' '
const longestPair = 40
const longestUnbrokenCode = 28
const trailingPunctuation = /^[.,;:)!?'"]*$/
const transparentTokens = new Set([
  'link_open', 'link_close', 'strong_open', 'strong_close', 'em_open', 'em_close', 's_open', 's_close'
])

const splitAtLastSpace = (content) => {
  const spaceAt = content.lastIndexOf(' ')
  if (spaceAt === -1) return null
  const head = content.slice(0, spaceAt)
  return { head, tail: content.slice(spaceAt + 1), previousWordLength: head.length - head.search(/\S*$/) }
}

const noBreakCode = (content, escapeHtml, splitAt = 0) => {
  const unbroken = escapeHtml(content.slice(splitAt))
  const head = escapeHtml(content.slice(0, splitAt))
  return `<code>${head}<span class="no-break">${unbroken}</span></code>`
}

const noBreakText = (content, escapeHtml, splitAt) =>
  `${escapeHtml(content.slice(0, splitAt))}<span class="no-break">${escapeHtml(content.slice(splitAt))}</span>`

const joinLastTwoWords = (children, escapeHtml) => {
  let tailLength = 0
  for (let index = children.length - 1; index >= 0; index--) {
    const child = children[index]
    if (transparentTokens.has(child.type)) continue
    if (child.type !== 'text' && child.type !== 'code_inline') return
    const split = splitAtLastSpace(child.content)
    if (!split) {
      tailLength += child.content.length
      continue
    }
    const pairLength = split.previousWordLength + 1 + split.tail.length + tailLength
    if (pairLength > longestPair) return
    const hasPreviousWord = split.head.trim() || index > 0
    if (!hasPreviousWord) return
    const wordStart = split.head.length - split.previousWordLength
    if (child.type === 'text' && !/[-/]/.test(split.tail)) {
      child.content = `${split.head}${noBreakSpace}${split.tail}`
      return
    }
    const wrap = child.type === 'text' ? noBreakText : noBreakCode
    child.type = 'html_inline'
    child.content = wrap(child.content, escapeHtml, wordStart)
    return
  }
}

const keepFinalCodeUnbroken = (children, escapeHtml) => {
  const lastIndex = children.findLastIndex(
    ({ type, content }) => !(type === 'text' && trailingPunctuation.test(content))
  )
  const last = children[lastIndex]
  if (last?.type !== 'code_inline' || last.content.length > longestUnbrokenCode) return
  last.type = 'html_inline'
  last.content = noBreakCode(last.content, escapeHtml)
}

export const keepLastWordsTogether = (md) => {
  md.core.ruler.push('keep-last-words-together', ({ tokens }) => {
    tokens
      .filter(({ type, children }, index) =>
        type === 'inline' && children && tokens[index - 1]?.type !== 'heading_open')
      .forEach(({ children }) => {
        joinLastTwoWords(children, md.utils.escapeHtml)
        keepFinalCodeUnbroken(children, md.utils.escapeHtml)
      })
  })
}
