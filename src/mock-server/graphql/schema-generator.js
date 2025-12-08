/**
 * GraphQL Schema Generator
 *
 * Dynamically generates GraphQL type definitions from OpenAPI specifications.
 * Extracts all schemas and creates corresponding GraphQL types, enums, and queries.
 */

import {
  openApiTypeToGraphQL,
  sanitizeEnumValue,
  sanitizeFieldName,
  generateTypeName,
  generateEnumTypeName,
  capitalize,
  singularize,
  extractStringFieldPaths,
  isRequired,
  isArrayType,
  isEnumType,
  isObjectType,
  resolveCompositeSchema,
} from './type-converters.js';

/**
 * Generate complete GraphQL schema from API specs
 * @param {Array} apiSpecs - Array of loaded API spec metadata from openapi-loader
 * @returns {string} GraphQL SDL schema string
 */
export function generateGraphQLSchema(apiSpecs) {
  const context = {
    types: new Map(),        // typeName -> SDL string
    enums: new Map(),        // enumName -> SDL string
    inputTypes: new Map(),   // inputTypeName -> SDL string
    queryFields: [],         // Query field definitions
    searchableFields: {},    // resourceName -> string field paths
  };

  // Process each API spec
  for (const spec of apiSpecs) {
    processApiSpec(spec, context);
  }

  // Build the final schema
  return buildSchemaSDL(context, apiSpecs);
}

/**
 * Process a single API spec and generate types
 */
function processApiSpec(spec, context) {
  const resourceName = spec.name;
  const singularName = singularize(resourceName);
  const typeName = capitalize(singularName);

  // Find the main resource schema
  const mainSchema = findMainSchema(spec.schemas, singularName);

  if (!mainSchema) {
    console.warn(`No main schema found for ${resourceName}`);
    return;
  }

  // Generate the main type and all nested types
  generateTypeFromSchema(mainSchema, typeName, context);

  // Generate Connection type for pagination
  generateConnectionType(typeName, context);

  // Generate filter input type
  generateFilterInputType(mainSchema, typeName, context);

  // Extract searchable fields (all string fields)
  context.searchableFields[resourceName] = extractStringFieldPaths(mainSchema);

  // Add query fields
  context.queryFields.push(generateListQueryField(resourceName, typeName));
  context.queryFields.push(generateSingleQueryField(singularName, typeName));
}

/**
 * Find the main resource schema from the schemas object
 */
function findMainSchema(schemas, singularName) {
  if (!schemas) return null;

  // Try exact match first (Person, Household, Application)
  const capitalizedName = capitalize(singularName);
  if (schemas[capitalizedName]) {
    return schemas[capitalizedName];
  }

  // Try to find a schema that matches the pattern
  for (const [name, schema] of Object.entries(schemas)) {
    // Skip Create/Update/List variants
    if (name.endsWith('Create') || name.endsWith('Update') || name.endsWith('List')) {
      continue;
    }
    if (name.toLowerCase() === singularName.toLowerCase()) {
      return schema;
    }
  }

  return null;
}

/**
 * Generate GraphQL type from OpenAPI schema
 */
function generateTypeFromSchema(schema, typeName, context, isNested = false) {
  // Skip if already generated
  if (context.types.has(typeName)) {
    return typeName;
  }

  // Resolve composite schemas (allOf, anyOf, oneOf)
  const resolvedSchema = resolveCompositeSchema(schema);
  if (!resolvedSchema) {
    return 'String';
  }

  // Handle different schema types
  if (isEnumType(resolvedSchema)) {
    return generateEnumType(resolvedSchema, typeName, context);
  }

  if (!isObjectType(resolvedSchema)) {
    return openApiTypeToGraphQL(resolvedSchema);
  }

  // Generate object type
  const fields = [];
  const properties = resolvedSchema.properties || {};

  for (const [propName, propSchema] of Object.entries(properties)) {
    const fieldDef = generateFieldDefinition(propName, propSchema, typeName, context, resolvedSchema);
    if (fieldDef) {
      fields.push(fieldDef);
    }
  }

  if (fields.length === 0) {
    // Empty object - add a placeholder field
    fields.push('  _empty: String');
  }

  const typeDef = `type ${typeName} {\n${fields.join('\n')}\n}`;
  context.types.set(typeName, typeDef);

  return typeName;
}

/**
 * Generate a single field definition
 */
function generateFieldDefinition(propName, propSchema, parentTypeName, context, parentSchema) {
  const fieldName = sanitizeFieldName(propName);
  const required = isRequired(parentSchema, propName);

  // Resolve composite schemas
  const resolvedSchema = resolveCompositeSchema(propSchema);
  if (!resolvedSchema) {
    return `  ${fieldName}: String`;
  }

  let graphQLType;

  if (isEnumType(resolvedSchema)) {
    // Generate enum type
    const enumTypeName = `${parentTypeName}${capitalize(fieldName)}`;
    graphQLType = generateEnumType(resolvedSchema, enumTypeName, context);
  } else if (isArrayType(resolvedSchema)) {
    // Handle array types
    const itemSchema = resolvedSchema.items || { type: 'string' };
    const itemType = generateItemType(itemSchema, `${parentTypeName}${capitalize(fieldName)}Item`, context);
    graphQLType = `[${itemType}]`;
  } else if (isObjectType(resolvedSchema)) {
    // Handle nested object types
    const nestedTypeName = `${parentTypeName}${capitalize(fieldName)}`;
    graphQLType = generateTypeFromSchema(resolvedSchema, nestedTypeName, context, true);
  } else {
    // Scalar types
    graphQLType = openApiTypeToGraphQL(resolvedSchema);
  }

  // Add non-null modifier if required
  const nullability = required ? '!' : '';

  return `  ${fieldName}: ${graphQLType}${nullability}`;
}

