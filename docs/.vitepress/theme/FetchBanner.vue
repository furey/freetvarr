<script setup>
import { withBase } from 'vitepress'
</script>

<template>
  <a class="fetch-banner" :href="withBase('/guide/leaving-fetch')">
    <span class="fetch-banner__text">
      <strong>Leaving Fetch TV?</strong>
      A step-by-step guide to owning your setup before the levy
    </span>
    <svg class="fetch-banner__arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4"/>
    </svg>
  </a>
</template>

<style scoped>
.fetch-banner {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
  margin-bottom: 24px;
  padding: 8px 14px;
  border: 1px solid var(--vp-c-brand-soft);
  border-radius: 999px;
  background: var(--vp-c-brand-softer);
  color: var(--vp-c-text-1);
  font-size: 14px;
  line-height: 1.4;
  text-decoration: none;
  transition: border-color 0.2s, background-color 0.2s;
}

.fetch-banner:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.fetch-banner:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.fetch-banner__text {
  color: var(--vp-c-text-2);
  text-align: left;
  text-wrap: balance;
}

.fetch-banner__text strong {
  color: var(--vp-c-text-1);
  font-weight: 600;
}

.fetch-banner__arrow {
  flex-shrink: 0;
  width: 1.15em;
  height: 1.15em;
  color: var(--vp-c-brand-1);
  transition: transform 0.2s;
}

.fetch-banner:hover .fetch-banner__arrow {
  transform: translateX(3px);
}

@media (min-width: 960px) {
  .fetch-banner {
    font-size: 13px;
  }

  .fetch-banner__text {
    white-space: nowrap;
  }
}

@media (max-width: 639px) {
  .fetch-banner {
    border-radius: 14px;
    font-size: 13px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fetch-banner,
  .fetch-banner__arrow {
    transition: none;
  }
}
</style>
