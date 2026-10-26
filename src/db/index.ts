import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

export const sqlite = new Database(
  process.env.STOCKFLOW_DB_PATH ?? './stockflow.db',
)

sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite)