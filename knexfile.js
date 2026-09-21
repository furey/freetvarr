import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const dbPath = process.env.DB_PATH || path.join(__dirname, 'config', 'state.db')

export default {
  client: 'better-sqlite3',
  connection: { filename: dbPath },
  useNullAsDefault: true,
  migrations: {
    directory: path.join(__dirname, 'migrations'),
  },
}
