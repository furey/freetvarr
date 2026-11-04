export const runLibraryChange = async (task) => {
  changes += 1
  try {
    return await task()
  } finally {
    changes -= 1
    if (changes === 0) releaseWaiters()
  }
}

export const isLibraryChanging = () => changes > 0

export const libraryChangesSettled = ({ timeoutMs = Infinity } = {}) => {
  if (changes === 0) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = Number.isFinite(timeoutMs) ? setTimeout(() => resolve(false), Math.max(0, timeoutMs)) : null
    waiters.push(() => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

const releaseWaiters = () => {
  const ready = waiters
  waiters = []
  ready.forEach((resolve) => resolve())
}

let changes = 0
let waiters = []