/**
 * Generate type for array items
 */
function generateItemType(itemSchema, typeName, context) {
  const resolvedSchema = resolveCompositeSchema(itemSchema);

  if (!resolvedSchema) {
    return 'String';
  }

  if (isEnumType(resolvedSchema)) {
    return generateEnumType(resolvedSchema, typeName, context);
  }

  if (isObjectType(resolvedSchema)) {
    return generateTypeFromSchema(resolvedSchema, typeName, context, true);
  }

  return openApiTypeToGraphQL(resolvedSchema);
}

/**
 * Generate GraphQL enum type
 */
function generateEnumType(schema, typeName, context) {
  // Skip if already generated
  if (context.enums.has(typeName)) {
    return typeName;
  }

  const enumValues = (schema.enum || [])
    .map(value => `  ${sanitizeEnumValue(value)}`)
    .join('\n');

  if (!enumValues) {
    return 'String';
  }

  const enumDef = `enum ${typeName} {\n${enumValues}\n}`;
  context.enums.set(typeName, enumDef);

  return typeName;
}

/**
 * Generate Connection type for paginated results
 */
function generateConnectionType(typeName, context) {
  const connectionTypeName = `${typeName}Connection`;

  const connectionDef = `type ${connectionTypeName} {
  items: [${typeName}!]!
  total: Int!
  limit: Int!
  offset: Int!
  hasNext: Boolean!
}`;

  context.types.set(connectionTypeName, connectionDef);
}

/**
 * Generate filter input type for a resource
 */
function generateFilterInputType(schema, typeName, context) {
  const inputTypeName = `${typeName}Filter`;
  const fields = [];

  // Add common filter fields
  fields.push('  search: String');
  fields.push('  limit: Int');
  fields.push('  offset: Int');

  // Add filterable fields from schema
  const resolvedSchema = resolveCompositeSchema(schema);
  if (resolvedSchema && resolvedSchema.properties) {
    for (const [propName, propSchema] of Object.entries(resolvedSchema.properties)) {
      const fieldName = sanitizeFieldName(propName);
      const resolved = resolveCompositeSchema(propSchema);

      // Only add simple scalar and enum fields as filters
      if (resolved && !isObjectType(resolved) && !isArrayType(resolved)) {
        if (isEnumType(resolved)) {
          const enumTypeName = `${typeName}${capitalize(fieldName)}`;
          if (context.enums.has(enumTypeName)) {
            fields.push(`  ${fieldName}: ${enumTypeName}`);
          }
        } else {
          const graphQLType = openApiTypeToGraphQL(resolved);
          fields.push(`  ${fieldName}: ${graphQLType}`);
        }
      }
    }
  }

  const inputDef = `input ${inputTypeName} {\n${fields.join('\n')}\n}`;
  context.inputTypes.set(inputTypeName, inputDef);
}

/**
 * Generate list query field
 */
function generateListQueryField(resourceName, typeName) {
  const connectionType = `${typeName}Connection`;
  // Use inline arguments instead of input type for simpler querying
  return `  ${resourceName}(search: String, limit: Int, offset: Int): ${connectionType}!`;
}

/**
 * Generate single item query field
 */
function generateSingleQueryField(singularName, typeName) {
  return `  ${singularName}(id: ID!): ${typeName}`;
}

/**
 * Build the final GraphQL SDL schema
 */
function buildSchemaSDL(context, apiSpecs) {
  const parts = [];

  // Add all enum types
  for (const enumDef of context.enums.values()) {
    parts.push(enumDef);
  }

  // Add all object types
  for (const typeDef of context.types.values()) {
    parts.push(typeDef);
  }

  // Add input types
  for (const inputDef of context.inputTypes.values()) {
    parts.push(inputDef);
  }

  // Add SearchResults type for cross-resource search
  const searchResultsFields = apiSpecs
    .map(spec => `  ${spec.name}: [${capitalize(singularize(spec.name))}!]!`)
    .join('\n');

  parts.push(`type SearchResults {
${searchResultsFields}
  totalCount: Int!
}`);

  // Add Query type
  const searchQuery = '  search(query: String!, limit: Int, offset: Int): SearchResults!';
  const queryFields = [...context.queryFields, searchQuery].join('\n');

  parts.push(`type Query {\n${queryFields}\n}`);

  return parts.join('\n\n');
}

/**
 * Get searchable fields for a resource
 * @param {object} context - The context object from schema generation
 * @param {string} resourceName - The resource name
 * @returns {string[]} Array of field paths
 */
export function getSearchableFields(context, resourceName) {
  return context.searchableFields[resourceName] || [];
}
