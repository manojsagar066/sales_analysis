// src/graphql/resolvers.js
const { GraphQLError } = require('graphql');
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { Kind } = require('graphql/language');

// Custom Scalar for Date
const { GraphQLScalarType } = require('graphql');

const dateScalar = new GraphQLScalarType({
  name: 'Date',
  description: 'Date custom scalar type',
  serialize(value) { // Converts backend Date object to ISO string for client
    if (value instanceof Date) {
      return value.toISOString();
    }
    throw new GraphQLError('GraphQL Date Scalar serializer expected a `Date` object');
  },
  parseValue(value) { // Converts client ISO string to backend Date object
    if (typeof value === 'string') {
      return new Date(value); // value from the client input variables
    }
    throw new GraphQLError('GraphQL Date Scalar parser expected a `string`');
  },
  parseLiteral(ast) { // Converts client inline string to backend Date object
    if (ast.kind === Kind.STRING) {
      // Convert hard-coded AST string to integer and then to Date
      return new Date(ast.value);
    }
    // Invalid hard-coded value (not a String)
    return null;
  },
});


const resolvers = {
  Date: dateScalar, // Register the custom scalar

  Query: {
    // --- Query 1: getCustomerSpending ---
    getCustomerSpending: async (_, { customerId }) => {
      if (!customerId) {
        throw new GraphQLError('Customer ID is required', {
            extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      try {
        const spendingPipeline = [
          { $match: { customerId: customerId } }, // Filter by customer
          { $sort: { orderDate: -1 } }, // Sort by date descending to get the latest
          {
            $group: {
              _id: '$customerId', // Group by customer ID (will be just one group)
              totalSpent: { $sum: '$totalAmount' },
              orderCount: { $sum: 1 },
              lastOrderDate: { $first: '$orderDate' }, // Get the date from the first doc (latest)
            },
          },
          {
            $project: {
              _id: 0, // Exclude the default _id
              customerId: '$_id',
              totalSpent: 1,
              lastOrderDate: 1,
              // Calculate average, handle division by zero (though unlikely if totalSpent > 0)
              averageOrderValue: {
                 $cond: [ { $eq: ['$orderCount', 0] }, 0, { $divide: ['$totalSpent', '$orderCount'] } ]
              },
            },
          },
        ];

        const result = await Order.aggregate(spendingPipeline);

        if (result.length > 0) {
          // Round values for cleaner output
          result[0].totalSpent = parseFloat(result[0].totalSpent.toFixed(2));
          result[0].averageOrderValue = parseFloat(result[0].averageOrderValue.toFixed(2));
          return result[0];
        } else {
          // Customer exists but has no orders, or customer ID is invalid
           const customerExists = await Customer.findById(customerId);
           if (!customerExists) {
             throw new GraphQLError('Customer not found', {
               extensions: { code: 'NOT_FOUND' },
             });
           }
           // Customer found, but no orders
           return {
             customerId: customerId,
             totalSpent: 0,
             averageOrderValue: 0,
             lastOrderDate: null,
           };
        }
      } catch (error) {
        console.error("Error in getCustomerSpending:", error);
        // Check for specific Mongoose CastError if ID format is wrong
        if (error instanceof mongoose.Error.CastError) {
             throw new GraphQLError('Invalid Customer ID format', {
                 extensions: { code: 'BAD_USER_INPUT' },
             });
        }
        throw new GraphQLError('Could not fetch customer spending data.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    // --- Query 2: getTopSellingProducts ---
    getTopSellingProducts: async (_, { limit }) => {
      if (!limit || limit <= 0) {
         throw new GraphQLError('Limit must be a positive integer', {
             extensions: { code: 'BAD_USER_INPUT' },
         });
      }
      try {
        const topSellingPipeline = [
          { $unwind: '$products' }, // Deconstruct the products array
          {
            $group: {
              _id: '$products.productId', // Group by product ID
              totalSold: { $sum: '$products.quantity' }, // Sum quantities for each product
            },
          },
          { $sort: { totalSold: -1 } }, // Sort by total quantity sold descending
          { $limit: limit }, // Limit the results
          {
            // Join with products collection to get product names
            $lookup: {
              from: 'products', // The actual name of the products collection in MongoDB
              localField: '_id',
              foreignField: '_id',
              as: 'productInfo',
            },
          },
          { $unwind: '$productInfo' }, // Deconstruct the productInfo array (will have one element)
          {
            $project: {
              _id: 0, // Exclude default _id
              productId: '$_id',
              name: '$productInfo.name',
              totalSold: 1,
            },
          },
        ];

        const results = await Order.aggregate(topSellingPipeline);
        return results;

      } catch (error) {
        console.error("Error in getTopSellingProducts:", error);
        throw new GraphQLError('Could not fetch top selling products.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    // --- Query 3: getSalesAnalytics ---
    getSalesAnalytics: async (_, { startDate, endDate }) => {
      try {
        const start = new Date(startDate);
        const end = new Date(endDate); // End date is exclusive

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new GraphQLError('Invalid date format. Please use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)', {
                extensions: { code: 'BAD_USER_INPUT' },
            });
        }

        if (start >= end) {
             throw new GraphQLError('Start date must be before end date', {
                 extensions: { code: 'BAD_USER_INPUT' },
             });
        }

        const matchStage = {
          $match: {
            status: 'completed', // Only completed orders
            orderDate: {
              $gte: start, // Inclusive start date
              $lt: end,   // Exclusive end date
            },
          },
        };

        // Pipeline to calculate total revenue and completed orders
        const overallAnalyticsPipeline = [
            matchStage,
            {
                $group: {
                    _id: null, // Group all matched documents together
                    totalRevenue: { $sum: '$totalAmount' },
                    completedOrders: { $sum: 1 },
                }
            },
            {
                $project: {
                    _id: 0,
                    totalRevenue: 1,
                    completedOrders: 1,
                }
            }
        ];

        // Pipeline for category breakdown
         const categoryBreakdownPipeline = [
            matchStage,
            { $unwind: '$products' }, // Unwind the products array
            {
                // Calculate revenue per item *before* grouping by category
                $project: {
                    productId: '$products.productId',
                    itemRevenue: { $multiply: ['$products.quantity', '$products.priceAtPurchase'] }
                }
            },
            {
                // Lookup product category
                 $lookup: {
                     from: 'products',
                     localField: 'productId',
                     foreignField: '_id',
                     as: 'productInfo',
                 },
             },
             { $unwind: '$productInfo' }, // Should only be one product match
             {
                 // Group by category and sum the itemRevenue
                 $group: {
                     _id: '$productInfo.category',
                     revenue: { $sum: '$itemRevenue' },
                 },
             },
             {
                 $project: {
                     _id: 0,
                     category: '$_id',
                     revenue: { $round: ['$revenue', 2]}, // Round revenue
                 },
             },
             { $sort: { revenue: -1 } } // Optional: sort categories by revenue
         ];

        // Execute both pipelines concurrently
        const [overallResult, categoryResult] = await Promise.all([
            Order.aggregate(overallAnalyticsPipeline),
            Order.aggregate(categoryBreakdownPipeline)
        ]);

        // Construct the final response
        const analytics = {
            totalRevenue: overallResult.length > 0 ? parseFloat(overallResult[0].totalRevenue.toFixed(2)) : 0,
            completedOrders: overallResult.length > 0 ? overallResult[0].completedOrders : 0,
            categoryBreakdown: categoryResult.map(item => ({
                ...item,
                 revenue: parseFloat(item.revenue.toFixed(2)) // Ensure float format
            })) || [], // Return empty array if no category data
        };

        return analytics;

      } catch (error) {
        console.error("Error in getSalesAnalytics:", error);
         if (error instanceof GraphQLError) { // Re-throw validation errors
             throw error;
         }
        throw new GraphQLError('Could not fetch sales analytics.', {
           extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    getCustomer: async (_, { id }) => {
        try {
            const customer = await Customer.findById(id);
            if (!customer) throw new GraphQLError('Customer not found', { extensions: { code: 'NOT_FOUND' } });
            return customer;
        } catch (error) {
             console.error("Error fetching customer:", error);
             if (error instanceof mongoose.Error.CastError) {
                throw new GraphQLError('Invalid Customer ID format', { extensions: { code: 'BAD_USER_INPUT' } });
             }
             throw new GraphQLError('Error fetching customer');
        }
    },
    getProduct: async (_, { id }) => {
       try {
           const product = await Product.findById(id);
           if (!product) throw new GraphQLError('Product not found', { extensions: { code: 'NOT_FOUND' } });
           return product;
       } catch (error) {
           console.error("Error fetching product:", error);
           if (error instanceof mongoose.Error.CastError) {
               throw new GraphQLError('Invalid Product ID format', { extensions: { code: 'BAD_USER_INPUT' } });
           }
           throw new GraphQLError('Error fetching product');
       }
   },
   getOrder: async (_, { id }) => {
       try {
           const order = await Order.findById(id); //.populate('products.productId').populate('customerId'); // Optional population
           if (!order) throw new GraphQLError('Order not found', { extensions: { code: 'NOT_FOUND' } });
           return order;
       } catch (error) {
           console.error("Error fetching order:", error);
           if (error instanceof mongoose.Error.CastError) {
               throw new GraphQLError('Invalid Order ID format', { extensions: { code: 'BAD_USER_INPUT' } });
           }
           throw new GraphQLError('Error fetching order');
       }
   },
  },

  Order: {
    // Example: Resolve the customer details for an order
    customer: async (parent) => {
       try {
            return await Customer.findById(parent.customerId);
       } catch (error) {
            console.error(`Error fetching customer ${parent.customerId} for order ${parent._id}:`, error);
            return null; // Return null if customer not found or error occurs
       }
    },
  },
  OrderItem: {
      // Example: Resolve the product details for an order item
      product: async (parent) => {
          try {
              return await Product.findById(parent.productId);
          } catch (error) {
              console.error(`Error fetching product ${parent.productId} for order item:`, error);
              return null;
          }
      }
  }
};

module.exports = resolvers;