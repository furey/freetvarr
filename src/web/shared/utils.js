export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
