import Fastify from 'fastify'
import { desc, eq, like, or } from 'drizzle-orm'
import { db } from './db/index.js'
import { items, stockMovements } from './db/schema.js'

const app = Fastify({
  logger: true,
})

// ตรวจสอบว่า API ทำงานหรือไม่
app.get('/health', async () => {
  return {
    status: 'ok',
    service: 'stockflow-api',
  }
})

// ดูรายการสินค้าทั้งหมด
// ดูรายการสินค้าและค้นหาสินค้า
app.get<{
  Querystring: { q?: string }
}>(
  '/items',
  {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: {
            type: 'string',
            maxLength: 100,
          },
        },
        additionalProperties: false,
      },
    },
  },
  async (request) => {
    const q = request.query.q?.trim()

    const allItems = q
      ? db
          .select()
          .from(items)
          .where(
            or(
              like(items.name, `%${q}%`),
              like(items.sku, `%${q}%`),
            ),
          )
          .orderBy(desc(items.id))
          .all()
      : db
          .select()
          .from(items)
          .orderBy(desc(items.id))
          .all()

    return {
      count: allItems.length,
      data: allItems,
    }
  },
)

// รูปแบบข้อมูลที่ API อนุญาตให้รับ
type CreateItemBody = {
  name: string
  sku: string
  unit: string
  quantity?: number
}

// เพิ่มสินค้าใหม่
app.post<{ Body: CreateItemBody }>(
  '/items',
  {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'sku', 'unit'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1 },
          sku: { type: 'string', minLength: 1 },
          unit: { type: 'string', minLength: 1 },
          quantity: { type: 'integer', minimum: 0 },
        },
      },
    },
  },
  async (request, reply) => {
    const name = request.body.name.trim()
    const sku = request.body.sku.trim()
    const unit = request.body.unit.trim()
    const quantity = request.body.quantity ?? 0

    // ป้องกันชื่อ รหัสสินค้า หรือหน่วยที่เป็นช่องว่างล้วน
    if (!name || !sku || !unit) {
      return reply.code(400).send({
        message: 'Name, SKU and unit must not be empty.',
      })
    }

    // ตรวจสอบว่ารหัสสินค้าซ้ำหรือไม่
    const existingItem = db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.sku, sku))
      .get()

    if (existingItem) {
      return reply.code(409).send({
        message: 'SKU already exists.',
      })
    }

    try {
      db.insert(items)
        .values({
          name,
          sku,
          unit,
          quantity,
        })
        .run()

      const createdItem = db
        .select()
        .from(items)
        .where(eq(items.sku, sku))
        .get()

      return reply.code(201).send({
        message: 'Item created successfully.',
        data: createdItem,
      })
    } catch (error) {
      app.log.error(error)

      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed')
      ) {
        return reply.code(409).send({
          message: 'SKU already exists.',
        })
      }

      return reply.code(500).send({
        message: 'Failed to create item.',
      })
    }
  },
)


type UpdateItemBody = {
  name?: string
  sku?: string
  unit?: string
}

app.patch<{
  Params: { id: string }
  Body: UpdateItemBody
}>(
  '/items/:id',
  {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1 },
          sku: { type: 'string', minLength: 1 },
          unit: { type: 'string', minLength: 1 },
        },
      },
    },
  },
  async (request, reply) => {
    const id = Number(request.params.id)

    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({
        message: 'Invalid item ID.',
      })
    }

    const existingItem = db
      .select()
      .from(items)
      .where(eq(items.id, id))
      .get()

    if (!existingItem) {
      return reply.code(404).send({
        message: 'Item not found.',
      })
    }

    const changes: {
      name?: string
      sku?: string
      unit?: string
    } = {}

    if (request.body.name !== undefined) {
      const name = request.body.name.trim()

      if (!name) {
        return reply.code(400).send({
          message: 'Name must not be empty.',
        })
      }

      changes.name = name
    }

    if (request.body.sku !== undefined) {
      const sku = request.body.sku.trim()

      if (!sku) {
        return reply.code(400).send({
          message: 'SKU must not be empty.',
        })
      }

      const duplicate = db
        .select({ id: items.id })
        .from(items)
        .where(eq(items.sku, sku))
        .get()

      if (duplicate && duplicate.id !== id) {
        return reply.code(409).send({
          message: 'SKU already exists.',
        })
      }

      changes.sku = sku
    }

    if (request.body.unit !== undefined) {
      const unit = request.body.unit.trim()

      if (!unit) {
        return reply.code(400).send({
          message: 'Unit must not be empty.',
        })
      }

      changes.unit = unit
    }

    if (Object.keys(changes).length === 0) {
      return reply.code(400).send({
        message: 'Provide at least one field to update.',
      })
    }

    try {
      db.update(items)
        .set(changes)
        .where(eq(items.id, id))
        .run()

      const updatedItem = db
        .select()
        .from(items)
        .where(eq(items.id, id))
        .get()

      return reply.code(200).send({
        message: 'Item updated successfully.',
        data: updatedItem,
      })
    } catch (error) {
      request.log.error(error)

      return reply.code(500).send({
        message: 'Failed to update item.',
      })
    }
  },
)

type CreateMovementBody = {
  movementType: 'IN' | 'OUT'
  quantity: number
  reason?: string
}

app.post<{
  Params: { id: string }
  Body: CreateMovementBody
}>(
  '/items/:id/movements',
  {
    schema: {
      body: {
        type: 'object',
        required: ['movementType', 'quantity'],
        additionalProperties: false,
        properties: {
          movementType: {
            type: 'string',
            enum: ['IN', 'OUT'],
          },
          quantity: {
            type: 'integer',
            minimum: 1,
          },
          reason: {
            type: 'string',
            maxLength: 200,
          },
        },
      },
    },
  },
  async (request, reply) => {
    const id = Number(request.params.id)

    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({
        message: 'Invalid item ID.',
      })
    }

    const { movementType, quantity, reason } = request.body

    try {
      const result = db.transaction((tx) => {
        // 1. ตรวจสอบว่าสินค้ามีอยู่จริง
        const item = tx
          .select()
          .from(items)
          .where(eq(items.id, id))
          .get()

        if (!item) {
          return { kind: 'not_found' as const }
        }

        // 2. ตรวจสอบสต็อกก่อนเบิกออก
        if (
          movementType === 'OUT' &&
          item.quantity < quantity
        ) {
          return {
            kind: 'insufficient_stock' as const,
            available: item.quantity,
          }
        }

        // 3. คำนวณจำนวนคงเหลือใหม่
        const change =
          movementType === 'IN' ? quantity : -quantity

        const newQuantity = item.quantity + change

        // 4. ปรับยอดสต็อก
        tx.update(items)
          .set({ quantity: newQuantity })
          .where(eq(items.id, id))
          .run()

        // 5. บันทึกประวัติการเคลื่อนไหว
        tx.insert(stockMovements)
          .values({
            itemId: id,
            movementType,
            quantity,
            reason: reason?.trim() || null,
          })
          .run()

        return {
          kind: 'success' as const,
          item: {
            ...item,
            quantity: newQuantity,
          },
          movement: {
            itemId: id,
            movementType,
            quantity,
            reason: reason?.trim() || null,
          },
        }
      })

      if (result.kind === 'not_found') {
        return reply.code(404).send({
          message: 'Item not found.',
        })
      }

      if (result.kind === 'insufficient_stock') {
        return reply.code(409).send({
          message: 'Insufficient stock.',
          available: result.available,
          requested: quantity,
        })
      }

      return reply.code(201).send({
        message: 'Stock movement recorded successfully.',
        data: result,
      })
    } catch (error) {
      request.log.error(error)

      return reply.code(500).send({
        message: 'Failed to record stock movement.',
      })
    }
  },
)

app.get<{
  Params: { id: string }
}>(
  '/items/:id/movements',
  async (request, reply) => {
    const id = Number(request.params.id)

    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({
        message: 'Invalid item ID.',
      })
    }

    const item = db
      .select({
        id: items.id,
        name: items.name,
        sku: items.sku,
      })
      .from(items)
      .where(eq(items.id, id))
      .get()

    if (!item) {
      return reply.code(404).send({
        message: 'Item not found.',
      })
    }

    const movements = db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.itemId, id))
      .orderBy(desc(stockMovements.id))
      .all()

    return {
      item,
      count: movements.length,
      data: movements,
    }
  },
)

// เริ่มต้นเซิร์ฟเวอร์
const start = async () => {
  try {
    await app.listen({
      port: 8000,
      host: '127.0.0.1',
    })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
  
}

start()