# Future-Proof Architecture: Database-Heavy Node.js Services

## Core Principles

### 1. **Query Separation by Complexity**

The foundation of scalable database design is knowing when to split queries.

```javascript
// ❌ WRONG: One query, multiple concerns
async function getOrderWithEverything(orderId) {
  return await db.query(`
    SELECT o.*, 
      (SELECT ... items ...) as items,
      (SELECT ... history ...) as history,
      (SELECT ... analytics ...) as analytics
    FROM orders o
    WHERE order_id = $1
  `, [orderId]);
}

// ✅ RIGHT: Separate by responsibility
async function getOrderBasics(orderId) {
  // Simple query, fast
  return await db.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
}

async function getOrderItems(orderId) {
  // Medium complexity, medium speed
  return await db.query(`
    SELECT oi.*, p.name FROM order_items oi
    JOIN products p ON oi.product_id = p.product_id
    WHERE oi.order_id = $1
  `, [orderId]);
}

async function getAnalytics(orderId) {
  // Heavy aggregation, cached separately
  // Only called if needed
  return await db.query(`
    SELECT ... expensive aggregation ...
    FROM ... multiple joins ...
    WHERE order_id = $1
  `, [orderId]);
}

// Compose as needed
async function getOrderPage(orderId) {
  const [order, items] = await Promise.all([
    getOrderBasics(orderId),
    getOrderItems(orderId)
  ]);
  return { order, items };
}

// Analytics only fetched if explicitly needed
async function getOrderDashboard(orderId) {
  const [order, items, analytics] = await Promise.all([
    getOrderBasics(orderId),
    getOrderItems(orderId),
    getAnalytics(orderId)
  ]);
  return { order, items, analytics };
}
```

---

### 2. **Implement Query Builders (Type-Safe + Auditable)**

```javascript
// Using a query builder (e.g., Knex.js or Prisma)
// Prevents mistakes and makes queries auditable

// ❌ String concatenation (SQL injection risk!)
const query = `SELECT * FROM orders WHERE customer_id = ${customerId}`;

// ✅ Query builder (parameterized + readable)
const query = db('orders')
  .select(['order_id', 'order_date', 'total_amount'])
  .where('customer_id', '=', customerId)
  .whereBetween('order_date', [startDate, endDate])
  .orderBy('order_date', 'desc');

// Query builders also make optimization easier:
query.explain('analyze') // Get EXPLAIN output
query.debug() // Log generated SQL

// Easy to add/remove conditions
if (status) query.where('status', '=', status);
if (minAmount) query.where('total_amount', '>=', minAmount);
```

---

### 3. **Caching Strategy (Multi-Layer)**

```javascript
const redis = require('redis');
const client = redis.createClient();

class OrderService {
  // Layer 1: In-memory cache (< 100ms)
  #memCache = new Map();

  // Layer 2: Redis cache (1-10ms)
  async getOrder(orderId) {
    const cacheKey = `order:${orderId}`;
    
    // Check in-memory first
    if (this.#memCache.has(cacheKey)) {
      return this.#memCache.get(cacheKey);
    }
    
    // Check Redis
    const cached = await client.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      this.#memCache.set(cacheKey, parsed); // Keep in memory
      return parsed;
    }
    
    // Query database (Layer 3)
    const order = await db.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
    
    // Cache for 5 minutes
    await client.setex(cacheKey, 300, JSON.stringify(order));
    this.#memCache.set(cacheKey, order);
    
    return order;
  }

  // Invalidate cache when order changes
  async updateOrder(orderId, data) {
    await db.query('UPDATE orders SET ... WHERE order_id = $1', [orderId, ...data]);
    
    // Clear from all cache layers
    this.#memCache.delete(`order:${orderId}`);
    await client.del(`order:${orderId}`);
  }
}
```

**Cache Invalidation Strategy:**
```javascript
// Problem: Distributed cache invalidation is hard
// Solution: TTL-based (simpler) + Event-based (more accurate)

class CacheManager {
  async invalidatePattern(pattern) {
    // Invalidate all keys matching pattern
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }

  // Use event bus for updates
  onOrderUpdated(event) {
    this.invalidatePattern(`order:${event.orderId}:*`);
  }

  // Or publish to message queue
  async publishEvent(eventType, data) {
    await messageQueue.publish('orders-events', {
      type: eventType,
      data: data,
      timestamp: Date.now()
    });
  }
}

// Message handler clears cache
messageQueue.subscribe('orders-events', async (event) => {
  if (event.type === 'ORDER_UPDATED') {
    await cacheManager.invalidatePattern(`order:${event.data.orderId}:*`);
  }
});
```

---

### 4. **Connection Pooling & Resource Management**

