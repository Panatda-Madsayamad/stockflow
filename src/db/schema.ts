import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  integer,
  text,
} from 'drizzle-orm/sqlite-core'

export const items = sqliteTable('items', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  name: text('name').notNull(),

  sku: text('sku').notNull().unique(),

  unit: text('unit').notNull(),

  quantity: integer('quantity').notNull().default(0),

  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
})

export const stockMovements = sqliteTable('stock_movements', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  itemId: integer('item_id')
    .notNull()
    .references(() => items.id),

  movementType: text('movement_type', {
    enum: ['IN', 'OUT'],
  }).notNull(),

  quantity: integer('quantity').notNull(),

  reason: text('reason'),

  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
})