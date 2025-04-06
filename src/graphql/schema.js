// src/graphql/schema.js
const gql = require('graphql-tag'); // Older way, often just use template literals

const typeDefs = `#graphql
  scalar Date # Custom scalar for Date

  type Customer {
    _id: ID!
    name: String!
    email: String!
    age: Int
    location: String
    gender: String
  }

  type Product {
    _id: ID!
    name: String!
    category: String!
    price: Float!
    stock: Int!
  }

  type OrderItem {
    productId: ID!
    quantity: Int!
    priceAtPurchase: Float!
    product: Product # Optionally resolve product details
  }

  type Order {
    _id: ID!
    customerId: ID!
    products: [OrderItem!]!
    totalAmount: Float!
    orderDate: Date!
    status: String!
    customer: Customer # Optionally resolve customer details
  }

  # Query 1: Customer Spending
  type CustomerSpending {
    customerId: ID!
    totalSpent: Float!
    averageOrderValue: Float!
    lastOrderDate: Date
  }

  # Query 2: Top Selling Products
  type TopProduct {
    productId: ID!
    name: String!
    totalSold: Int!
  }

  # Query 3: Sales Analytics
  type CategoryRevenue {
    category: String!
    revenue: Float!
  }

  type SalesAnalytics {
    totalRevenue: Float!
    completedOrders: Int!
    categoryBreakdown: [CategoryRevenue!]!
  }

  type Query {
    """
    Returns total spending, last purchase date, and average order value for a given customer.
    """
    getCustomerSpending(customerId: ID!): CustomerSpending

    """
    Returns the top-selling products based on the total quantity sold across all orders.
    """
    getTopSellingProducts(limit: Int!): [TopProduct!]!

    """
    Returns total revenue, number of completed orders, and revenue breakdown by product category within a date range (inclusive start, exclusive end).
    """
    getSalesAnalytics(startDate: String!, endDate: String!): SalesAnalytics

    # Example helper queries (optional)
    getCustomer(id: ID!): Customer
    getProduct(id: ID!): Product
    getOrder(id: ID!): Order
  }

  # Potential future mutations (Bonus)
  # input OrderInput { ... }
  # type Mutation {
  #   placeOrder(order: OrderInput!): Order
  # }
`;

module.exports = typeDefs;