```javascript
const { Pool } = require('pg');

// Proper pool configuration
const pool = new Pool({
  // Connection limits
  max: 20,                    // Max connections
  min: 5,                     // Min (keep warm)
  maxUses: 7500,              // Recycle connection after N uses
  
  // Timeouts
  idleTimeoutMillis: 30000,   // Close idle after 30s
  connectionTimeoutMillis: 2000, // Fail if can't get connection in 2s
  
  // Query timeout
  statement_timeout: 30000,   // Kill query after 30s
  
  // Connection string from environment
  connectionString: process.env.DATABASE_URL
});

// Monitor pool health
pool.on('error', (err) => {
  console.error('Pool error:', err);
  // Alert monitoring system
});

pool.on('connect', () => {
  console.log('New connection established');
});

// Graceful shutdown
async function shutdown() {
  console.log('Closing database pool...');
  await pool.end();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Check pool status
setInterval(async () => {
  console.log(`Pool: ${pool.totalCount} total, ${pool.idleCount} idle, ${pool.waitingCount} waiting`);
}, 60000);
```

---

### 5. **Indexing Strategy (Build for Performance)**

```javascript
// Think about indexes during schema design

// Bad: Reactive indexing (add after performance issues)
// Good: Proactive indexing

// Schema with indexing plan
const migrations = {
  'create-orders-table': {
    up: async (db) => {
      await db.query(`
        CREATE TABLE orders (
          order_id SERIAL PRIMARY KEY,
          
          -- Frequently filtered
          customer_id INTEGER NOT NULL REFERENCES customers(id),
          order_date TIMESTAMP NOT NULL,
          status VARCHAR(20),
          
          -- Infrequently filtered
          total_amount DECIMAL(10,2),
          notes TEXT
        );
        
        -- Index strategy:
        -- 1. Foreign keys (for JOINs)
        CREATE INDEX idx_orders_customer_id ON orders(customer_id);
        
        -- 2. Frequently filtered columns
        CREATE INDEX idx_orders_status ON orders(status);
        
        -- 3. Date range queries
        CREATE INDEX idx_orders_date ON orders(order_date DESC);
        
        -- 4. Composite indexes for common filters
        CREATE INDEX idx_orders_customer_date 
          ON orders(customer_id, order_date DESC);
        
        -- 5. Partial indexes for specific subsets
        CREATE INDEX idx_orders_pending 
          ON orders(customer_id) 
          WHERE status = 'PENDING';
      `);
    }
  }
};

// Monitor index effectiveness
async function checkIndexUsage() {
  const result = await db.query(`
    SELECT 
      schemaname,
      tablename,
      indexname,
      idx_scan as scans,
      idx_tup_read as tuples_read,
      idx_tup_fetch as tuples_fetched
    FROM pg_stat_user_indexes
    WHERE idx_scan = 0 AND indexname NOT LIKE '%_pkey'
    ORDER BY tablename, indexname;
  `);
  
  console.log('Unused indexes (candidates for deletion):', result.rows);
}
```

---

### 6. **Query Performance Monitoring**

```javascript
const assert = require('assert');

class QueryMonitor {
  #slowQueryThreshold = 1000; // ms
  
  async monitoredQuery(sql, params, name) {
    const startTime = Date.now();
    
    try {
      const result = await pool.query(sql, params);
      const duration = Date.now() - startTime;
      
      // Log slow queries
      if (duration > this.#slowQueryThreshold) {
        console.warn(`SLOW QUERY (${duration}ms): ${name}`, {
          sql: sql.substring(0, 100),
          duration,
          rowsReturned: result.rows.length
        });
        
        // Alert monitoring system
        await monitoringService.logSlowQuery({
          name, sql, duration, timestamp: new Date()
        });
      }
      
      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error(`QUERY ERROR (${duration}ms): ${name}`, {
        error: err.message,
        sql: sql.substring(0, 100)
      });
      throw err;
    }
  }
}

// Usage
const monitor = new QueryMonitor();
const result = await monitor.monitoredQuery(
  'SELECT * FROM orders WHERE customer_id = $1',
  [123],
  'fetchCustomerOrders'
);
```

---

### 7. **Data Normalization & Schema Design**

```javascript
// Bad: Denormalized from the start (can't scale)
// Problem: Updates require updating multiple places
await db.query(`
  UPDATE orders SET customer_email = $1
  WHERE customer_id = $2
`); // Also need to update in order_history table!

// Good: Normalized schema
// customers table - single source of truth
CREATE TABLE customers (
  customer_id SERIAL PRIMARY KEY,
  email VARCHAR(100),
  ...
);

// orders table - foreign key, not duplicate data
CREATE TABLE orders (
  order_id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  ...
);

// JOIN when needed (database optimizes automatically)
SELECT o.*, c.email
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id;

// But allow denormalization for read performance when needed
// Add customer_email to orders ONLY if:
// 1. It's accessed frequently in read queries
// 2. Updates are infrequent
// 3. Keep it in sync with events/triggers
```

