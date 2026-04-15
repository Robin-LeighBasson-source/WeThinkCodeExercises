# EXPLAIN ANALYZE Guide - Profiling Your PostgreSQL Queries

## What is EXPLAIN ANALYZE?

EXPLAIN ANALYZE is PostgreSQL's built-in tool for understanding and debugging query performance. It shows:
- How PostgreSQL *plans* to execute your query
- How PostgreSQL *actually* executed it
- Where the bottlenecks are
- What indexes are being used (or not used)

## Quick Start

### 1. Connect to Your Database

```bash
# From your terminal
psql -U app_user -d ecommerce -h localhost

# When prompted, enter password: password123
```

### 2. Basic EXPLAIN ANALYZE Usage

```sql
-- Analyze your slow query
EXPLAIN ANALYZE
SELECT
  o.order_id,
  o.order_date,
  o.total_amount,
  c.customer_name,
  json_agg(json_build_object(...))
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
LEFT JOIN order_items oi ON o.order_id = oi.order_id
LEFT JOIN products p ON oi.product_id = p.product_id
WHERE o.customer_id = 1
  AND o.order_date BETWEEN '2023-01-01' AND '2023-12-31'
GROUP BY o.order_id, o.order_date, o.total_amount, c.customer_name
ORDER BY o.order_date DESC;
```

## Reading the Output

### Example Output (SLOW Query - Before Optimization)
```
Seq Scan on order_items oi (cost=0.00..15000.00 rows=50000)
  Filter: (order_id = 1)
  Actual rows: 45 loops: 1
  Execution time: 2341.5 ms

Planning time: 0.5 ms
Execution time: 2341.5 ms
```

**Key Metrics Explained:**

| Metric | Meaning | Example |
|--------|---------|---------|
| **Seq Scan** | Sequential scan (full table scan) ❌ | Scanning all 500k rows |
| **Index Scan** | Uses an index ✅ | Using idx_order_items_order_id |
| **cost=0.00..15000.00** | Estimated cost (lower = faster) | 0.00 startup, 15000 total |
| **rows=50000** | Estimated rows returned | PostgreSQL guesses 50k |
| **Actual rows: 45** | *Actually* returned (not estimated) | Real execution was 45 rows |
| **loops: 1** | How many times this node executes | 1 = single pass, 100 = runs per order |
| **Execution time: 2341.5 ms** | ⏱️ Actual time in milliseconds | Total query took 2.3 seconds |

### Example Output (FAST Query - After Optimization)

```
Aggregate (cost=124.50..124.51 rows=1)
  -> Hash GroupAggregate (cost=98.25..122.45 rows=5)
    Group Key: o.order_id, o.order_date, o.total_amount, c.customer_name
    -> Hash Join (cost=45.20..110.30 rows=180)
      Hash Cond: (oi.order_id = o.order_id)
      -> Index Scan using idx_order_items_order_id on order_items oi (cost=0.28..8.15 rows=45)
        Index Cond: (order_id = 1)
      -> Nested Loop (cost=44.92..102.15 rows=5)
        -> Index Scan using idx_orders_customer_date on orders o (cost=0.28..5.30 rows=3)
          Index Cond: ((customer_id = 1) AND (order_date >= '2023-01-01'::timestamp without time zone) AND (order_date <= '2023-12-31'::timestamp without time zone))
        -> Index Scan using customers_pkey on customers c (cost=0.28..1.10 rows=1)
          Index Cond: (customer_id = 1)

Planning time: 0.3 ms
Execution time: 45.2 ms
```

**Notice the Improvements:**
- ✅ Index Scan (not Seq Scan)
- ✅ Index Cond used (WHERE clause filtered efficiently)
- ✅ Execution time: 45.2 ms (vs 2341.5 ms) - **50x faster!**
- ✅ Loops: 1 (not loops: 100 per order)

---

## How to Diagnose Common Problems

### Problem 1: Seq Scan on Large Tables

**Output shows:**
```
Seq Scan on order_items oi (cost=0.00..15000.00 rows=50000)
  Filter: (order_id = 1)
```

**❌ Bad:** Scanning all 500k rows to find 45
**✅ Fix:** Add index on order_id

```sql
CREATE INDEX idx_order_items_order_id ON order_items(order_id);

-- Re-run EXPLAIN ANALYZE - should now show:
-- Index Scan using idx_order_items_order_id ...
```

---

### Problem 2: Loop Count Too High

**Output shows:**
```
Subquery Scan on items (cost=0.00..50000.00 rows=1 loops=100)
  <- This runs 100 times! (once per order)
  Seq Scan on order_items oi (cost=0.00..500.00 rows=50)
    Filter: (order_id = o.order_id)
    Execution time: 234.5 ms
```

**❌ Bad:** Correlated subquery runs 100 times
**✅ Fix:** Use JOIN instead of subquery

```sql
-- Convert from:
(SELECT json_agg(...) 
 FROM order_items oi 
 WHERE oi.order_id = o.order_id) as items

-- To:
LEFT JOIN order_items oi ON o.order_id = oi.order_id
-- Then use GROUP BY and json_agg at top level
```

---

### Problem 3: Cost Doesn't Match Execution Time

