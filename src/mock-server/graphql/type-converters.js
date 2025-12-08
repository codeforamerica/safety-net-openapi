/**
 * OpenAPI to GraphQL Type Converters
 *
 * Maps OpenAPI schema types to GraphQL type definitions
 */

/**
 * Convert OpenAPI type to GraphQL scalar type
 */
export function openApiTypeToGraphQL(schema) {
  if (!schema) return 'String';

  const { type, format, $ref } = schema;

  // Handle format-specific mappings first
  if (format === 'uuid') return 'ID';
  if (format === 'date' || format === 'date-time') return 'String';
  if (format === 'email' || format === 'uri') return 'String';

  // Handle basic type mappings
  switch (type) {
    case 'string':
      return 'String';
    case 'integer':
      return 'Int';
    case 'number':
      return 'Float';
    case 'boolean':
      return 'Boolean';
    default:
      return 'String';
  }
}

/**
 * Convert an OpenAPI enum to a valid GraphQL enum name
 * GraphQL enum values must match [_A-Za-z][_0-9A-Za-z]*
 * We preserve the original case where possible to match database values
 */
export function sanitizeEnumValue(value) {
  if (typeof value !== 'string') {
    return String(value);
  }

  // Replace hyphens, spaces, and dots with underscores, but preserve case
  let sanitized = value
    .replace(/[-\s.]/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');

  // Ensure it starts with a letter or underscore
  if (/^[0-9]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }

  return sanitized || 'unknown';
}

/**
 * Convert a property name to a valid GraphQL field name
 * GraphQL field names must match [_A-Za-z][_0-9A-Za-z]*
 */
export function sanitizeFieldName(name) {
  if (!name) return 'unknown';

  // Replace invalid characters with underscores
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');

  // Ensure it starts with a letter or underscore
  if (/^[0-9]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }

  return sanitized;
}

/**
 * Generate a valid GraphQL type name from a schema name
 */
export function generateTypeName(baseName, prefix = '') {
  const name = prefix ? `${prefix}${capitalize(baseName)}` : baseName;

  // Ensure valid GraphQL type name
  let sanitized = name
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/^[0-9]/, '_$&');

  return capitalize(sanitized);
}

/**
 * Generate a GraphQL enum type name
 */
export function generateEnumTypeName(fieldPath) {
  const parts = fieldPath.split('.');
  return parts.map(p => capitalize(p)).join('') + 'Enum';
}

/**
 * Capitalize the first letter of a string
 */
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert a resource name to its singular form (simple implementation)
 */
export function singularize(name) {
  if (!name) return '';

  // Handle common cases
  if (name.endsWith('ies')) {
    return name.slice(0, -3) + 'y';
  }
  if (name.endsWith('es') && (name.endsWith('sses') || name.endsWith('xes') || name.endsWith('zes') || name.endsWith('ches') || name.endsWith('shes'))) {
    return name.slice(0, -2);
  }
  if (name.endsWith('s') && !name.endsWith('ss')) {
    return name.slice(0, -1);
  }

  return name;
}

/**
 * Extract all string field paths from a schema (for searchable fields)
 * Returns paths like ['name.firstName', 'address.city']
 */
export function extractStringFieldPaths(schema, prefix = '', maxDepth = 4) {
  const paths = [];

  if (!schema || maxDepth <= 0) return paths;

  if (schema.type === 'object' && schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const path = prefix ? `${prefix}.${propName}` : propName;

      if (propSchema.type === 'string' && !propSchema.enum) {
        // It's a plain string field - add to searchable
        paths.push(path);
      } else if (propSchema.type === 'object' && propSchema.properties) {
        // Recurse into nested objects
        paths.push(...extractStringFieldPaths(propSchema, path, maxDepth - 1));
      }
    }
  }

  return paths;
}

/**
 * Check if a schema property is required
 */
export function isRequired(schema, propName) {
  return schema.required && schema.required.includes(propName);
}

/**
 * Check if a schema represents an array type
 */
export function isArrayType(schema) {
  return schema && schema.type === 'array';
}

/**
 * Check if a schema represents an enum type
 */
export function isEnumType(schema) {
  return schema && schema.enum && Array.isArray(schema.enum);
}

/**
 * Check if a schema represents an object type
 */
export function isObjectType(schema) {
  return schema && (schema.type === 'object' || schema.properties);
}

/**
 * Get the base schema from allOf/anyOf/oneOf constructs
 */
export function resolveCompositeSchema(schema) {
  if (!schema) return null;

  // Handle allOf by merging
  if (schema.allOf && Array.isArray(schema.allOf)) {
    const merged = { type: 'object', properties: {}, required: [] };
    for (const subSchema of schema.allOf) {
      const resolved = resolveCompositeSchema(subSchema);
      if (resolved) {
        if (resolved.properties) {
          merged.properties = { ...merged.properties, ...resolved.properties };
        }
        if (resolved.required) {
          merged.required = [...merged.required, ...resolved.required];
        }
      }
    }
    return merged;
  }

  // For anyOf/oneOf, just use the first option for simplicity
  if (schema.anyOf && Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return resolveCompositeSchema(schema.anyOf[0]);
  }

  if (schema.oneOf && Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return resolveCompositeSchema(schema.oneOf[0]);
  }

  return schema;
}
