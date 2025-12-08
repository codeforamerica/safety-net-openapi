/**
 * Unit tests for GraphQL resolver factory
 * Tests dynamic resolver creation from OpenAPI specs
 * Run with: node tests/mock-server/unit/graphql-resolver-factory.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert';

import { createResolvers, buildSearchableFieldsMap } from '../../../src/mock-server/graphql/resolver-factory.js';
import { loadAllSpecs } from '../../../src/mock-server/openapi-loader.js';
import { singularize } from '../../../src/mock-server/graphql/type-converters.js';

test('GraphQL Resolver Factory Tests', async (t) => {
  // Load actual API specs with full schema data for dynamic testing
  const apiSpecs = await loadAllSpecs();

  console.log(`\n  Discovered ${apiSpecs.length} API(s) for testing`);
  apiSpecs.forEach(spec => console.log(`    - ${spec.name}`));

  await t.test('buildSearchableFieldsMap - returns map for all resources', () => {
    const searchableFieldsMap = buildSearchableFieldsMap(apiSpecs);

    assert.ok(typeof searchableFieldsMap === 'object', 'Should return an object');

    // Verify map has entry for each discovered API
    for (const spec of apiSpecs) {
      assert.ok(
        spec.name in searchableFieldsMap,
        `Should have entry for ${spec.name}`
      );
      assert.ok(
        Array.isArray(searchableFieldsMap[spec.name]),
        `${spec.name} should be an array`
      );
    }

    console.log('  ✓ buildSearchableFieldsMap returns map for all resources');
  });

  await t.test('buildSearchableFieldsMap - extracts searchable fields', () => {
    const searchableFieldsMap = buildSearchableFieldsMap(apiSpecs);

    // At least one resource should have searchable fields
    const hasSearchableFields = Object.values(searchableFieldsMap).some(
      fields => fields.length > 0
    );
    assert.ok(hasSearchableFields, 'At least one resource should have searchable fields');

    // Log field counts
    for (const [resource, fields] of Object.entries(searchableFieldsMap)) {
      console.log(`    ${resource}: ${fields.length} searchable fields`);
    }

    console.log('  ✓ buildSearchableFieldsMap extracts searchable fields');
  });

  await t.test('createResolvers - returns object with Query resolver', () => {
    const searchableFieldsMap = buildSearchableFieldsMap(apiSpecs);
    const resolvers = createResolvers(apiSpecs, searchableFieldsMap);

    assert.ok(typeof resolvers === 'object', 'Should return an object');
    assert.ok(resolvers.Query, 'Should have Query resolver');
    assert.ok(typeof resolvers.Query === 'object', 'Query should be an object');

    console.log('  ✓ createResolvers returns object with Query resolver');
  });

  await t.test('createResolvers - includes search resolver', () => {
    const searchableFieldsMap = buildSearchableFieldsMap(apiSpecs);
    const resolvers = createResolvers(apiSpecs, searchableFieldsMap);

    assert.ok(resolvers.Query.search, 'Should have search resolver');
    assert.strictEqual(
      typeof resolvers.Query.search,
      'function',
      'search resolver should be a function'
    );

    console.log('  ✓ createResolvers includes search resolver function');
  });

  // Dynamic tests for each discovered API
  for (const spec of apiSpecs) {
    const resourceName = spec.name;
    const singularName = singularize(resourceName);

    await t.test(`createResolvers - includes ${resourceName} list resolver`, () => {
      const searchableFieldsMap = buildSearchableFieldsMap(apiSpecs);
      const resolvers = createResolvers(apiSpecs, searchableFieldsMap);

      assert.ok(
        resolvers.Query[resourceName],
        `Should have ${resourceName} list resolver`
      );
      assert.strictEqual(
        typeof resolvers.Query[resourceName],
        'function',
        `${resourceName} resolver should be a function`
      );

      console.log(`  ✓ createResolvers includes ${resourceName} list resolver`);
    });

    await t.test(`createResolvers - includes ${singularName} single item resolver`, () => {
      const searchableFieldsMap = buildSearchableFieldsMap(apiSpecs);
      const resolvers = createResolvers(apiSpecs, searchableFieldsMap);

      assert.ok(
        resolvers.Query[singularName],
        `Should have ${singularName} single item resolver`
      );
      assert.strictEqual(
        typeof resolvers.Query[singularName],
        'function',
        `${singularName} resolver should be a function`
      );

      console.log(`  ✓ createResolvers includes ${singularName} single item resolver`);
    });
  }

  await t.test('createResolvers - resolver count matches expected', () => {
    const searchableFieldsMap = buildSearchableFieldsMap(apiSpecs);
    const resolvers = createResolvers(apiSpecs, searchableFieldsMap);

    const resolverNames = Object.keys(resolvers.Query);

    // Expected: 1 search + (2 per API: list + single)
    const expectedCount = 1 + (apiSpecs.length * 2);

    assert.strictEqual(
      resolverNames.length,
      expectedCount,
      `Should have ${expectedCount} Query resolvers (got ${resolverNames.length})`
    );

    console.log(`  ✓ Query has ${resolverNames.length} resolvers (1 search + ${apiSpecs.length * 2} resource resolvers)`);
    console.log(`    Resolvers: ${resolverNames.join(', ')}`);
  });
});

console.log('\n✓ All GraphQL resolver factory tests passed\n');
