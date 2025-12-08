/**
 * Unit tests for GraphQL schema generator
 * Tests dynamic schema generation from OpenAPI specs
 * Run with: node tests/mock-server/unit/graphql-schema-generator.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert';

import { generateGraphQLSchema } from '../../../src/mock-server/graphql/schema-generator.js';
import { loadAllSpecs } from '../../../src/mock-server/openapi-loader.js';

test('GraphQL Schema Generator Tests', async (t) => {
  // Load actual API specs with full schema data for dynamic testing
  const apiSpecs = await loadAllSpecs();

  console.log(`\n  Discovered ${apiSpecs.length} API(s) for testing`);
  apiSpecs.forEach(spec => console.log(`    - ${spec.name}`));

  await t.test('generateGraphQLSchema - generates valid SDL string', () => {
    const schema = generateGraphQLSchema(apiSpecs);

    assert.ok(typeof schema === 'string', 'Should return a string');
    assert.ok(schema.length > 0, 'Schema should not be empty');
    assert.ok(schema.includes('type Query'), 'Should contain Query type');
    console.log('  ✓ Generates valid SDL string');
  });

  await t.test('generateGraphQLSchema - includes SearchResults type', () => {
    const schema = generateGraphQLSchema(apiSpecs);

    assert.ok(schema.includes('type SearchResults'), 'Should include SearchResults type');
    assert.ok(schema.includes('totalCount: Int'), 'SearchResults should have totalCount');
    console.log('  ✓ Includes SearchResults type with totalCount');
  });

  await t.test('generateGraphQLSchema - includes search query', () => {
    const schema = generateGraphQLSchema(apiSpecs);

    assert.ok(schema.includes('search('), 'Should include search query');
    assert.ok(schema.includes('query: String'), 'Search should accept query parameter');
    console.log('  ✓ Includes search query with query parameter');
  });

  // Dynamic tests for each discovered API
  for (const spec of apiSpecs) {
    const resourceName = spec.name;
    const singularName = resourceName.endsWith('ies')
      ? resourceName.slice(0, -3) + 'y'
      : resourceName.endsWith('s')
        ? resourceName.slice(0, -1)
        : resourceName;
    const capitalizedSingular = singularName.charAt(0).toUpperCase() + singularName.slice(1);

    await t.test(`generateGraphQLSchema - includes ${resourceName} list query`, () => {
      const schema = generateGraphQLSchema(apiSpecs);

      // Check for list query with pagination parameters
      assert.ok(
        schema.includes(`${resourceName}(`),
        `Should include ${resourceName} list query`
      );
      console.log(`  ✓ Includes ${resourceName} list query`);
    });

    await t.test(`generateGraphQLSchema - includes ${singularName} single item query`, () => {
      const schema = generateGraphQLSchema(apiSpecs);

      // Check for single item query
      assert.ok(
        schema.includes(`${singularName}(id: ID!)`),
        `Should include ${singularName}(id) query`
      );
      console.log(`  ✓ Includes ${singularName}(id) single item query`);
    });

    await t.test(`generateGraphQLSchema - includes ${capitalizedSingular}Connection type`, () => {
      const schema = generateGraphQLSchema(apiSpecs);

      // Check for Connection type with pagination fields
      assert.ok(
        schema.includes(`type ${capitalizedSingular}Connection`),
        `Should include ${capitalizedSingular}Connection type`
      );
      assert.ok(schema.includes('items:'), 'Connection should have items field');
      assert.ok(schema.includes('total: Int'), 'Connection should have total field');
      assert.ok(schema.includes('hasNext: Boolean'), 'Connection should have hasNext field');
      console.log(`  ✓ Includes ${capitalizedSingular}Connection type with pagination fields`);
    });

    await t.test(`generateGraphQLSchema - SearchResults includes ${resourceName}`, () => {
      const schema = generateGraphQLSchema(apiSpecs);

      // SearchResults should include this resource
      const searchResultsMatch = schema.match(/type SearchResults \{[\s\S]*?\}/);
      assert.ok(searchResultsMatch, 'Should have SearchResults type');
      assert.ok(
        searchResultsMatch[0].includes(resourceName),
        `SearchResults should include ${resourceName} field`
      );
      console.log(`  ✓ SearchResults includes ${resourceName} field`);
    });
  }

  await t.test('generateGraphQLSchema - handles empty specs gracefully', () => {
    const schema = generateGraphQLSchema([]);

    assert.ok(typeof schema === 'string', 'Should return a string even with empty specs');
    assert.ok(schema.includes('type Query'), 'Should still have Query type');
    console.log('  ✓ Handles empty specs gracefully');
  });
});

console.log('\n✓ All GraphQL schema generator tests passed\n');
