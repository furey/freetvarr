<script setup>
import { computed } from 'vue'
import { illustrations } from './illustrations.js'

const props = defineProps({
  name: { type: String, required: true }
})

const illustration = computed(() => illustrations[props.name])
</script>

<template>
  <figure v-if="illustration" class="ftv-illustration" v-html="illustration.svg"></figure>
</template>

<style scoped>
.ftv-illustration {
  max-width: 320px;
  margin: 8px 0 24px;
}

.ftv-illustration :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}

@media (max-width: 639px) {
  .ftv-illustration {
    max-width: 240px;
    margin: 4px 0 16px;
  }
}
</style>
