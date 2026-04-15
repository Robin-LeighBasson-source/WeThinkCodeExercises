# Performance Analysis & Optimization Guide

## Problem Summary
Your query is running in **8-10 seconds** due to **correlated subqueries** that execute for every row, combined with missing indexes. This is a classic N+1 query problem.

---

## 1. Why Your Query Is Slow

### Root Cause: Correlated Subqueries
Your query contains **two correlated subqueries**:

```sql
-- Subquery 1: Runs once PER ORDER to fetch items
(SELECT json_agg(...)
 FROM order_items oi
 JOIN products p ON oi.product_id = p.product_id
 WHERE oi.order_id = o.order_id) as items,

-- Subquery 2: Runs once PER ORDER to fetch status history
(SELECT json_agg(...)
 FROM order_status_history s
 WHERE s.order_id = o.order_id) as status_history
```

### Execution Flow (The Problem)
For a customer with **100 orders**:
1. Main query finds 100 orders → **1 database scan**
2. Subquery 1 executes for each order → **100 scans of `order_items`**
3. Subquery 2 executes for each order → **100 scans of `order_status_history`**
4. **Total scans = 200+ additional queries** (hidden, but expensive)

### Performance Impact
- Each `WHERE oi.order_id = o.order_id` requires a **full table scan** without proper indexes
- 500k order items across 100 orders = scanning through thousands of rows per order
- 300k status records across 100 orders = same problem repeated
- **Result: 8-10 second query time**

---

## 2. The N+1 Problem Explained

```
What happens:           What should happen:
1. Query orders         1. Single query with JOINs
2. For each order:      2. All data retrieved at once
   - Fetch items        3. Aggregate in application
   - Fetch history      
3. Combine results      
```

---

## 3. Optimization Strategy

### Optimization 1: Add Strategic Indexes
**Missing index is the biggest problem!**

```sql
-- CRITICAL: Add these immediately
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_status_history_order_id ON order_status_history(order_id);

-- Already exists, but verify:
CREATE INDEX idx_orders_customer_date ON orders(customer_id, order_date);
```

**Why?** These indexes allow PostgreSQL to quickly find related records without scanning the entire table.

---

### Optimization 2: Replace Correlated Subqueries with JOINs + LEFT JOINs

**Current approach (SLOW):**
```sql
SELECT ... 
FROM orders o
LEFT JOIN customers c ...
-- Then 2 correlated subqueries (execute per row)
```

**Optimized approach (FAST):**
```sql
SELECT
  o.order_id,
  o.order_date,
  o.total_amount,
  o.status,
  c.customer_name,
  c.email,
  json_agg(DISTINCT 
    json_build_object(
      'product_id', p.product_id,
      'product_name', p.name,
      'quantity', oi.quantity,
      'unit_price', p.price,
      'subtotal', oi.quantity * p.price
    )
  ) FILTER (WHERE p.product_id IS NOT NULL) as items,
  a.street,
  a.city,
  a.state,
  a.postal_code,
  a.country
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
LEFT JOIN addresses a ON o.shipping_address_id = a.address_id
LEFT JOIN order_items oi ON o.order_id = oi.order_id
LEFT JOIN products p ON oi.product_id = p.product_id
WHERE o.customer_id = $1
  AND o.order_date BETWEEN $2 AND $3
GROUP BY o.order_id, o.order_date, o.total_amount, o.status, 
         c.customer_name, c.email,
         a.street, a.city, a.state, a.postal_code, a.country
ORDER BY o.order_date DESC
```

**Why this is faster:**
- ✅ Single scan of order_items (not 100+ scans)
- ✅ Uses indexes on order_id
- ✅ `GROUP BY` aggregates data in single pass
- ✅ PostgreSQL optimizer can create better execution plans

---

### Optimization 3: Separate Queries for Complex Aggregations

**For status history** (which requires its own ordering):

Instead of including status history in the same query, fetch it separately:

```javascript
// Fetch orders
const ordersResult = await pool.query(`
  SELECT o.order_id, o.order_date, ...
  FROM orders o
  JOIN customers c ON ...
  LEFT JOIN addresses a ON ...
  LEFT JOIN order_items oi ON ...
  LEFT JOIN products p ON ...
  WHERE o.customer_id = $1
  GROUP BY o.order_id, ...
`, [customerId, startDate, endDate]);

// Fetch status history (one query, not per-order)
const orderIds = ordersResult.rows.map(o => o.order_id);
const statusResult = await pool.query(`
  SELECT 
    order_id,
    json_agg(
      json_build_object('status', status, 'date', status_date, 'notes', notes)
      ORDER BY status_date DESC
    ) as status_history
  FROM order_status_history
  WHERE order_id = ANY($1)
  GROUP BY order_id
