import { parentPort } from 'node:worker_threads'

import { buildForYou } from './for-you.js'

export const buildForYouFromRequest = ({ guide, vectorsByHash, request }) => {
  const { explanations, ...result } = buildForYou({
    ...request.inputs,
    programmes: guide.programmes,
    channels: guide.channels,
    history: request.inputs.history.map((json) => JSON.parse(json)),
    vectorsByHash,
  })
  return { result, explanationsJson: JSON.stringify([...explanations]) }
}

const held = { guideVersion: null, guide: null, vectorsKey: null, vectorsByHash: null }

const holdShared = (request) => {
  if (request.guide) Object.assign(held, { guideVersion: request.guideVersion, guide: request.guide })
  if (request.vectorsKey !== held.vectorsKey) Object.assign(held, { vectorsKey: request.vectorsKey, vectorsByHash: request.vectorsByHash })
  if (held.guideVersion !== request.guideVersion) throw new Error('worker has a different guide')
}

parentPort?.on('message', ({ id, request }) => {
  try {
    holdShared(request)
    parentPort.postMessage({ id, ...buildForYouFromRequest({ ...held, request }) })
  } catch (err) {
    parentPort.postMessage({ id, error: err.message })
  }
})
