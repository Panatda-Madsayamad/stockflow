import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { rmSync } from 'node:fs'

const testDbPath = './stockflow-test.db'

const testDbFiles = [
  testDbPath,
  `${testDbPath}-shm`,
  `${testDbPath}-wal`,
]

// ลบเฉพาะฐานข้อมูลสำหรับทดสอบครั้งก่อน
for (const file of testDbFiles) {
  rmSync(file, { force: true })
}

// กำหนดฐานข้อมูลก่อน import แอป
process.env.NODE_ENV = 'test'
process.env.STOCKFLOW_DB_PATH = testDbPath

// สร้างตารางว่างสำหรับการทดสอบ
const setupDb = new Database(testDbPath)

setupDb.pragma('foreign_keys = ON')

setupDb.exec(`
  CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id),
    movement_type TEXT NOT NULL
      CHECK (movement_type IN ('IN', 'OUT')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

setupDb.close()

// Import หลังจากเลือกฐานข้อมูลทดสอบแล้วเท่านั้น
const { app } = await import('./server.js')
const { sqlite } = await import('./db/index.js')

// ปิดการเชื่อมต่อและลบไฟล์ทดสอบเมื่อจบ
after(async () => {
  await app.close()
  sqlite.close()

  for (const file of testDbFiles) {
    rmSync(file, { force: true })
  }
})

test('StockFlow inventory API workflow', async () => {
  // 1. ตรวจสุขภาพ API
  const health = await app.inject({
    method: 'GET',
    url: '/health',
  })

  assert.equal(health.statusCode, 200)
  assert.equal(health.json().status, 'ok')

  // 2. เพิ่มสินค้าใหม่
  const create = await app.inject({
    method: 'POST',
    url: '/items',
    payload: {
      name: 'Test Rice',
      sku: 'TEST-RICE-001',
      unit: 'kg',
      quantity: 5,
    },
  })

  assert.equal(create.statusCode, 201)

  const createdItem = create.json().data
  const itemId = createdItem.id

  assert.equal(createdItem.quantity, 5)
  assert.equal(createdItem.sku, 'TEST-RICE-001')

  // 3. ป้องกัน SKU ซ้ำ
  const duplicate = await app.inject({
    method: 'POST',
    url: '/items',
    payload: {
      name: 'Duplicate Rice',
      sku: 'TEST-RICE-001',
      unit: 'kg',
      quantity: 1,
    },
  })

  assert.equal(duplicate.statusCode, 409)

  // 4. ค้นหาสินค้า
  const search = await app.inject({
    method: 'GET',
    url: '/items?q=TEST-RICE-001',
  })

  assert.equal(search.statusCode, 200)
  assert.equal(search.json().count, 1)

  // 5. แก้ไขชื่อสินค้า
  const update = await app.inject({
    method: 'PATCH',
    url: `/items/${itemId}`,
    payload: {
      name: 'Premium Rice',
    },
  })

  assert.equal(update.statusCode, 200)
  assert.equal(update.json().data.name, 'Premium Rice')

  // 6. รับสินค้าเข้า 10 หน่วย
  const receive = await app.inject({
    method: 'POST',
    url: `/items/${itemId}/movements`,
    payload: {
      movementType: 'IN',
      quantity: 10,
      reason: 'Automated test',
    },
  })

  assert.equal(receive.statusCode, 201)
  assert.equal(receive.json().data.item.quantity, 15)

  // 7. เบิกสินค้าออก 3 หน่วย
  const issue = await app.inject({
    method: 'POST',
    url: `/items/${itemId}/movements`,
    payload: {
      movementType: 'OUT',
      quantity: 3,
      reason: 'Automated test',
    },
  })

  assert.equal(issue.statusCode, 201)
  assert.equal(issue.json().data.item.quantity, 12)

  // 8. ปฏิเสธการเบิกเกินจำนวนคงเหลือ
  const insufficient = await app.inject({
    method: 'POST',
    url: `/items/${itemId}/movements`,
    payload: {
      movementType: 'OUT',
      quantity: 999,
      reason: 'Insufficient stock test',
    },
  })

  assert.equal(insufficient.statusCode, 409)
  assert.equal(insufficient.json().available, 12)
  
// 8.1 ปฏิเสธจำนวนเบิกที่เป็นศูนย์
const zeroQuantity = await app.inject({
  method: 'POST',
  url: `/items/${itemId}/movements`,
  payload: {
    movementType: 'OUT',
    quantity: 0,
    reason: 'Invalid quantity test',
  },
})

assert.equal(zeroQuantity.statusCode, 400)

// 8.2 ปฏิเสธ ID สินค้าที่ไม่มีอยู่จริง
const missingItem = await app.inject({
  method: 'POST',
  url: '/items/999999/movements',
  payload: {
    movementType: 'IN',
    quantity: 1,
    reason: 'Missing item test',
  },
})

assert.equal(missingItem.statusCode, 404)

// 8.3 ปฏิเสธการแก้ไขสินค้าที่ไม่มีอยู่จริง
const missingUpdate = await app.inject({
  method: 'PATCH',
  url: '/items/999999',
  payload: {
    name: 'Missing item',
  },
})

assert.equal(missingUpdate.statusCode, 404)

  // 9. ตรวจสอบประวัติว่าไม่มีรายการที่ถูกปฏิเสธ
  const history = await app.inject({
    method: 'GET',
    url: `/items/${itemId}/movements`,
  })

  assert.equal(history.statusCode, 200)
  assert.equal(history.json().count, 2)

  assert.deepEqual(
    history.json().data.map(
      (movement: { movementType: string }) =>
        movement.movementType,
    ),
    ['OUT', 'IN'],
  )

  // 10. ตรวจยอดสุดท้าย
  const finalItems = await app.inject({
    method: 'GET',
    url: '/items',
  })

  const finalItem = finalItems.json().data.find(
    (item: { id: number }) => item.id === itemId,
  )

  assert.equal(finalItem.quantity, 12)
})