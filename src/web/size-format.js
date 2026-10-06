export const formatDiskSize = (bytes) => {
  if (bytes >= TERABYTE) return `${(bytes / TERABYTE).toFixed(1)}TB`
  return `${(bytes / GIGABYTE).toFixed(bytes < 10 * GIGABYTE ? 1 : 0)}GB`
}

const GIGABYTE = 1e9
const TERABYTE = 1e12
