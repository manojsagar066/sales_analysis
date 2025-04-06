// src/index.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const cors = require('cors');
const { json } = require('body-parser');

const typeDefs = require('./graphql/schema');
const resolvers = require('./graphql/resolvers');

const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 4000;

async function startServer() {
  const app = express();
  // Our httpServer handles incoming requests to our Express app.
  // Below, we configure Apollo Server to drain this httpServer,
  // enabling our servers to shut down gracefully.
  const httpServer = http.createServer(app);

  // Same ApolloServer initialization as before, plus the drain plugin
  // for graceful shutdown.
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    // Enable introspection for development/testing (default is true unless NODE_ENV=production)
    introspection: process.env.NODE_ENV !== 'production',
    // Consider adding plugins like ApolloServerPluginDrainHttpServer for graceful shutdowns
  });

  // Ensure we wait for our server to start
  await server.start();

  // Set up our Express middleware to handle CORS, body parsing,
  // and our expressMiddleware function.
  app.use(
    '/graphql', // Endpoint for GraphQL
    cors(), // Allow requests from frontend origins
    json(), // Body parsing middleware
    // expressMiddleware accepts the same arguments:
    // an Apollo Server instance and optional configuration options
    expressMiddleware(server, {
      context: async ({ req }) => {
        // Basic context; you could add authentication info here
        return { token: req.headers.authorization };
      },
    }),
  );

  // Connect to MongoDB
  if (!MONGODB_URI) {
    console.error('FATAL ERROR: MONGODB_URI is not defined in the environment variables.');
    process.exit(1); // Exit if DB connection string is missing
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`🌿 MongoDB connected successfully`);

    // Modified server startup
    await new Promise((resolve) => httpServer.listen({ port: PORT }, resolve));
    console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);

  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1); // Exit if DB connection fails
  }
}

startServer();