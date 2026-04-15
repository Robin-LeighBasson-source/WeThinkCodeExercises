/**
 * Product API endpoints
 */
const productRouter = express.Router();

// Get all products with filtering and pagination
productRouter.get('/', async (req, res) => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      sort = 'createdAt',
      order = 'desc',
      page = 1,
      limit = 20,
      inStock
    } = req.query;

    // Build filter
    const filter = {};

    if (category) {
      filter.category = category;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice !== undefined) filter.price.$lte = parseFloat(maxPrice);
    }

    if (inStock === 'true') {
      filter.stockQuantity = { $gt: 0 };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Determine sort order
    const sortOptions = {};
    sortOptions[sort] = order === 'asc' ? 1 : -1;

    // Execute query
    const products = await ProductModel.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalProducts = await ProductModel.countDocuments(filter);

    return res.status(200).json({
      products,
      pagination: {
        total: totalProducts,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalProducts / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({
      error: 'Server error',
      message: 'Failed to fetch products'
    });
  }
});

// Get product by ID
productRouter.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await ProductModel.findById(productId);

    if (!product) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Product not found'
      });
    }

    return res.status(200).json(product);
  } catch (error) {
    console.error('Error fetching product:', error);

    // Check if error is invalid ObjectId format
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'Invalid product ID format'
      });
    }

    return res.status(500).json({
      error: 'Server error',
      message: 'Failed to fetch product'
    });
  }
});

module.exports = productRouter;