---

### 8. **Error Handling & Retries**

```javascript
async function executeWithRetry(fn, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      
      // Don't retry certain errors
      if (err.code === 'UNIQUE_VIOLATION' || err.code === 'FOREIGN_KEY_VIOLATION') {
        throw err;
      }
      
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms:`, err.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Usage
const result = await executeWithRetry(
  () => pool.query('SELECT * FROM orders WHERE order_id = $1', [123]),
  3
);
```

---

### 9. **Multi-Database Patterns**

```javascript
// Read replicas for scaling reads
const writePool = new Pool(process.env.MAIN_DB_URL);
const readPools = [
  new Pool(process.env.REPLICA_1_URL),
  new Pool(process.env.REPLICA_2_URL),
  new Pool(process.env.REPLICA_3_URL),
];

class DatabaseService {
  #readIndex = 0;
  
  async executeRead(sql, params) {
    // Round-robin read replicas
    const pool = readPools[this.#readIndex++ % readPools.length];
    return await pool.query(sql, params);
  }
  
  async executeWrite(sql, params) {
    // Always write to main
    return await writePool.query(sql, params);
  }
}

// Usage
const db = new DatabaseService();
const orders = await db.executeRead('SELECT * FROM orders LIMIT 10');
await db.executeWrite('INSERT INTO orders (customer_id, total_amount) VALUES ($1, $2)', [123, 99.99]);
```

---

### 10. **Testing Database Queries**

```javascript
// Integration tests with real database (Docker recommended)
describe('Order Queries', () => {
  let db;
  
  beforeAll(async () => {
    // Use test database
    db = new Pool({ connectionString: 'postgresql://test_user@localhost/test_db' });
    await setupTestData(db);
  });
  
  afterAll(async () => {
    await db.end();
  });
  
  it('should fetch orders with items', async () => {
    const orders = await getCustomerOrderDetails(1, '2023-01-01', '2023-12-31');
    
    expect(orders).toHaveLength(3);
    expect(orders[0]).toHaveProperty('items');
    expect(orders[0].items).toHaveLength(2);
  });
  
  it('should use index for customer_id filter', async () => {
    const { rows } = await db.query(`
      EXPLAIN ANALYZE
      SELECT * FROM orders WHERE customer_id = $1
    `, [1]);
    
    // Verify index is being used
    expect(rows[0]['QUERY PLAN']).toContain('Index Scan');
  });
  
  it('should complete in < 500ms', async () => {
    const start = Date.now();
    await getCustomerOrderDetails(1, '2023-01-01', '2023-12-31');
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(500);
  });
});
```

---

## Checklist for Production Readiness

- [ ] **Indexes**: All frequently filtered columns indexed
- [ ] **Connection pooling**: Configured with appropriate limits
- [ ] **Query timeouts**: Set to prevent runaway queries
- [ ] **Monitoring**: Slow queries logged and tracked
- [ ] **Caching**: Multi-layer caching strategy implemented
- [ ] **Error handling**: Proper retry logic for transient failures
- [ ] **Testing**: Integration tests verify performance
- [ ] **Graceful shutdown**: Connection cleanup on process exit
- [ ] **Documentation**: Schema decisions and index rationale documented
- [ ] **Backup strategy**: Regular backups and recovery tested
- [ ] **Query separation**: Complex queries split appropriately
- [ ] **Read replicas**: Consider for read-heavy workloads (>1000 req/s)

---

## Recommended Tech Stack

| Component | Tool | Why |
|-----------|------|-----|
| Connection Pool | `pg` (built-in) or `pgBouncer` | Efficient connection reuse |
| Query Builder | Prisma / Knex.js | Type safety + auditability |
| Caching | Redis | Sub-millisecond access |
| ORM | Prisma / TypeORM | Query simplification |
| Monitoring | DataDog / New Relic | Performance visibility |
| Testing | Jest + Docker | Realistic integration tests |
| Migrations | Knex / Prisma | Version control for schema |

---

## Summary: Performance Hierarchy

**By Optimization Level (fastest → slowest):**

1. ⚡ In-memory cache (~0.1ms)
2. 🔥 Redis cache (~5ms)
3. 🟢 Indexed database query (~50-200ms)
4. 🟡 Unindexed database query (~500ms-2s)
5. 🔴 Correlated subqueries (~5-10s)
6. ❌ N+1 queries (scales with data)

**Apply in this order:**
1. Add indexes (biggest impact)
2. Use JOINs instead of subqueries
3. Implement caching
4. Scale with read replicas
5. Consider sharding (if needed)
