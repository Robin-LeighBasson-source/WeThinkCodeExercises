# Product API Documentation

## Overview
This Product API provides endpoints for retrieving product information from a MongoDB database. The API supports filtering, pagination, sorting, and individual product lookup by ID.

---

## Endpoint 1: Get All Products

### Purpose
Retrieves a paginated list of all products with support for filtering by category, price range, and stock status, as well as sorting and pagination controls.

### HTTP Method & Route
```
GET /
```

### Request Parameters

#### Query Parameters
All query parameters are optional:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `category` | String | - | Filter products by category name |
| `minPrice` | Number | - | Filter products with price greater than or equal to this value |
| `maxPrice` | Number | - | Filter products with price less than or equal to this value |
| `sort` | String | `createdAt` | Field name to sort by (e.g., `price`, `createdAt`, `name`) |
| `order` | String | `desc` | Sort order: `asc` (ascending) or `desc` (descending) |
| `page` | Number | `1` | Page number for pagination (1-indexed) |
| `limit` | Number | `20` | Number of products per page |
| `inStock` | Boolean (String) | - | Filter to show only in-stock products. Set to `'true'` to filter |

#### Example Request
```
GET /?category=electronics&minPrice=100&maxPrice=500&sort=price&order=asc&page=1&limit=10&inStock=true
```

### Response Formats

#### Success Response (200 OK)
**Status Code:** `200`

**Response Body:**
```json
{
  "products": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Product Name",
      "category": "electronics",
      "price": 299.99,
      "stockQuantity": 50,
      "createdAt": "2026-04-15T10:30:00Z"
    },
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Another Product",
      "category": "electronics",
      "price": 399.99,
      "stockQuantity": 30,
      "createdAt": "2026-04-14T15:20:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 10,
    "pages": 15
  }
}
```

**Response Fields:**
- `products`: Array of product objects matching the filter criteria
- `pagination.total`: Total number of products matching the filter
- `pagination.page`: Current page number
- `pagination.limit`: Number of items per page
- `pagination.pages`: Total number of pages available

#### Server Error Response (500 Internal Server Error)
**Status Code:** `500`

**Response Body:**
```json
{
  "error": "Server error",
  "message": "Failed to fetch products"
}
```

### Filter Logic

- **Category Filter:** Matches products where `category` field equals the provided value
- **Price Range Filter:** Products are filtered using MongoDB operators:
  - `$gte` (greater than or equal to) for minimum price
  - `$lte` (less than or equal to) for maximum price
- **Stock Filter:** Filters products where `stockQuantity` is greater than 0 (when `inStock=true`)

### Sorting
The endpoint dynamically sorts by any field in the database. The `order` parameter determines direction:
- `asc` → 1 (ascending, smallest to largest)
- `desc` → -1 (descending, largest to smallest)

### Pagination
Pagination is calculated as follows:
- `skip` = (page - 1) × limit
- Results are skipped and limited accordingly
- Total pages = ceil(total products / limit)

---

## Endpoint 2: Get Product by ID

### Purpose
Retrieves detailed information about a single product by its unique MongoDB ObjectId.

### HTTP Method & Route
```
GET /:productId
```

### Request Parameters

#### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `productId` | String (MongoDB ObjectId) | Yes | The unique identifier of the product. Must be a valid MongoDB ObjectId format |

#### Example Request
```
GET /507f1f77bcf86cd799439011
```

### Response Formats

#### Success Response (200 OK)
**Status Code:** `200`

**Response Body:**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Wireless Headphones",
  "category": "electronics",
  "price": 199.99,
  "description": "High-quality wireless headphones with noise cancellation",
  "stockQuantity": 45,
  "createdAt": "2026-04-10T12:00:00Z",
  "updatedAt": "2026-04-15T10:30:00Z"
}
```

#### Product Not Found (404 Not Found)
**Status Code:** `404`

**Response Body:**
```json
{
  "error": "Not found",
  "message": "Product not found"
}
```

**When this occurs:**
- The provided `productId` is a valid MongoDB ObjectId format, but no product exists with this ID in the database
- No products matched the query

#### Invalid ID Format (400 Bad Request)
**Status Code:** `400`

**Response Body:**
```json
{
  "error": "Invalid ID",
  "message": "Invalid product ID format"
}
```

**When this occurs:**
- The provided `productId` does not match MongoDB ObjectId format
- MongoDB throws a `CastError` during the type conversion attempt

**Note on CastError:**
MongoDB's `CastError` is thrown when attempting to convert a string to a MongoDB ObjectId and the string is not a valid 24-character hexadecimal value. For example:
- ✗ Invalid: `abc123`, `12345`, `not-an-id`
- ✓ Valid: `507f1f77bcf86cd799439011`, `60d5ec49c1234567890abcde`

The endpoint catches this error specifically and returns a user-friendly `400` response instead of a generic server error.

#### Server Error Response (500 Internal Server Error)
**Status Code:** `500`

**Response Body:**
```json
{
  "error": "Server error",
  "message": "Failed to fetch product"
}
```

**When this occurs:**
- Database connection error
- Any unexpected error other than CastError

---

## Error Handling Summary

| Status Code | Endpoint(s) | Cause |
|-------------|------------|-------|
| 200 | Both | Request successful, data returned |
| 400 | Get by ID | Invalid MongoDB ObjectId format (CastError) |
| 404 | Get by ID | Product ID is valid format but not found in database |
| 500 | Both | Unexpected server error or database connection issue |

---

## Usage Examples

### Example 1: Get All Electronics Under $500
```
GET /?category=electronics&maxPrice=500&sort=price&order=asc
```

### Example 2: Get In-Stock Products, Page 2
```
GET /?inStock=true&page=2&limit=10
```

### Example 3: Get Single Product
```
GET /507f1f77bcf86cd799439011
```

### Example 4: Invalid Product ID
```
GET /invalid-id
```
Returns: `400 Bad Request` with CastError explanation

---

## Notes for API Consumers

1. **Query Parameter Validation:** Always validate ObjectIds before making requests to avoid CastError responses
2. **Pagination:** The default page size is 20 items. Adjust the `limit` parameter for different page sizes
3. **Sorting:** Ensure the `sort` parameter matches an actual field in your product schema
4. **Price Filtering:** Both `minPrice` and `maxPrice` can be used independently or together
5. **Stock Filter:** The `inStock` parameter must be passed as the string `'true'` (case-sensitive)
