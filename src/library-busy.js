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

export const libraryChangesSettled = () => (changes === 0
  ? Promise.resolve()
  : new Promise((resolve) => waiters.push(resolve)))

const releaseWaiters = () => {
  const ready = waiters
  waiters = []
  ready.forEach((resolve) => resolve())
}

let changes = 0
let waiters = []
