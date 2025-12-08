/**
 * Dynamic GraphQL Integration Tests
 *
 * Auto-discovers all APIs and runs GraphQL-specific tests against each.
 * Tests adapt to each API's schema automatically - no hardcoded resource names.
 *
 * Run with: npm run test:integration
 */

import http from 'http';
import { URL } from 'url';
import { startMockServer, stopServer, isServerRunning } from '../../../scripts/mock-server/server.js';
import { discoverApiSpecs } from '../../../src/mock-server/openapi-loader.js';
import { clearAll } from '../../../src/mock-server/database-manager.js';
import { seedDatabase } from '../../../src/mock-server/seeder.js';
import { singularize } from '../../../src/mock-server/graphql/type-converters.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'http://localhost:1080';
const GRAPHQL_URL = `${BASE_URL}/graphql`;
let serverStartedByTests = false;

/**
 * Simple HTTP client for GraphQL requests
 */
async function graphqlQuery(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(GRAPHQL_URL);
    const body = JSON.stringify({ query, variables });

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            status: res.statusCode,
            data: parsed.data,
            errors: parsed.errors,
          });
        } catch (e) {
          resolve({ status: res.statusCode, data: null, errors: [{ message: 'Invalid JSON response' }] });
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.write(body);
    req.end();
  });
}

/**
 * Load examples for an API to get sample IDs
 */
function loadExamples(apiName) {
  try {
    const examplesPath = join(__dirname, '../../../openapi/examples', `${apiName}.yaml`);
    const content = readFileSync(examplesPath, 'utf8');
    const examples = yaml.load(content) || {};

    return Object.entries(examples)
      .filter(([key, value]) => {
        if (!value || typeof value !== 'object') return false;
        if (value.items && Array.isArray(value.items)) return false;
        if (key.toLowerCase().includes('payload') || key.toLowerCase().includes('list')) return false;
        return value.id;
      })
      .map(([key, value]) => ({ key, data: value }));
  } catch (error) {
    return [];
  }
}

/**
 * Run GraphQL test suite for a single API
 */
