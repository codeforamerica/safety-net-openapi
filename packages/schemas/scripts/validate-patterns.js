#!/usr/bin/env node
/**
 * API Pattern Validation Script
 *
 * Validates that OpenAPI specs follow our established API design patterns:
 * - Search: List endpoints must use SearchQueryParam
 * - Pagination: List endpoints must have LimitParam and OffsetParam
 * - List Response: Must have items, total, limit, offset, hasNext
 * - Consistent HTTP methods and response codes
 *
 * This complements Spectral's OpenAPI linting with business-specific rules.
 */

import { readdir } from 'fs/promises';
import { join, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import $RefParser from '@apidevtools/json-schema-ref-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = join(__dirname, '..');

// =============================================================================
// Pattern Validation Rules
// =============================================================================

/**
 * Validates that list endpoints (collection GET) have required parameters
 */
function validateListEndpointParameters(path, operation, errors) {
  const params = operation.parameters || [];

  // Check for $ref patterns in parameters
  const paramRefs = params
    .filter(p => p.$ref)
    .map(p => p.$ref);

  const paramNames = params
    .filter(p => p.name)
    .map(p => p.name);

  // Must have SearchQueryParam (by ref or by name 'q')
  const hasSearchParam = paramRefs.some(ref => ref.includes('SearchQueryParam')) ||
                         paramNames.includes('q');
  if (!hasSearchParam) {
    errors.push({
      path,
      rule: 'list-endpoint-search-param',
      message: `GET ${path} must reference SearchQueryParam or have 'q' parameter`,
      severity: 'error'
    });
  }

  // Must have LimitParam
  const hasLimitParam = paramRefs.some(ref => ref.includes('LimitParam')) ||
                        paramNames.includes('limit');
  if (!hasLimitParam) {
    errors.push({
      path,
      rule: 'list-endpoint-limit-param',
      message: `GET ${path} must reference LimitParam or have 'limit' parameter`,
      severity: 'error'
    });
  }

  // Must have OffsetParam
  const hasOffsetParam = paramRefs.some(ref => ref.includes('OffsetParam')) ||
                         paramNames.includes('offset');
  if (!hasOffsetParam) {
    errors.push({
      path,
      rule: 'list-endpoint-offset-param',
      message: `GET ${path} must reference OffsetParam or have 'offset' parameter`,
      severity: 'error'
    });
  }
}

/**
 * Validates that list endpoint responses have required properties
 */
function validateListResponseSchema(path, operation, errors) {
  const response200 = operation.responses?.['200'];
  if (!response200) {
    errors.push({
      path,
      rule: 'list-endpoint-200-response',
      message: `GET ${path} must have a 200 response`,
      severity: 'error'
    });
    return;
  }

  const schema = response200.content?.['application/json']?.schema;
  if (!schema) {
    errors.push({
      path,
      rule: 'list-endpoint-response-schema',
      message: `GET ${path} 200 response must have application/json schema`,
      severity: 'error'
    });
    return;
  }

  // If schema is a $ref, we can't validate properties here (would need dereferencing)
  // Skip property validation for referenced schemas
  if (schema.$ref) {
    return;
  }

  const properties = schema.properties || {};
  const requiredProps = ['items', 'total', 'limit', 'offset'];

  for (const prop of requiredProps) {
    if (!properties[prop]) {
      errors.push({
        path,
        rule: `list-endpoint-response-${prop}`,
        message: `GET ${path} 200 response schema must have '${prop}' property`,
        severity: 'error'
      });
    }
  }

  // hasNext is recommended but not required
  if (!properties.hasNext) {
    errors.push({
      path,
      rule: 'list-endpoint-response-hasNext',
      message: `GET ${path} 200 response schema should have 'hasNext' property`,
      severity: 'warn'
    });
  }

  // items must be an array
  if (properties.items && properties.items.type !== 'array') {
    errors.push({
      path,
      rule: 'list-endpoint-items-array',
      message: `GET ${path} 'items' property must be an array`,
      severity: 'error'
    });
  }
}

/**
 * Validates POST endpoint patterns
 */
function validatePostEndpoint(path, operation, errors) {
  // Must have Location header in 201 response
  const response201 = operation.responses?.['201'];
  if (response201 && !response201.headers?.Location) {
    errors.push({
      path,
      rule: 'post-location-header',
      message: `POST ${path} 201 response should have Location header`,
      severity: 'warn'
    });
  }

  // Must have request body
  if (!operation.requestBody) {
    errors.push({
      path,
      rule: 'post-request-body',
      message: `POST ${path} must have a request body`,
      severity: 'error'
    });
  }
}

/**
 * Validates PATCH endpoint patterns
 */
function validatePatchEndpoint(path, operation, errors) {
  // Must have request body
  if (!operation.requestBody) {
    errors.push({
      path,
      rule: 'patch-request-body',
      message: `PATCH ${path} must have a request body`,
      severity: 'error'
    });
  }

  // Must return 200 with updated resource
  if (!operation.responses?.['200']) {
    errors.push({
      path,
      rule: 'patch-200-response',
      message: `PATCH ${path} must return 200 with updated resource`,
      severity: 'error'
    });
  }
}

/**
 * Validates that single-resource GET endpoints have proper error handling
 */
function validateSingleResourceGet(path, operation, errors) {
  // Must handle 404
  if (!operation.responses?.['404']) {
    errors.push({
      path,
      rule: 'get-single-404',
      message: `GET ${path} must handle 404 Not Found`,
      severity: 'error'
    });
  }
}

/**
 * Validates that error responses use shared response definitions
 */
function validateSharedErrorResponses(path, method, operation, errors) {
  const responses = operation.responses || {};

  // Check 400 Bad Request
  if (responses['400'] && !responses['400'].$ref) {
    errors.push({
      path,
      rule: 'shared-400-response',
      message: `${method.toUpperCase()} ${path} 400 response should use shared $ref (e.g., ./components/common-responses.yaml#/BadRequest)`,
      severity: 'warn'
    });
  }

  // Check 404 Not Found
  if (responses['404'] && !responses['404'].$ref) {
    errors.push({
      path,
      rule: 'shared-404-response',
      message: `${method.toUpperCase()} ${path} 404 response should use shared $ref (e.g., ./components/common-responses.yaml#/NotFound)`,
      severity: 'warn'
    });
  }

  // Check 500 Internal Server Error
  if (responses['500'] && !responses['500'].$ref) {
    errors.push({
      path,
      rule: 'shared-500-response',
      message: `${method.toUpperCase()} ${path} 500 response should use shared $ref (e.g., ./components/common-responses.yaml#/InternalError)`,
      severity: 'warn'
    });
  }
}

/**
 * Main validation function for a single spec
 */
function validateSpec(spec, specName) {
  const errors = [];

  if (!spec.paths) {
    return errors;
  }

  for (const [path, methods] of Object.entries(spec.paths)) {
    const isCollectionPath = !path.includes('{');
    const isSingleResourcePath = path.includes('{');

    // Validate GET endpoints
    if (methods.get) {
      if (isCollectionPath) {
        // List endpoint validations
        validateListEndpointParameters(path, methods.get, errors);
        validateListResponseSchema(path, methods.get, errors);
      } else if (isSingleResourcePath) {
        // Single resource GET validations
        validateSingleResourceGet(path, methods.get, errors);
      }
    }

    // Validate POST endpoints
    if (methods.post) {
      validatePostEndpoint(path, methods.post, errors);
      validateSharedErrorResponses(path, 'post', methods.post, errors);
    }

    // Validate PATCH endpoints
    if (methods.patch) {
      validatePatchEndpoint(path, methods.patch, errors);
      validateSharedErrorResponses(path, 'patch', methods.patch, errors);
    }

    // Validate DELETE endpoints
    if (methods.delete) {
      validateSharedErrorResponses(path, 'delete', methods.delete, errors);
    }

    // Validate GET endpoints for shared error responses
    if (methods.get) {
      validateSharedErrorResponses(path, 'get', methods.get, errors);
    }
  }

  return errors.map(e => ({ ...e, spec: specName }));
}

// =============================================================================
// Main Script
// =============================================================================

async function findOpenAPISpecs(directory) {
  const specs = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (ext === '.yaml' || ext === '.yml' || ext === '.json') {
        specs.push(join(directory, entry.name));
      }
    }
  }

  return specs;
}

