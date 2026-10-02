<script setup>
import { withBase } from 'vitepress'
</script>

<template>
  <a class="fetch-banner" :href="withBase('/guide/leaving-fetch')">
    <span class="fetch-banner__chips" aria-hidden="true">
      <span class="fetch-banner__chip fetch-banner__chip--blue"></span>
      <span class="fetch-banner__chip fetch-banner__chip--orange"></span>
      <span class="fetch-banner__chip fetch-banner__chip--yellow"></span>
    </span>
    <span class="fetch-banner__text">
      <strong>Leaving Fetch TV?</strong>
      A step-by-step guide to owning your setup before the levy
    </span>
    <span class="fetch-banner__arrow" aria-hidden="true">→</span>
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

.fetch-banner__chips {
  display: inline-flex;
  flex-shrink: 0;
  gap: 3px;
}

.fetch-banner__chip {
  width: 8px;
  height: 6px;
}

.fetch-banner__chip--blue {
  background: #1eb6ff;
}

.fetch-banner__chip--orange {
  background: #ff8a00;
}

.fetch-banner__chip--yellow {
  background: #e2b03c;
}

.fetch-banner__text {
  color: var(--vp-c-text-2);
  text-align: left;
  text-wrap: pretty;
}

.fetch-banner__text strong {
  color: var(--vp-c-text-1);
  font-weight: 600;
}

.fetch-banner__arrow {
  flex-shrink: 0;
  color: var(--vp-c-brand-1);
  font-weight: 600;
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
