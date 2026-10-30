import { computed } from '/vendor/vue.esm-browser.prod.js'
import { metaPartsOf } from '/meta-parts.js'

export const MetaLine = {
  props: { text: { type: String, default: '' } },
  template: `<template v-for="(part, index) in parts" :key="index"><span :class="{ 'ui-meta-part': part.whole }">{{ part.text }}</span>{{ index < parts.length - 1 ? ' ' : '' }}</template>`,
  setup(props) {
    const parts = computed(() => metaPartsOf(props.text))
    return { parts }
  },
}
