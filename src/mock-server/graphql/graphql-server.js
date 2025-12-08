/**
 * GraphQL Server Setup
 *
 * Creates Apollo Server instance and Express middleware for the GraphQL endpoint.
 * Dynamically generates schema from OpenAPI specifications.
 */

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { generateGraphQLSchema } from './schema-generator.js';
import { createResolvers, buildSearchableFieldsMap } from './resolver-factory.js';

/**
 * Create GraphQL middleware for Express
 * @param {Array} apiSpecs - Array of loaded API spec metadata from openapi-loader
 * @returns {Promise<Function>} Express middleware function
 */
export async function createGraphQLMiddleware(apiSpecs) {
  // Build searchable fields map from schemas
  const searchableFieldsMap = buildSearchableFieldsMap(apiSpecs);

  // Generate GraphQL schema from OpenAPI specs
  console.log('  Generating GraphQL schema from OpenAPI specs...');
  const typeDefs = generateGraphQLSchema(apiSpecs);

  // Create resolvers
  console.log('  Creating GraphQL resolvers...');
  const resolvers = createResolvers(apiSpecs, searchableFieldsMap);

  // Log searchable fields for each resource
  for (const [resource, fields] of Object.entries(searchableFieldsMap)) {
    console.log(`    ${resource}: ${fields.length} searchable fields`);
  }

  // Create Apollo Server
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true, // Enable for development - allows schema exploration
    formatError: (error) => {
      // Log internal errors but return user-friendly message
      if (error.extensions?.code === 'INTERNAL_SERVER_ERROR') {
        console.error('GraphQL Internal Error:', error);
      }
      return {
        message: error.message,
        locations: error.locations,
        path: error.path,
        extensions: {
          code: error.extensions?.code || 'UNKNOWN_ERROR',
        },
      };
    },
  });

  // Start the server
  await server.start();

  // Return Express middleware
  return expressMiddleware(server, {
    context: async ({ req }) => ({
      // Add any context needed by resolvers
      headers: req.headers,
    }),
  });
}

/**
 * Get the generated GraphQL schema SDL (for debugging/inspection)
 * @param {Array} apiSpecs - Array of loaded API spec metadata
 * @returns {string} GraphQL SDL schema string
 */
export function getGraphQLSchemaSDL(apiSpecs) {
  return generateGraphQLSchema(apiSpecs);
}
