# Product API - Developer Guide

Welcome! This guide will help you integrate the Product API into your application. Whether you're fetching all products or looking for a specific item, we'll walk through each scenario with practical examples.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Query String Formatting](#query-string-formatting)
3. [Understanding Pagination](#understanding-pagination)
4. [Error Handling](#error-handling)
5. [JavaScript Examples](#javascript-examples)
6. [Common Use Cases](#common-use-cases)
7. [Tips & Best Practices](#tips--best-practices)

---

## Getting Started

The Product API has two main endpoints:

- **`GET /`** - Retrieve multiple products with filtering and pagination
- **`GET /:productId`** - Retrieve a single product by its ID

All responses are in JSON format. The base URL for examples below assumes a local development server at `http://localhost:3000/`.

---

## Query String Formatting

When fetching multiple products, you can filter, sort, and paginate using query parameters. Let's break down how to format these requests.

### What is a Query String?

A query string is the part of a URL that comes after the `?` symbol. Each parameter is separated by `&`:

```
GET /products?category=electronics&minPrice=100&maxPrice=500&page=1&limit=10
                 ↑ first param          ↑ separator  ↑ additional params
```

### Available Parameters

| Parameter | Type | Example | What it Does |
|-----------|------|---------|--------------|
| `category` | String | `category=electronics` | Shows only products in this category |
| `minPrice` | Number | `minPrice=50` | Shows products costing $50 or more |
| `maxPrice` | Number | `maxPrice=300` | Shows products costing $300 or less |
| `sort` | String | `sort=price` | Choose which field to sort by |
| `order` | String | `order=asc` | Sort ascending or descending (`asc` / `desc`) |
| `page` | Number | `page=2` | Which page to show (starts at 1) |
| `limit` | Number | `limit=15` | How many products per page |
| `inStock` | String | `inStock=true` | Show only products in stock |

### Building Query Strings: Step by Step

**Example 1: Find affordable electronics**
```
/products?category=electronics&maxPrice=200
```
- `category=electronics` → Only electronics
- `maxPrice=200` → Costing $200 or less

**Example 2: Find mid-range products sorted by price**
```
/products?minPrice=100&maxPrice=500&sort=price&order=asc
```
- `minPrice=100` → At least $100
- `maxPrice=500` → At most $500
- `sort=price` → Organized by price
- `order=asc` → Lowest price first

**Example 3: Get the second page of in-stock items**
```
/products?inStock=true&page=2&limit=20
```
- `inStock=true` → Only products with stock > 0
- `page=2` → Skip the first page, show items 21-40
- `limit=20` → Show 20 items per page

### Important Notes on Query Parameters

✓ **Parameters are optional** - You can use just one or mix and match them all
✓ **Order doesn't matter** - `?sort=price&category=electronics` is the same as `?category=electronics&sort=price`
✓ **Price values are numbers** - Don't include `$` or currency symbols: use `100`, not `$100`
✓ **inStock is case-sensitive** - Must be exactly `'true'` or `'false'` as a string, not a boolean

---

## Understanding Pagination

Pagination helps you handle large datasets by breaking them into smaller pages. When you make a request to get all products, the response includes pagination metadata.

### The Pagination Object

Every successful response from `GET /` includes a `pagination` object:

```json
{
  "products": [...],
  "pagination": {
    "total": 500,
    "page": 1,
    "limit": 20,
    "pages": 25
  }
}
```

**What each field means:**

| Field | Meaning | Example |
|-------|---------|---------|
| `total` | Total number of products matching your filters | `500` means 500 products match your criteria |
| `page` | Current page number (starts at 1) | `1` means you're on the first page |
| `limit` | How many products per page | `20` means each page shows 20 items |
| `pages` | Total pages available | `25` means there are 25 pages total |

### Calculating Page Information

The API does the math for you, but here's how it works:

```
Total Items in Database: 500
Items Per Page (limit): 20

Total Pages = 500 ÷ 20 = 25 pages
```

If you're on page 3:
```
Items Shown: (20 items per page) × 3 pages = items 41-60
```

### Navigating Between Pages

**Get page 1 (default):**
```
/products?page=1&limit=20
```

**Get page 2:**
```
/products?page=2&limit=20
```

**Get page 5 with 10 items per page:**
```
/products?page=5&limit=10
```

### Pro Tip: Detecting the Last Page

In your app, you might want to know if there are more pages to load:

```javascript
// After getting the response
if (response.pagination.page === response.pagination.pages) {
  console.log("You're on the last page!");
} else {
  console.log(`${response.pagination.pages - response.pagination.page} more pages available`);
}
```

---

## Error Handling

Errors are a normal part of API integration. Understanding what each error means helps you debug quickly.

### Common HTTP Status Codes

| Status | Meaning | When It Happens | What To Do |
|--------|---------|-----------------|-----------|
| `200` | Success | Request worked perfectly | Process the data normally |
| `400` | Bad Request | Invalid product ID format | Validate the ID before sending |
| `404` | Not Found | Product doesn't exist | Check if the ID is correct |
| `500` | Server Error | Something broke on the server | Retry after a short delay |

### Error Response Format

All errors follow this structure:

```json
{
  "error": "Error Type",
  "message": "Helpful explanation"
}
```

### The CastError (400 Bad Request)

This is the most common error when fetching a product by ID. It happens when the ID format is invalid.

**Valid MongoDB ObjectId format:**
- Exactly 24 characters
- Only hexadecimal digits (0-9, a-f)
- Example: `507f1f77bcf86cd799439011`

**Invalid formats that cause CastError:**
```
❌ abc123              (too short)
❌ hello-world        (contains invalid characters)
❌ 12345              (too short)
❌ 507f1f77bcf86cd799439011xxx (too long)
✓ 507f1f77bcf86cd799439011     (correct!)
```

### How to Handle Errors in Code

**Basic error handling pattern:**

```javascript
async function getProduct(productId) {
  try {
    const response = await fetch(`/products/${productId}`);
    
    if (!response.ok) {
      // Handle HTTP errors
      const error = await response.json();
      
      if (response.status === 400) {
        console.error("Invalid ID format:", error.message);
        // Show user: "Please check the product ID"
      } else if (response.status === 404) {
        console.error("Product not found:", error.message);
        // Show user: "This product doesn't exist"
      } else if (response.status === 500) {
        console.error("Server error:", error.message);
        // Show user: "Something went wrong. Please try again later"
      }
      return null;
    }
    
    const product = await response.json();
    return product;
    
  } catch (error) {
    console.error("Network error:", error);
    // Show user: "Connection problem. Check your internet"
    return null;
  }
}
```

---

## JavaScript Examples

Let's look at real code examples using the `fetch` API, which is the modern way to make HTTP requests in JavaScript.

### Example 1: Get All Products (Simple)

```javascript
async function getAllProducts() {
  try {
    const response = await fetch('http://localhost:3000/');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Products:', data.products);
    console.log('Total products:', data.pagination.total);
    
    return data;
  } catch (error) {
    console.error('Failed to fetch products:', error);
  }
}

// Call it
getAllProducts();
```

### Example 2: Get Filtered Products (Price & Category)

```javascript
async function getFilteredProducts(category, minPrice, maxPrice) {
  try {
    // Build the query string
    const params = new URLSearchParams();
    params.append('category', category);
    params.append('minPrice', minPrice);
    params.append('maxPrice', maxPrice);
    
    const url = `http://localhost:3000/?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch filtered products:', error);
    return null;
  }
}

// Usage
getFilteredProducts('electronics', 100, 500)
  .then(data => {
    if (data) {
      console.log(`Found ${data.products.length} products`);
      data.products.forEach(product => {
        console.log(`${product.name}: $${product.price}`);
      });
    }
  });
```

### Example 3: Get Sorted & Paginated Products

```javascript
async function getProductsPage(page = 1, limit = 10, sortBy = 'price', order = 'asc') {
  try {
    const params = new URLSearchParams({
      page: page,
      limit: limit,
      sort: sortBy,
      order: order
    });
    
    const response = await fetch(`http://localhost:3000/?${params.toString()}`);
    const data = await response.json();
    
    // Display pagination info
    console.log(`Page ${data.pagination.page} of ${data.pagination.pages}`);
    console.log(`Showing ${data.products.length} of ${data.pagination.total} products`);
    
    return data;
  } catch (error) {
    console.error('Failed to fetch products:', error);
  }
}

// Get page 2 with 15 items per page, sorted by price ascending
getProductsPage(2, 15, 'price', 'asc');
```

### Example 4: Get a Single Product by ID

```javascript
async function getProductById(productId) {
  try {
    const response = await fetch(`http://localhost:3000/${productId}`);
    
    if (!response.ok) {
      const error = await response.json();
      
      if (response.status === 400) {
        console.error('Invalid ID format. Please use a valid MongoDB ObjectId.');
        console.error('Valid format: 24 hexadecimal characters (0-9, a-f)');
        console.error('Example: 507f1f77bcf86cd799439011');
      } else if (response.status === 404) {
        console.error('Product not found.');
      } else {
        console.error('Server error:', error.message);
      }
      
      return null;
    }
    
    const product = await response.json();
    return product;
  } catch (error) {
    console.error('Network error:', error);
    return null;
  }
}

// Usage
getProductById('507f1f77bcf86cd799439011')
  .then(product => {
    if (product) {
      console.log(`Product: ${product.name}`);
      console.log(`Price: $${product.price}`);
      console.log(`In Stock: ${product.stockQuantity > 0 ? 'Yes' : 'No'}`);
    }
  });
```

### Example 5: Search with Smart Error Handling

```javascript
async function searchProducts(filters = {}) {
  try {
    // Set defaults
    const queryParams = {
      category: filters.category || null,
      minPrice: filters.minPrice || null,
      maxPrice: filters.maxPrice || null,
      page: filters.page || 1,
      limit: filters.limit || 20,
      inStock: filters.inStock ? 'true' : null
    };
    
    // Build clean URL (remove null params)
    const params = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== null) {
        params.append(key, value);
      }
    });
    
    console.log(`Fetching from: http://localhost:3000/?${params.toString()}`);
    
    const response = await fetch(`http://localhost:3000/?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // Return formatted result
    return {
      success: true,
      products: data.products,
      pagination: data.pagination,
      message: `Found ${data.products.length} products`
    };
    
  } catch (error) {
    console.error('Search failed:', error);
    return {
      success: false,
      products: [],
      pagination: null,
      message: `Error: ${error.message}`
    };
  }
}

// Usage examples
searchProducts({ 
  category: 'electronics', 
  maxPrice: 300, 
  inStock: true 
});

searchProducts({ 
  minPrice: 50, 
  page: 2, 
  limit: 15 
});
```

---

## Common Use Cases

### Use Case 1: Display a Product Listing with Filters

```javascript
class ProductListing {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentPage = 1;
    this.filters = {};
  }
  
  async loadProducts(filters = {}) {
    this.filters = filters;
    this.currentPage = 1;
    await this.fetchAndRender();
  }
  
  async fetchAndRender() {
    const queryParams = {
      ...this.filters,
      page: this.currentPage,
      limit: 20
    };
    
    const params = new URLSearchParams(queryParams);
    const response = await fetch(`/products?${params}`);
    const data = await response.json();
    
    this.renderProducts(data.products);
    this.renderPagination(data.pagination);
  }
  
  renderProducts(products) {
    this.container.innerHTML = products
      .map(p => `
        <div class="product-card">
          <h3>${p.name}</h3>
          <p>$${p.price}</p>
          <p>${p.stockQuantity > 0 ? 'In Stock' : 'Out of Stock'}</p>
        </div>
      `)
      .join('');
  }
  
  renderPagination(pagination) {
    // Render next/prev buttons based on pagination.page and pagination.pages
  }
}

// Usage
const listing = new ProductListing('products-container');
listing.loadProducts({ category: 'electronics', inStock: 'true' });
```

### Use Case 2: Handle Product Not Found

```javascript
async function viewProduct(productId) {
  const product = await getProductById(productId);
  
  if (!product) {
    // Show a 404 page or error message
    document.body.innerHTML = '<h1>Product Not Found</h1>';
    return;
  }
  
  // Display the product details
  displayProductDetails(product);
}
```

### Use Case 3: Validate ID Before Fetching

```javascript
function isValidObjectId(id) {
  // MongoDB ObjectIds are exactly 24 hexadecimal characters
  const objectIdRegex = /^[0-9a-f]{24}$/i;
  return objectIdRegex.test(id);
}

async function safeGetProduct(productId) {
  if (!isValidObjectId(productId)) {
    console.error('Invalid product ID format');
    alert('Please provide a valid product ID');
    return null;
  }
  
  return await getProductById(productId);
}
```

---

## Tips & Best Practices

### ✓ Do

- **Validate IDs before sending requests** - Check if the ID is 24 hexadecimal characters
  ```javascript
  const isValidId = /^[0-9a-f]{24}$/i.test(productId);
  ```

- **Use URLSearchParams for building query strings** - It handles encoding automatically
  ```javascript
  const params = new URLSearchParams({ category: 'electronics' });
  ```

- **Handle pagination properly** - Always check if there are more pages before showing "next"
  ```javascript
  const hasNextPage = response.pagination.page < response.pagination.pages;
  ```

- **Cache results when appropriate** - Reduce API calls by storing recent responses
  ```javascript
  const cache = {};
  if (cache[query]) return cache[query];
  ```

- **Set reasonable timeouts** - Don't let requests hang forever
  ```javascript
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 5000); // 5 second timeout
  fetch(url, { signal: controller.signal });
  ```

### ✗ Don't

- **Don't make the same request twice** - Use caching or debouncing
- **Don't ignore error responses** - Always check `response.ok` or HTTP status codes
- **Don't pass invalid IDs** - Validate format first to get better error messages
- **Don't hardcode URLs** - Use environment variables or config files
- **Don't make too many requests at once** - Limit concurrent API calls

### Performance Tips

1. **Use pagination** - Instead of fetching all products at once, use `limit` and `page`
2. **Filter on the server** - Let the API filter rather than doing it in JavaScript
3. **Cache results** - Store recent responses to reduce repeated requests
4. **Debounce search** - If user types in a search box, wait before making requests

### Debugging Tips

**Check the actual URL being requested:**
```javascript
const url = 'http://localhost:3000/?category=electronics&page=1';
console.log('Requesting:', url);
const response = await fetch(url);
```

**Log the full response:**
```javascript
const data = await response.json();
console.log('Full response:', JSON.stringify(data, null, 2));
```

**Test with curl (command line):**
```bash
curl "http://localhost:3000/?category=electronics&minPrice=100"
```

---

## Summary

You now know:
- ✓ How to format query strings for filtering and pagination
- ✓ How to interpret pagination metadata
- ✓ How to handle errors gracefully
- ✓ How to write JavaScript code using fetch
- ✓ How to validate data before making requests

Start with the simple examples and gradually build more complex features. Happy coding!
