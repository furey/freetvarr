export const createRowScrollMemory = () => {
  const positions = new Map()
  const remember = ({ key, left }) => positions.set(key, Math.max(0, Math.round(left)))
  const recall = (key) => positions.get(key) ?? 0
  const forget = () => positions.clear()
  return { remember, recall, forget }
}