async function main() {
  // Check for --dir argument to override default directory
  const args = process.argv.slice(2);
  const dirArgIndex = args.indexOf('--dir');
  let openAPIDir;

  if (dirArgIndex !== -1 && args[dirArgIndex + 1]) {
    openAPIDir = args[dirArgIndex + 1];
  } else {
    openAPIDir = join(workspaceRoot, 'openapi');
  }

  console.log('🔍 Validating API design patterns...\n');
  console.log(`   Directory: ${openAPIDir}\n`);

  try {
    const specPaths = await findOpenAPISpecs(openAPIDir);

    if (specPaths.length === 0) {
      console.log('⚠️  No OpenAPI specifications found.');
      return;
    }

    let allErrors = [];
    let allWarnings = [];

    for (const specPath of specPaths) {
      const specName = basename(specPath);
      console.log(`📋 Checking ${specName}...`);

      try {
        // Parse spec (without full dereferencing to keep $refs visible)
        const spec = await $RefParser.parse(specPath);
        const issues = validateSpec(spec, specName);

        const errors = issues.filter(i => i.severity === 'error');
        const warnings = issues.filter(i => i.severity === 'warn');

        allErrors.push(...errors);
        allWarnings.push(...warnings);

        if (errors.length === 0 && warnings.length === 0) {
          console.log(`   ✅ All patterns valid\n`);
        } else {
          if (errors.length > 0) {
            console.log(`   ❌ ${errors.length} error(s)`);
          }
          if (warnings.length > 0) {
            console.log(`   ⚠️  ${warnings.length} warning(s)`);
          }
          console.log('');
        }
      } catch (error) {
        console.error(`   ❌ Failed to parse: ${error.message}\n`);
        allErrors.push({
          spec: specName,
          rule: 'parse-error',
          message: error.message,
          severity: 'error'
        });
      }
    }

    // Summary
    console.log('─'.repeat(60));
    console.log('📊 Summary\n');

    if (allErrors.length > 0) {
      console.log('❌ Errors:\n');
      for (const error of allErrors) {
        console.log(`   [${error.spec}] ${error.rule}`);
        console.log(`   ${error.message}`);
        if (error.path) {
          console.log(`   Path: ${error.path}`);
        }
        console.log('');
      }
    }

    if (allWarnings.length > 0) {
      console.log('⚠️  Warnings:\n');
      for (const warning of allWarnings) {
        console.log(`   [${warning.spec}] ${warning.rule}`);
        console.log(`   ${warning.message}`);
        if (warning.path) {
          console.log(`   Path: ${warning.path}`);
        }
        console.log('');
      }
    }

    if (allErrors.length === 0 && allWarnings.length === 0) {
      console.log('✅ All API design patterns are valid!\n');
    }

    console.log(`Total: ${allErrors.length} error(s), ${allWarnings.length} warning(s)`);

    if (allErrors.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Validation failed:', error.message);
    process.exit(1);
  }
}

main();
