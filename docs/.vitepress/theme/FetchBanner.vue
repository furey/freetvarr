<script setup>
import { withBase, useData } from 'vitepress'
import { computed } from 'vue'

const { page } = useData()
const isLeavingFetchPage = computed(() => page.value.relativePath === 'guide/leaving-fetch.md')
</script>

<template>
  <a v-if="!isLeavingFetchPage" class="fetch-banner" :href="withBase('/guide/leaving-fetch')">
    <span class="fetch-banner__text">
      <strong>Leaving Fetch TV?</strong>
      <span class="fetch-banner__long">Read the guide</span>
      <span class="fetch-banner__short">Read the guide</span>
    </span>
    <svg class="fetch-banner__arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4"/>
    </svg>
  </a>
</template>

<style scoped>
.fetch-banner {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: var(--vp-z-index-layout-top);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-sizing: border-box;
  height: var(--vp-layout-top-height);
  padding: 0 16px;
  background: var(--ftv-brand-blue);
  color: #fff;
  font-size: 14px;
  line-height: 1.5;
  text-decoration: none;
  transition: background-color 0.2s;
}

.fetch-banner:hover {
  background-color: color-mix(in srgb, var(--ftv-brand-blue) 88%, #000);
}

.fetch-banner:hover .fetch-banner__text {
  text-decoration: underline;
}

.fetch-banner:focus-visible {
  outline: 2px solid #fff;
  outline-offset: -4px;
}

.fetch-banner__text {
  min-width: 0;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fetch-banner__text strong {
  margin-right: 4px;
  font-weight: 700;
}

.fetch-banner__long,
.fetch-banner__short {
  font-weight: 400;
}

.fetch-banner__short {
  display: none;
}

.fetch-banner__arrow {
  flex-shrink: 0;
  width: 1.15em;
  height: 1.15em;
  color: inherit;
  transition: transform 0.2s;
}

.fetch-banner:hover .fetch-banner__arrow {
  transform: translateX(3px);
}

@media (max-width: 639px) {
  .fetch-banner {
    font-size: 13px;
  }

  .fetch-banner__long {
    display: none;
  }

  .fetch-banner__short {
    display: inline;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fetch-banner,
  .fetch-banner__arrow {
    transition: none;
  }
}
</style>
