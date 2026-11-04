export const claimRun = async ({ getRun, setRun, prepare }) => {
  if (getRun()?.running) return { claimed: false }
  const previous = getRun()
  setRun({ running: true, steps: [], result: null })
  let started = false
  try {
    const prepared = await prepare()
    if (prepared.refusal) return { claimed: true, refusal: prepared.refusal }
    setRun({ running: true, steps: prepared.steps, result: null })
    started = true
    return { claimed: true, ...prepared }
  } catch (err) {
    return { claimed: true, refusal: { status: 500, body: { ok: false, error: err.message } } }
  } finally {
    if (!started) setRun(previous)
  }
}