async function testApiGraphQL(api, examples) {
  const resourceName = api.name;
  const singularName = singularize(resourceName);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing GraphQL for: ${resourceName}`);
  console.log(`${'='.repeat(70)}`);

  let passed = 0;
  let failed = 0;

  // Test 1: List query with pagination
  try {
    console.log(`\n  1. ${resourceName}(limit, offset) - list with pagination`);
    const query = `{ ${resourceName}(limit: 2, offset: 0) { items { id } total limit offset hasNext } }`;
    const result = await graphqlQuery(query);

    if (!result.errors && result.data && result.data[resourceName]) {
      const data = result.data[resourceName];
      if (Array.isArray(data.items) && typeof data.total === 'number' && typeof data.hasNext === 'boolean') {
        console.log(`     ✓ PASS: Returns paginated list`);
        console.log(`       Items: ${data.items.length}, Total: ${data.total}, HasNext: ${data.hasNext}`);
        passed++;
      } else {
        console.log(`     ✗ FAIL: Missing pagination fields`);
        failed++;
      }
    } else {
      console.log(`     ✗ FAIL: Query error - ${result.errors?.[0]?.message || 'Unknown error'}`);
      failed++;
    }
  } catch (error) {
    console.log(`     ✗ FAIL: ${error.message}`);
    failed++;
  }

  // Test 2: List query with search
  try {
    console.log(`\n  2. ${resourceName}(search: "..") - search query`);
    const query = `{ ${resourceName}(search: "a", limit: 5) { items { id } total } }`;
    const result = await graphqlQuery(query);

    if (!result.errors && result.data && result.data[resourceName]) {
      console.log(`     ✓ PASS: Search returns results`);
      console.log(`       Items: ${result.data[resourceName].items.length}`);
      passed++;
    } else {
      console.log(`     ✗ FAIL: Search error - ${result.errors?.[0]?.message || 'Unknown error'}`);
      failed++;
    }
  } catch (error) {
    console.log(`     ✗ FAIL: ${error.message}`);
    failed++;
  }

  // Test 3: Single item query (if examples exist)
  if (examples.length > 0) {
    try {
      console.log(`\n  3. ${singularName}(id: "...") - get by ID`);
      const exampleId = examples[0].data.id;
      const query = `{ ${singularName}(id: "${exampleId}") { id } }`;
      const result = await graphqlQuery(query);

      if (!result.errors && result.data && result.data[singularName]) {
        const item = result.data[singularName];
        if (item.id === exampleId) {
          console.log(`     ✓ PASS: Returns correct item`);
          console.log(`       ID: ${exampleId}`);
          passed++;
        } else {
          console.log(`     ✗ FAIL: Returned wrong ID`);
          failed++;
        }
      } else if (result.data && result.data[singularName] === null) {
        console.log(`     ✗ FAIL: Item not found`);
        failed++;
      } else {
        console.log(`     ✗ FAIL: Query error - ${result.errors?.[0]?.message || 'Unknown error'}`);
        failed++;
      }
    } catch (error) {
      console.log(`     ✗ FAIL: ${error.message}`);
      failed++;
    }
  } else {
    console.log(`\n  3. ${singularName}(id: "...") - SKIPPED (no examples)`);
  }

  // Test 4: Single item query - returns null for unknown ID
  try {
    console.log(`\n  4. ${singularName}(id: unknown) - returns null`);
    const unknownId = '00000000-0000-0000-0000-000000000000';
    const query = `{ ${singularName}(id: "${unknownId}") { id } }`;
    const result = await graphqlQuery(query);

    if (!result.errors && result.data && result.data[singularName] === null) {
      console.log(`     ✓ PASS: Returns null for unknown ID`);
      passed++;
    } else if (result.data && result.data[singularName]) {
      console.log(`     ✗ FAIL: Should return null for unknown ID`);
      failed++;
    } else {
      console.log(`     ✗ FAIL: Query error - ${result.errors?.[0]?.message || 'Unknown error'}`);
      failed++;
    }
  } catch (error) {
    console.log(`     ✗ FAIL: ${error.message}`);
    failed++;
  }

  return { passed, failed, total: passed + failed };
}

/**
 * Test cross-resource search
 */
async function testCrossResourceSearch(apis) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing Cross-Resource Search`);
  console.log(`${'='.repeat(70)}`);

  let passed = 0;
  let failed = 0;

  // Build dynamic query for all resources
  const resourceFields = apis.map(api => `${api.name} { id }`).join(' ');

  // Test 1: Cross-resource search returns results for all resources
  try {
    console.log(`\n  1. search(query: "..") - cross-resource search`);
    const query = `{ search(query: "a", limit: 5) { ${resourceFields} totalCount } }`;
    const result = await graphqlQuery(query);

    if (!result.errors && result.data && result.data.search) {
      const searchResult = result.data.search;

      // Verify all resources are present in results
      let allPresent = true;
      for (const api of apis) {
        if (!(api.name in searchResult)) {
          allPresent = false;
          break;
        }
      }

      if (allPresent && typeof searchResult.totalCount === 'number') {
        console.log(`     ✓ PASS: Returns results for all resources`);
        console.log(`       Total count: ${searchResult.totalCount}`);
        for (const api of apis) {
          const items = searchResult[api.name] || [];
          console.log(`       ${api.name}: ${items.length} results`);
        }
        passed++;
      } else {
        console.log(`     ✗ FAIL: Missing resources or totalCount`);
        failed++;
      }
    } else {
      console.log(`     ✗ FAIL: Query error - ${result.errors?.[0]?.message || 'Unknown error'}`);
      failed++;
    }
  } catch (error) {
    console.log(`     ✗ FAIL: ${error.message}`);
    failed++;
  }

  return { passed, failed, total: passed + failed };
}

/**
 * Test schema introspection
 */
