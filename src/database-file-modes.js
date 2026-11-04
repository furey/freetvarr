import fs from 'node:fs/promises'

export const restrictDatabaseFiles = async ({ dbPath }) => {
  const files = DATABASE_SUFFIXES.map((suffix) => `${dbPath}${suffix}`)
  const results = await Promise.all(files.map(ownerOnly))
  return files.filter((file, at) => results[at])
}

const ownerOnly = async (file) => {
  try {
    await fs.chmod(file, OWNER_READ_WRITE)
    return true
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
}

const DATABASE_SUFFIXES = ['', '-wal', '-shm']
const OWNER_READ_WRITE = 0o600