**Output shows:**
```
cost=0.00..100.00 -- estimated 100 cost units
Execution time: 5000.0 ms -- actually 5 seconds!
```

**🤔 Analysis:** PostgreSQL planner underestimated cost
**✅ Fix:** 
1. Run ANALYZE on tables to update statistics:
   ```sql
   ANALYZE orders;
   ANALYZE order_items;
   ANALYZE order_status_history;
   ```
2. Re-run EXPLAIN ANALYZE

---

## Practical Test Cases

### Test 1: Before Optimization (Baseline)

```sql
-- Original slow query with correlated subqueries
EXPLAIN ANALYZE
SELECT
  o.order_id,
  o.order_date,
  o.total_amount,
  o.status,
  c.customer_name,
  c.email,
  (
    SELECT json_agg(json_build_object(
      'product_id', p.product_id,
      'product_name', p.name,
      'quantity', oi.quantity,
      'unit_price', p.price,
      'subtotal', (oi.quantity * p.price)
    ))
    FROM order_items oi
    JOIN products p ON oi.product_id = p.product_id
    WHERE oi.order_id = o.order_id
  ) as items,
  (
    SELECT json_agg(json_build_object(
      'status', s.status,
      'date', s.status_date,
      'notes', s.notes
    ))
    FROM order_status_history s
    WHERE s.order_id = o.order_id
    ORDER BY s.status_date DESC
  ) as status_history
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.customer_id = 1
  AND o.order_date BETWEEN '2023-01-01' AND '2023-12-31'
ORDER BY o.order_date DESC;
```

**Expected Output:** Multiple Seq Scans, high execution time (~2000+ ms)

---

### Test 2: After Adding Indexes

```sql
-- After running:
-- CREATE INDEX idx_order_items_order_id ON order_items(order_id);
-- CREATE INDEX idx_order_status_history_order_id ON order_status_history(order_id);

EXPLAIN ANALYZE
SELECT -- same query as above
```

**Expected Output:** Index Scans appear, execution time improves (~1000-1500 ms)

---

### Test 3: After Converting to JOINs

```sql
-- Optimized query using JOINs instead of subqueries
EXPLAIN ANALYZE
SELECT
  o.order_id,
  o.order_date,
  o.total_amount,
  o.status,
  c.customer_name,
  c.email,
  json_agg(DISTINCT json_build_object(
    'product_id', p.product_id,
    'product_name', p.name,
    'quantity', oi.quantity,
    'unit_price', p.price,
    'subtotal', (oi.quantity * p.price)
  )) FILTER (WHERE p.product_id IS NOT NULL) as items
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
LEFT JOIN order_items oi ON o.order_id = oi.order_id
LEFT JOIN products p ON oi.product_id = p.product_id
WHERE o.customer_id = 1
  AND o.order_date BETWEEN '2023-01-01' AND '2023-12-31'
GROUP BY o.order_id, o.order_date, o.total_amount, o.status, c.customer_name, c.email
ORDER BY o.order_date DESC;
```

**Expected Output:** Single scan with proper indexes, execution time drops dramatically (~200-400 ms)

---

## Advanced Tips

### 1. Save EXPLAIN Output for Comparison

```sql
-- Save to file for later comparison
EXPLAIN (FORMAT JSON, ANALYZE)
SELECT ... your query ...;
```

This outputs JSON you can compare before/after optimization.

---

### 2. Check Index Usage

```sql
-- See which indexes are available
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE tablename IN ('orders', 'order_items', 'order_status_history');

-- See which indexes are actually used (query stats)
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes 
WHERE tablename IN ('orders', 'order_items', 'order_status_history');
```

---

### 3. Understand Join Types

| Join Type | Meaning | When Used |
|-----------|---------|-----------|
| **Nested Loop** | Loop through each row | Small tables or very filtered results |
| **Hash Join** | Build hash table of one side | Large tables with good selectivity |
| **Sort-Merge Join** | Sort both sides, merge | When data already sorted |

Look for Hash Join - it's usually fastest for medium-large datasets.

---

### 4. Monitor Long Queries

```sql
-- See currently running queries
SELECT pid, usename, query, query_start, state 
FROM pg_stat_activity 
WHERE state != 'idle';

-- Kill a slow query (WARNING: use carefully!)
SELECT pg_terminate_backend(pid);
```

---

## Quick Checklist

- [ ] Does the output show **Index Scan** or **Seq Scan**? (Index = good)
- [ ] Are **loops** high (> 10)? (Low = good)
- [ ] Does **Execution time** match expectations?
- [ ] After adding indexes, did you run `ANALYZE`?
- [ ] Have you compared **before/after optimization**?

---

## Next Steps

1. Run EXPLAIN ANALYZE on original query → note execution time
2. Add missing indexes from [PERFORMANCE_ANALYSIS.md](PERFORMANCE_ANALYSIS.md)
3. Run EXPLAIN ANALYZE again → should show index usage
4. Update query to use JOINs instead of correlated subqueries
5. Run EXPLAIN ANALYZE final time → expect 50-90% improvement

**Compare execution times:**
- **Before:** 8-10 seconds
- **After indexes:** 2-3 seconds (60-75% faster)
- **After JOINs + indexes:** 200-400ms (95%+ faster)
