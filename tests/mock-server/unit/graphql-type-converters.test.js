/**
 * Unit tests for GraphQL type converter utilities
 * Run with: node tests/mock-server/unit/graphql-type-converters.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert';

import {
  openApiTypeToGraphQL,
  sanitizeEnumValue,
  sanitizeFieldName,
  singularize,
  extractStringFieldPaths,
  resolveCompositeSchema,
  isRequired,
  isArrayType,
  isEnumType,
  isObjectType,
  capitalize,
} from '../../../src/mock-server/graphql/type-converters.js';

test('GraphQL Type Converter Tests', async (t) => {
  // openApiTypeToGraphQL tests
  await t.test('openApiTypeToGraphQL - string type', () => {
    const result = openApiTypeToGraphQL({ type: 'string' });
    assert.strictEqual(result, 'String');
    console.log('  ✓ string -> String');
  });

  await t.test('openApiTypeToGraphQL - uuid format', () => {
    const result = openApiTypeToGraphQL({ type: 'string', format: 'uuid' });
    assert.strictEqual(result, 'ID');
    console.log('  ✓ string with uuid format -> ID');
  });

  await t.test('openApiTypeToGraphQL - date format', () => {
    const result = openApiTypeToGraphQL({ type: 'string', format: 'date' });
    assert.strictEqual(result, 'String');
    console.log('  ✓ string with date format -> String');
  });

  await t.test('openApiTypeToGraphQL - date-time format', () => {
    const result = openApiTypeToGraphQL({ type: 'string', format: 'date-time' });
    assert.strictEqual(result, 'String');
    console.log('  ✓ string with date-time format -> String');
  });

  await t.test('openApiTypeToGraphQL - integer type', () => {
    const result = openApiTypeToGraphQL({ type: 'integer' });
    assert.strictEqual(result, 'Int');
    console.log('  ✓ integer -> Int');
  });

  await t.test('openApiTypeToGraphQL - number type', () => {
    const result = openApiTypeToGraphQL({ type: 'number' });
    assert.strictEqual(result, 'Float');
    console.log('  ✓ number -> Float');
  });

  await t.test('openApiTypeToGraphQL - boolean type', () => {
    const result = openApiTypeToGraphQL({ type: 'boolean' });
    assert.strictEqual(result, 'Boolean');
    console.log('  ✓ boolean -> Boolean');
  });

  // sanitizeEnumValue tests
  await t.test('sanitizeEnumValue - preserves valid values', () => {
    const result = sanitizeEnumValue('active');
    assert.strictEqual(result, 'active');
    console.log('  ✓ Preserves valid enum value "active"');
  });

  await t.test('sanitizeEnumValue - replaces hyphens with underscores', () => {
    const result = sanitizeEnumValue('under-review');
    assert.strictEqual(result, 'under_review');
    console.log('  ✓ Replaces hyphens: "under-review" -> "under_review"');
  });

  await t.test('sanitizeEnumValue - replaces spaces with underscores', () => {
    const result = sanitizeEnumValue('pending review');
    assert.strictEqual(result, 'pending_review');
    console.log('  ✓ Replaces spaces: "pending review" -> "pending_review"');
  });

  await t.test('sanitizeEnumValue - prepends underscore for leading digit', () => {
    const result = sanitizeEnumValue('123abc');
    assert.strictEqual(result, '_123abc');
    console.log('  ✓ Prepends underscore for leading digit: "123abc" -> "_123abc"');
  });

  // sanitizeFieldName tests
  await t.test('sanitizeFieldName - preserves valid names', () => {
    const result = sanitizeFieldName('firstName');
    assert.strictEqual(result, 'firstName');
    console.log('  ✓ Preserves valid field name "firstName"');
  });

  await t.test('sanitizeFieldName - prepends underscore for leading digit', () => {
    const result = sanitizeFieldName('123field');
    assert.strictEqual(result, '_123field');
    console.log('  ✓ Prepends underscore for leading digit: "123field" -> "_123field"');
  });

  // singularize tests
  await t.test('singularize - removes s suffix', () => {
    const result = singularize('persons');
    assert.strictEqual(result, 'person');
    console.log('  ✓ "persons" -> "person"');
  });

  await t.test('singularize - converts ies to y', () => {
    const result = singularize('categories');
    assert.strictEqual(result, 'category');
    console.log('  ✓ "categories" -> "category"');
  });

  await t.test('singularize - converts es to e', () => {
    const result = singularize('statuses');
    assert.strictEqual(result, 'statuse');
    console.log('  ✓ "statuses" -> "statuse"');
  });

  // capitalize tests
  await t.test('capitalize - capitalizes first letter', () => {
    const result = capitalize('person');
    assert.strictEqual(result, 'Person');
    console.log('  ✓ "person" -> "Person"');
  });

  await t.test('capitalize - handles empty string', () => {
    const result = capitalize('');
    assert.strictEqual(result, '');
    console.log('  ✓ Empty string returns empty');
  });

  // extractStringFieldPaths tests
  await t.test('extractStringFieldPaths - extracts top-level string fields', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', format: 'email' },
        status: { type: 'string', enum: ['active', 'inactive'] },
        age: { type: 'integer' },
      },
    };
    const result = extractStringFieldPaths(schema);
    assert.ok(result.includes('email'), 'Should include email');
    assert.ok(result.includes('id'), 'Should include uuid format (plain string)');
    assert.ok(!result.includes('status'), 'Should NOT include enum strings');
    assert.ok(!result.includes('age'), 'Should not include integer');
    console.log('  ✓ Extracts string fields, excludes enums and non-strings');
  });

  await t.test('extractStringFieldPaths - extracts nested string fields', () => {
    const schema = {
      type: 'object',
      properties: {
        name: {
          type: 'object',
          properties: {
            firstName: { type: 'string' },
            lastName: { type: 'string' },
          },
        },
        count: { type: 'integer' },
      },
    };
    const result = extractStringFieldPaths(schema);
    assert.ok(result.includes('name.firstName'), 'Should include name.firstName');
    assert.ok(result.includes('name.lastName'), 'Should include name.lastName');
    console.log('  ✓ Extracts nested string fields with dot notation');
  });

  // resolveCompositeSchema tests
  await t.test('resolveCompositeSchema - merges allOf schemas', () => {
    const schema = {
      allOf: [
        { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      ],
    };
    const result = resolveCompositeSchema(schema);
    assert.ok(result.properties.id, 'Should have id property');
    assert.ok(result.properties.name, 'Should have name property');
    assert.ok(result.required.includes('id'), 'Should require id');
    assert.ok(result.required.includes('name'), 'Should require name');
    console.log('  ✓ Merges allOf schemas correctly');
  });

  await t.test('resolveCompositeSchema - uses first anyOf option', () => {
    const schema = {
      anyOf: [
        { type: 'object', properties: { optionA: { type: 'string' } } },
        { type: 'object', properties: { optionB: { type: 'string' } } },
      ],
    };
    const result = resolveCompositeSchema(schema);
    assert.ok(result.properties.optionA, 'Should use first anyOf option');
    console.log('  ✓ Uses first anyOf option');
  });

  await t.test('resolveCompositeSchema - returns non-composite as-is', () => {
    const schema = { type: 'object', properties: { foo: { type: 'string' } } };
    const result = resolveCompositeSchema(schema);
    assert.deepStrictEqual(result, schema);
    console.log('  ✓ Returns non-composite schema as-is');
  });

  // Type check helpers
  await t.test('isRequired - returns true for required field', () => {
    const schema = { required: ['name', 'email'] };
    assert.strictEqual(isRequired(schema, 'name'), true);
    console.log('  ✓ isRequired returns true for required field');
  });

  await t.test('isRequired - returns false for optional field', () => {
    const schema = { required: ['name'] };
    assert.strictEqual(isRequired(schema, 'email'), false);
    console.log('  ✓ isRequired returns false for optional field');
  });

  await t.test('isArrayType - detects array type', () => {
    assert.strictEqual(isArrayType({ type: 'array' }), true);
    assert.strictEqual(isArrayType({ type: 'object' }), false);
    console.log('  ✓ isArrayType correctly detects arrays');
  });

  await t.test('isEnumType - detects enum type', () => {
    assert.ok(isEnumType({ enum: ['a', 'b'] }), 'Should detect enum');
    assert.ok(!isEnumType({ type: 'string' }), 'Should not detect non-enum');
    console.log('  ✓ isEnumType correctly detects enums');
  });

  await t.test('isObjectType - detects object type', () => {
    assert.ok(isObjectType({ type: 'object' }), 'Should detect object type');
    assert.ok(isObjectType({ properties: {} }), 'Should detect schema with properties');
    assert.ok(!isObjectType({ type: 'string' }), 'Should not detect string type');
    console.log('  ✓ isObjectType correctly detects objects');
  });
});

console.log('\n✓ All GraphQL type converter tests passed\n');
