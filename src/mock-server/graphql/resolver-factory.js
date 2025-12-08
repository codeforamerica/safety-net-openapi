/**
 * GraphQL Resolver Factory
 *
 * Creates resolvers that delegate to the existing database and search infrastructure.
 * Supports per-resource queries and cross-resource search.
 */

import { getDatabase, findById, search, findAll } from '../database-manager.js';
import { executeSearch, parsePagination } from '../search-engine.js';
import {
  capitalize,
  singularize,
  extractStringFieldPaths,
  resolveCompositeSchema,
} from './type-converters.js';

/**
 * Create all resolvers for the GraphQL schema
 * @param {Array} apiSpecs - Array of loaded API spec metadata
 * @param {Object} searchableFieldsMap - Map of resourceName -> string field paths
 * @returns {Object} GraphQL resolvers object
 */
export function createResolvers(apiSpecs, searchableFieldsMap) {
  const resolvers = {
    Query: {},
  };

  // Create resolvers for each resource
  for (const spec of apiSpecs) {
    const resourceName = spec.name;
    const singularName = singularize(resourceName);
    const searchableFields = searchableFieldsMap[resourceName] || [];

    // List query resolver (e.g., persons, households, applications)
    resolvers.Query[resourceName] = createListResolver(resourceName, searchableFields, spec.pagination);

    // Single item query resolver (e.g., person, household, application)
    resolvers.Query[singularName] = createSingleResolver(resourceName);
  }

  // Cross-resource search resolver
  resolvers.Query.search = createCrossResourceSearchResolver(apiSpecs, searchableFieldsMap);

  // Add relationship resolvers
  addRelationshipResolvers(resolvers, apiSpecs);

  return resolvers;
}

/**
 * Create a list query resolver for a resource
 */
function createListResolver(resourceName, searchableFields, paginationConfig) {
  const defaults = {
    limitDefault: paginationConfig?.limitDefault || 25,
    limitMax: paginationConfig?.limitMax || 100,
    offsetDefault: paginationConfig?.offsetDefault || 0,
  };

  return (parent, args, context, info) => {
    const { search: searchQuery, limit, offset, ...filters } = args;

    // Use search if query provided, otherwise use findAll with filters
    if (searchQuery && searchableFields.length > 0) {
      const result = searchWithPagination(
        resourceName,
        searchQuery,
        searchableFields,
        { limit, offset },
        defaults,
        filters
      );
      return result;
    }

    // No search query - use executeSearch which handles filters
    const db = getDatabase(resourceName);
    const queryParams = {
      limit,
      offset,
      ...filters,
    };

    const result = executeSearch(db, queryParams, searchableFields, defaults);

    return {
      items: result.items || [],
      total: result.total || 0,
      limit: result.limit || defaults.limitDefault,
      offset: result.offset || defaults.offsetDefault,
      hasNext: result.hasNext || false,
    };
  };
}

/**
 * Search with pagination and optional filters
 */
function searchWithPagination(resourceName, query, searchableFields, pagination, defaults, filters) {
  const db = getDatabase(resourceName);

  // Build query params combining search and filters
  const queryParams = {
    search: query,
    limit: pagination.limit,
    offset: pagination.offset,
    ...filters,
  };

  const result = executeSearch(db, queryParams, searchableFields, defaults);

  return {
    items: result.items || [],
    total: result.total || 0,
    limit: result.limit || defaults.limitDefault,
    offset: result.offset || defaults.offsetDefault,
    hasNext: result.hasNext || false,
  };
}

/**
 * Create a single item query resolver
 */
function createSingleResolver(resourceName) {
  return (parent, args, context, info) => {
    const { id } = args;
    return findById(resourceName, id);
  };
}

/**
 * Create the cross-resource search resolver
 */
function createCrossResourceSearchResolver(apiSpecs, searchableFieldsMap) {
  return (parent, args, context, info) => {
    const { query, limit = 10, offset = 0 } = args;

    const results = {};
    let totalCount = 0;

    // Search each resource
    for (const spec of apiSpecs) {
      const resourceName = spec.name;
      const searchableFields = searchableFieldsMap[resourceName] || [];

      if (searchableFields.length === 0) {
        results[resourceName] = [];
        continue;
      }

      const db = getDatabase(resourceName);
      const queryParams = {
        search: query,
        limit,
        offset: 0, // Always start at 0 for cross-resource search
      };

      const searchResult = executeSearch(
        db,
        queryParams,
        searchableFields,
        { limitDefault: limit, limitMax: 100, offsetDefault: 0 }
      );

      results[resourceName] = searchResult.items || [];
      totalCount += searchResult.total || 0;
    }

    return {
      ...results,
      totalCount,
    };
  };
}

/**
 * Add relationship resolvers dynamically based on schema analysis
 * Detects fields ending in 'Id' with format: uuid and creates resolvers
 */
function addRelationshipResolvers(resolvers, apiSpecs, generatedTypeNames) {
  // Build a map of available resources (pluralized names)
  const resourceMap = new Map();
  for (const spec of apiSpecs) {
    const singularName = singularize(spec.name);
    resourceMap.set(singularName.toLowerCase(), spec.name);
  }

  // For now, skip automatic relationship resolution to avoid schema mismatches
  // Relationships can be queried by fetching the related ID and making a separate query
  // This keeps the implementation simple and avoids hardcoding type names
}

/**
 * Build searchable fields map from API specs
 * Extracts all string fields from each resource's schema
 * @param {Array} apiSpecs - Array of loaded API spec metadata
 * @returns {Object} Map of resourceName -> string field paths
 */
export function buildSearchableFieldsMap(apiSpecs) {
  const searchableFieldsMap = {};

  for (const spec of apiSpecs) {
    const resourceName = spec.name;
    const singularName = singularize(resourceName);
    const capitalizedName = capitalize(singularName);

    // Find the main schema
    const mainSchema = findMainSchema(spec.schemas, singularName);

    if (mainSchema) {
      searchableFieldsMap[resourceName] = extractStringFieldPaths(mainSchema);
    } else {
      searchableFieldsMap[resourceName] = [];
    }
  }

  return searchableFieldsMap;
}

/**
 * Find the main resource schema from the schemas object
 */
function findMainSchema(schemas, singularName) {
  if (!schemas) return null;

  const capitalizedName = capitalize(singularName);
  if (schemas[capitalizedName]) {
    return schemas[capitalizedName];
  }

  for (const [name, schema] of Object.entries(schemas)) {
    if (name.endsWith('Create') || name.endsWith('Update') || name.endsWith('List')) {
      continue;
    }
    if (name.toLowerCase() === singularName.toLowerCase()) {
      return schema;
    }
  }

  return null;
}
