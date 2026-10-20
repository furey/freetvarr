export const PENDING_MIN_MS = 300

export const remainingHoldMs = ({ startedAt, now, minMs = PENDING_MIN_MS }) =>
  Math.max(0, minMs - Math.max(0, now - startedAt))

export const holdAtLeast = async ({ task, minMs = PENDING_MIN_MS, clock = Date.now, wait = waitMs }) => {
  const startedAt = clock()
  try {
    return await task()
  } finally {
    const remaining = remainingHoldMs({ startedAt, now: clock(), minMs })
    if (remaining > 0) await wait(remaining)
  }
}

const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
