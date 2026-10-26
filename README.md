[![StockFlow CI](https://github.com/Panatda-Madsayamad/stockflow/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Panatda-Madsayamad/stockflow/actions/workflows/ci.yml)

# StockFlow

A lightweight inventory management REST API built with TypeScript, Fastify, SQLite, and Drizzle ORM.

## Features

- Create and list inventory items
- Update item details
- Search items by name or SKU
- Receive and issue stock
- Track inventory movement history
- Validate incoming request data
- Reject stock issues when inventory is insufficient
- Use database transactions to update stock and record movements

## Tech Stack

- Node.js
- TypeScript
- Fastify
- SQLite
- Drizzle ORM
- better-sqlite3
- Git and GitHub

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Initialize the database

```bash
npm run db:push
```

Run this command when setting up a fresh local database.

### 3. Start the development server

```bash
npm run dev
```

The API runs locally at `http://127.0.0.1:8000`.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Check API health |
| GET | `/items` | List all items |
| GET | `/items?q=rice` | Search by name or SKU |
| POST | `/items` | Create an item |
| PATCH | `/items/:id` | Update item details |
| POST | `/items/:id/movements` | Receive or issue stock |
| GET | `/items/:id/movements` | View stock movement history |

## Example: Create an Item

`POST /items`

```json
{
  "name": "Rice",
  "sku": "RICE-001",
  "unit": "kg",
  "quantity": 20
}
```

## Example: Receive Stock

`POST /items/1/movements`

```json
{
  "movementType": "IN",
  "quantity": 10,
  "reason": "Restock"
}
```

## Example: Issue Stock

`POST /items/1/movements`

```json
{
  "movementType": "OUT",
  "quantity": 5,
  "reason": "Stock issue"
}
```

The API rejects stock issue requests when the available quantity is insufficient.

## Testing

Run the automated API workflow tests with:

```bash
npm test
```

The test suite verifies:

- API health check
- Item creation and duplicate SKU validation
- Item search and update
- Stock receiving and issuing
- Rejection of stock issues when inventory is insufficient
- Inventory quantity and movement history consistency

Tests run against a separate temporary SQLite database to avoid modifying the development database.

## Current Test Status

- Automated inventory API workflow test: Passing
- Test command: `npm test`
## Project Status

The core inventory API has been implemented. Automated tests, Docker support, CI/CD, and additional improvements are planned.

## Future Improvements

- Automated tests
- Docker support
- CI/CD with GitHub Actions
- Authentication and authorization
- Inventory reports