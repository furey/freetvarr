export const richTextParts = (text = '') => {
  const value = String(text ?? '')
  if (value.length > MAX_PARSED_LENGTH) return [{ code: false, text: value }]
  const parts = []
  let last = 0
  for (const match of value.matchAll(ADDRESS)) {
    const token = match[0].replace(TRAILING_PUNCTUATION, '')
    if (!token || isLabelledNumber(token)) continue
    if (match.index > last) parts.push({ code: false, text: value.slice(last, match.index) })
    parts.push({ code: true, text: token })
    last = match.index + token.length
  }
  if (last < value.length) parts.push({ code: false, text: value.slice(last) })
  return parts
}

export const RichText = {
  props: { text: { type: [String, Number], default: '' } },
  template: `<template v-for="(part, index) in parts" :key="index"><code v-if="part.code" class="ui-code">{{ part.text }}</code><template v-else>{{ part.text }}</template></template>`,
  computed: {
    parts() { return richTextParts(this.text) },
  },
}

const isLabelledNumber = (token) => SINGLE_LABEL_PORT.test(token) && /[A-Z]/.test(token)

const MAX_PARSED_LENGTH = 2000
const SINGLE_LABEL_PORT = /^[a-z][a-z0-9-]*:\d+$/i
const URL = String.raw`\b(?:https?|rtsp|htsp)://[^\s<>"']+`
const HOST_PORT = String.raw`\b[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*:\d{2,5}\b(?:/[^\s<>"']*)?`
const IP = String.raw`\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{2,5})?\b(?:/[^\s<>"']*)?`
const PATH = String.raw`(?<![\w/.:])/(?:[\w.+-]+/)*[\w+-][\w.+-]*`
const FILE = String.raw`(?<![\w/.-])(?:[\w-]+)?\.(?:ya?ml|xml|ini|env|json|edl|orig|conf)\b`
const HOST = String.raw`\b[a-z0-9-]{2,}(?:\.[a-z0-9-]+)+\.[a-z]{2,}\b`
const ADDRESS = new RegExp([URL, HOST_PORT, IP, PATH, HOST, FILE].join('|'), 'gi')
const TRAILING_PUNCTUATION = /[.,;:)\]]+$/
