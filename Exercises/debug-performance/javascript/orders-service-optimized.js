// orders-service-optimized.js
// Optimized version using JOINs, proper indexes, and batch queries
const { Pool } = require('pg');

// Database connection - use environment variables with fallbacks
const pool = new Pool({
  user: process.env.DB_USER || 'app_user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'ecommerce',
  password: process.env.DB_PASSWORD || 'password123',
  port: parseInt(process.env.DB_PORT || '5432'),
  max: 20,                    // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

console.log(`Database connection: ${process.env.DB_USER || 'app_user'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'ecommerce'}`);

/**
 * OPTIMIZATION 1: Separate query for orders with items (using JOINs instead of correlated subqueries)
 * This prevents N+1 queries and allows proper index usage
 */
async function getCustomerOrders(customerId, startDate, endDate) {
  const startTime = Date.now();
  
  try {
    const result = await pool.query(`
      SELECT
        o.order_id,
        o.order_date,
        o.total_amount,
        o.status,
        c.customer_name,
        c.email,
        a.street,
        a.city,
        a.state,
        a.postal_code,
        a.country,
        json_agg(
          DISTINCT json_build_object(
            'product_id', p.product_id,
            'product_name', p.name,
            'quantity', oi.quantity,
            'unit_price', p.price,
            'subtotal', (oi.quantity * p.price)
          )
        ) FILTER (WHERE p.product_id IS NOT NULL) as items
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN addresses a ON o.shipping_address_id = a.address_id
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.product_id
      WHERE o.customer_id = $1
        AND o.order_date BETWEEN $2 AND $3
      GROUP BY 
        o.order_id, o.order_date, o.total_amount, o.status,
        c.customer_name, c.email,
        a.street, a.city, a.state, a.postal_code, a.country
      ORDER BY o.order_date DESC
    `, [customerId, startDate, endDate]);

    const duration = Date.now() - startTime;
    console.log(`Orders query completed in ${duration}ms`);
    
    return result.rows;
  } catch (err) {
    console.error('Error fetching orders:', err);
    throw err;
  }
}

/**
 * OPTIMIZATION 2: Separate query for status history (batch query instead of per-order subquery)
 * Uses ANY() to fetch all status history in a single query, then maps to orders in Node.js
 */
async function getOrderStatusHistoryBatch(orderIds) {
  if (orderIds.length === 0) return new Map();
  
  const startTime = Date.now();
  
  try {
    const result = await pool.query(`
      SELECT 
        order_id,
        json_agg(
          json_build_object(
            'status', status,
            'date', status_date,
            'notes', notes
          ) ORDER BY status_date DESC
        ) as status_history
      FROM order_status_history
      WHERE order_id = ANY($1)
      GROUP BY order_id
    `, [orderIds]);

    const duration = Date.now() - startTime;
    console.log(`Status history batch query completed in ${duration}ms (${orderIds.length} orders)`);
    
    // Convert to Map for O(1) lookup
    const statusMap = new Map(result.rows.map(r => [r.order_id, r.status_history]));
    return statusMap;
  } catch (err) {
    console.error('Error fetching status history:', err);
    throw err;
  }
}

/**
 * OPTIMIZED: Main function combining orders with status history
 * Uses 2 queries instead of 200+ (1 main + N per-order subqueries)
 */
async function getCustomerOrderDetails(customerId, startDate, endDate) {
  const totalStartTime = Date.now();
  
  try {
    // OPTIMIZATION 1: Fetch orders with items using JOINs
    const orders = await getCustomerOrders(customerId, startDate, endDate);

    if (orders.length === 0) {
      console.log(`No orders found for customer ${customerId}`);
      return [];
    }

    // OPTIMIZATION 2: Batch fetch status history for all orders
    const orderIds = orders.map(o => o.order_id);
    const statusHistoryMap = await getOrderStatusHistoryBatch(orderIds);

    // Combine data in Node.js (negligible performance impact)
    const enrichedOrders = orders.map(order => ({
      ...order,
      status_history: statusHistoryMap.get(order.order_id) || []
    }));

    const totalDuration = Date.now() - totalStartTime;
    console.log(`Total query time: ${totalDuration}ms for ${orders.length} orders`);
    
    return enrichedOrders;
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
}

/**
 * Alternative: Single query approach (if you prefer without status history in separate query)
 * Still better than original because it uses JOINs instead of correlated subqueries
 */
async function getCustomerOrderDetailsV2(customerId, startDate, endDate) {
  try {
    const result = await pool.query(`
      SELECT
        o.order_id,
        o.order_date,
        o.total_amount,
        o.status,
        c.customer_name,
        c.email,
        json_agg(
          DISTINCT json_build_object(
            'product_id', p.product_id,
            'product_name', p.name,
            'quantity', oi.quantity,
            'unit_price', p.price,
            'subtotal', (oi.quantity * p.price)
          )
        ) FILTER (WHERE p.product_id IS NOT NULL) as items,
        json_agg(
          DISTINCT json_build_object(
            'status', s.status,
            'date', s.status_date,
            'notes', s.notes
          ) ORDER BY s.status_date DESC
        ) FILTER (WHERE s.status_id IS NOT NULL) as status_history,
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
      LEFT JOIN order_status_history s ON o.order_id = s.order_id
      WHERE o.customer_id = $1
        AND o.order_date BETWEEN $2 AND $3
      GROUP BY 
        o.order_id, o.order_date, o.total_amount, o.status,
        c.customer_name, c.email,
        a.street, a.city, a.state, a.postal_code, a.country
      ORDER BY o.order_date DESC
    `, [customerId, startDate, endDate]);

    return result.rows;
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
}

// Example usage in Express route handler
async function getOrdersHandler(req, res) {
  try {
    const { customerId } = req.params;
    const { startDate = '2023-01-01', endDate = '2023-12-31' } = req.query;

    const orders = await getCustomerOrderDetails(customerId, startDate, endDate);

    res.json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    console.error('Error in getOrdersHandler:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while fetching orders'
    });
  }
}

module.exports = {
  getCustomerOrderDetails,
  getCustomerOrderDetailsV2,
  getOrdersHandler
};
