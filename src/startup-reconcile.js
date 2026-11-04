import { closeInterruptedSyncs, resetInterruptedImports } from './sync.js'

export const reconcileInterruptedSyncs = async () => {
  await resetInterruptedImports()
  return closeInterruptedSyncs()
}