`, [orderIds]);

// Map status history to orders in Node.js (O(n) time complexity)
const statusMap = new Map(statusResult.rows.map(r => [r.order_id, r.status_history]));
const orders = ordersResult.rows.map(o => ({
  ...o,
  status_history: statusMap.get(o.order_id) || []
}));
```

**Why?** 
- ✅ One query instead of 100+ per-order queries
- ✅ Uses `ANY()` with array instead of correlated subquery
- ✅ Aggregation happens server-side efficiently
- ✅ Application-level mapping is negligible cost

---

## 4. Understanding EXPLAIN ANALYZE

### How to Profile Your Query

```bash
# Connect to database
psql -U app_user -d ecommerce -h localhost

# Run EXPLAIN ANALYZE to see actual execution plan
EXPLAIN ANALYZE
SELECT ... (your query here) ...;
```

### Reading the Output

```
Seq Scan on order_items oi  (cost=0.00..50000.00 rows=5000)
  Filter: (order_id = 1)
  Planning time: 0.1 ms
  Execution time: 234.5 ms
```

**Key Metrics:**
- **Seq Scan**: Sequential scan (full table scan) - BAD without index
- **Index Scan**: Uses an index - GOOD
- **cost=0.00..50000.00**: Estimated total cost (higher = slower)
- **rows=5000**: Estimated rows returned
- **Execution time**: Actual time taken (in ms)

### What to Look For

```
❌ BAD: Seq Scan on order_items (not using index, scanning full table)
✅ GOOD: Index Scan on idx_order_items_order_id (using our new index)

❌ BAD: Planning time: 15000 ms (query taking too long to plan)
✅ GOOD: Execution time: 10 ms (fast execution)
```

---

## 5. Expected Performance Improvements

| Optimization | Baseline | Impact |
|---|---|---|
| **Before** (Current) | 8-10 seconds | - |
| **After Index Only** | 2-3 seconds | 60-75% faster |
| **After JOINs + Index** | 200-400ms | **95% faster** |
| **After Separation + Index** | 100-200ms | **98% faster** |

---

## 6. Future-Proof Strategy for Database-Heavy Node.js Services

### Architecture Principles

#### 1. **Query Separation by Complexity**
```javascript
// Simple queries: Single call
const orders = await fetchOrders(customerId);

// Complex aggregations: Batch queries
const items = await fetchOrderItems(orderIds);
const history = await fetchStatusHistory(orderIds);

// Combine in application
return combineResults(orders, items, history);
```

#### 2. **Implement Query Builders**
```javascript
// Use query builders to prevent mistakes
const query = await db
  .select()
  .from('orders')
  .where('customer_id', '=', customerId)
  .leftJoin('order_items', 'orders.order_id', 'order_items.order_id')
  .groupBy('orders.order_id');
```

#### 3. **Add Caching Layer**
```javascript
// Cache expensive queries
const cacheKey = `orders:${customerId}:${startDate}:${endDate}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const result = await fetchOrders(...);
await redis.setex(cacheKey, 300, JSON.stringify(result)); // 5 min cache
return result;
```

#### 4. **Use Connection Pooling**
```javascript
// Your current setup is correct
const pool = new Pool({
  max: 20,           // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

#### 5. **Always Use Indexes**
```javascript
// In migrations: Index frequently filtered columns
CREATE INDEX idx_table_filterable_column ON table(filterable_column);

// For JOINs: Index foreign keys
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
```

#### 6. **Monitor Query Performance**
```javascript
// Add query timing to all queries
const startTime = Date.now();
const result = await pool.query(sql, params);
const duration = Date.now() - startTime;

if (duration > 1000) {
  console.warn(`Slow query (${duration}ms):`, sql);
}
```

#### 7. **Design for N+1 Prevention**
```javascript
// ❌ DON'T: N+1 queries
const orders = await fetchOrders(customerId);
for (const order of orders) {
  order.items = await fetchOrderItems(order.id); // Runs per order!
}

// ✅ DO: Batch queries
const orders = await fetchOrders(customerId);
const orderIds = orders.map(o => o.id);
const itemsByOrder = await fetchOrderItemsBatch(orderIds);
orders.forEach(o => {
  o.items = itemsByOrder[o.id];
});
```

---

## Implementation Priority

1. **IMMEDIATE (5 minutes)**: Add missing indexes
2. **HIGH (30 minutes)**: Convert to JOIN + GROUP BY query
3. **MEDIUM (1 hour)**: Extract status history to separate query
4. **ONGOING**: Implement caching and monitoring

---

## Files to Update

1. `init-db.js` - Add indexes
2. `orders-service.js` - Use optimized query
3. `test-query.js` - Add performance tracking

See the `orders-service-optimized.js` for complete implementation.
