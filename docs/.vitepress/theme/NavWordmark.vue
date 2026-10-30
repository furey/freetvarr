<script setup>
import { computed } from 'vue'
import { useData } from 'vitepress'

const { frontmatter } = useData()
const isHome = computed(() => frontmatter.value.layout === 'home')
</script>

<template>
  <span class="ftv-nav-wordmark">
    <span v-if="isHome" class="ftv-mark" role="img" aria-label="Freetvarr"><i></i><i></i><i></i></span>
    <span v-else class="ftv-wordmark" role="img" aria-label="Freetvarr">
      <span class="ftv-wordmark-free" aria-hidden="true">Free</span><span class="ftv-wordmark-tv" aria-hidden="true">tv</span><span class="ftv-wordmark-arr" aria-hidden="true">arr</span>
    </span>
  </span>
</template>