async function testIntrospection(apis) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing Schema Introspection`);
  console.log(`${'='.repeat(70)}`);

  let passed = 0;
  let failed = 0;

  // Test 1: Introspection query works
  try {
    console.log(`\n  1. __schema introspection`);
    const query = `{ __schema { queryType { name } types { name } } }`;
    const result = await graphqlQuery(query);

    if (!result.errors && result.data && result.data.__schema) {
      const schema = result.data.__schema;
      if (schema.queryType && schema.types) {
        console.log(`     ✓ PASS: Introspection enabled`);
        console.log(`       Types: ${schema.types.length}`);
        passed++;
      } else {
        console.log(`     ✗ FAIL: Incomplete introspection data`);
        failed++;
      }
    } else {
      console.log(`     ✗ FAIL: Introspection error - ${result.errors?.[0]?.message || 'Unknown error'}`);
      failed++;
    }
  } catch (error) {
    console.log(`     ✗ FAIL: ${error.message}`);
    failed++;
  }

  // Test 2: Verify discovered resources exist in schema
  try {
    console.log(`\n  2. Schema includes all discovered resources`);
    const query = `{ __schema { types { name } } }`;
    const result = await graphqlQuery(query);

    if (!result.errors && result.data && result.data.__schema) {
      const typeNames = result.data.__schema.types.map(t => t.name);

      let allFound = true;
      const missing = [];

      for (const api of apis) {
        const singularName = singularize(api.name);
        const capitalizedName = singularName.charAt(0).toUpperCase() + singularName.slice(1);
        const connectionType = `${capitalizedName}Connection`;

        if (!typeNames.includes(connectionType)) {
          allFound = false;
          missing.push(connectionType);
        }
      }

      if (allFound) {
        console.log(`     ✓ PASS: All resource types found in schema`);
        passed++;
      } else {
        console.log(`     ✗ FAIL: Missing types: ${missing.join(', ')}`);
        failed++;
      }
    } else {
      console.log(`     ✗ FAIL: Introspection error`);
      failed++;
    }
  } catch (error) {
    console.log(`     ✗ FAIL: ${error.message}`);
    failed++;
  }

  return { passed, failed, total: passed + failed };
}

/**
 * Test error handling
 */
async function testErrorHandling() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing Error Handling`);
  console.log(`${'='.repeat(70)}`);

  let passed = 0;
  let failed = 0;

  // Test 1: Invalid field returns error
  try {
    console.log(`\n  1. Invalid field query returns error`);
    const query = `{ nonExistentField { id } }`;
    const result = await graphqlQuery(query);

    if (result.errors && result.errors.length > 0) {
      console.log(`     ✓ PASS: Returns error for invalid field`);
      console.log(`       Error: ${result.errors[0].message.substring(0, 50)}...`);
      passed++;
    } else {
      console.log(`     ✗ FAIL: Should return error for invalid field`);
      failed++;
    }
  } catch (error) {
    console.log(`     ✗ FAIL: ${error.message}`);
    failed++;
  }

  // Test 2: Malformed query returns error
  try {
    console.log(`\n  2. Malformed query returns error`);
    const query = `{ this is not valid graphql }`;
    const result = await graphqlQuery(query);

    if (result.errors && result.errors.length > 0) {
      console.log(`     ✓ PASS: Returns error for malformed query`);
      passed++;
    } else {
      console.log(`     ✗ FAIL: Should return error for malformed query`);
      failed++;
    }
  } catch (error) {
    console.log(`     ✗ FAIL: ${error.message}`);
    failed++;
  }

  return { passed, failed, total: passed + failed };
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('Dynamic GraphQL Integration Tests\n');
  console.log('='.repeat(70));

  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;

  // Start server if needed
  try {
    console.log('\n🔍 Checking if mock server is running...');
    const isRunning = await isServerRunning();

    if (isRunning) {
      console.log('  ✓ Mock server already running');
    } else {
      console.log('  ⚠️  Mock server not running, starting it now...\n');
      await startMockServer();
      serverStartedByTests = true;
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('  ✓ Mock server started successfully');
    }
  } catch (error) {
    console.log(`  ✗ FAIL: Cannot start server`);
    console.log(`    Error: ${error.message}`);
    process.exit(1);
  }

  // Discover all APIs
  console.log('\n🔍 Discovering APIs...');
  const apis = discoverApiSpecs();

  if (apis.length === 0) {
    console.log('  ⚠️  No APIs found');
    process.exit(0);
  }

  console.log(`  ✓ Found ${apis.length} API(s):`);
  apis.forEach(api => console.log(`    - ${api.name}`));

  // Reset databases with fresh data
  console.log('\n🔄 Resetting databases with clean example data...');
  for (const api of apis) {
    try {
      clearAll(api.name);
      const count = seedDatabase(api.name);
      console.log(`  ✓ ${api.name}: ${count} resources`);
    } catch (error) {
      console.log(`  ⚠️  ${api.name}: ${error.message}`);
    }
  }
  console.log('  ✓ All databases reset');

  // Test each API's GraphQL queries
  for (const api of apis) {
    const examples = loadExamples(api.name);
    const results = await testApiGraphQL(api, examples);

    totalPassed += results.passed;
    totalFailed += results.failed;
    totalTests += results.total;
  }

  // Test cross-resource search
  const searchResults = await testCrossResourceSearch(apis);
  totalPassed += searchResults.passed;
  totalFailed += searchResults.failed;
  totalTests += searchResults.total;

  // Test introspection
  const introspectionResults = await testIntrospection(apis);
  totalPassed += introspectionResults.passed;
  totalFailed += introspectionResults.failed;
  totalTests += introspectionResults.total;

  // Test error handling
  const errorResults = await testErrorHandling();
  totalPassed += errorResults.passed;
  totalFailed += errorResults.failed;
  totalTests += errorResults.total;

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('GraphQL Integration Test Summary');
  console.log('='.repeat(70));
  console.log(`APIs tested: ${apis.length}`);
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);

  // Cleanup
  if (serverStartedByTests) {
    console.log('\n🧹 Cleaning up (stopping server started by tests)...\n');
    await stopServer(false);
  }

  if (totalFailed > 0) {
    console.log('\n❌ Some GraphQL tests failed\n');
    process.exit(1);
  } else {
    console.log('\n✓ All GraphQL integration tests passed!\n');
  }
}

runTests().catch(async (error) => {
  console.error('Test runner error:', error);

  if (serverStartedByTests) {
    console.log('\n🧹 Cleaning up (stopping server started by tests)...\n');
    await stopServer(false);
  }

  process.exit(1);
});
