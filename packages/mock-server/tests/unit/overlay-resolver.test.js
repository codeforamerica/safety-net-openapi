/**
 * Unit tests for Overlay Resolver
 * Tests JSONPath operations and overlay application
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  resolvePath,
  setAtPath,
  removeAtPath,
  renameAtPath,
  checkPathExists,
  rootExists,
  applyOverlay
} from '@safety-net/schemas/overlay';

test('Overlay Resolver Tests', async (t) => {

  // ==========================================================================
  // resolvePath tests
  // ==========================================================================

  await t.test('resolvePath - resolves simple path', () => {
    const obj = { foo: { bar: 'value' } };
    assert.strictEqual(resolvePath(obj, '$.foo.bar'), 'value');
  });

  await t.test('resolvePath - resolves path without $ prefix', () => {
    const obj = { foo: { bar: 'value' } };
    assert.strictEqual(resolvePath(obj, 'foo.bar'), 'value');
  });

  await t.test('resolvePath - returns undefined for non-existent path', () => {
    const obj = { foo: { bar: 'value' } };
    assert.strictEqual(resolvePath(obj, '$.foo.baz'), undefined);
  });

  await t.test('resolvePath - handles nested objects', () => {
    const obj = {
      Person: {
        properties: {
          name: { type: 'string' }
        }
      }
    };
    assert.deepStrictEqual(resolvePath(obj, '$.Person.properties.name'), { type: 'string' });
  });

  await t.test('resolvePath - returns undefined for null intermediate', () => {
    const obj = { foo: null };
    assert.strictEqual(resolvePath(obj, '$.foo.bar'), undefined);
  });

  // ==========================================================================
  // setAtPath tests
  // ==========================================================================

  await t.test('setAtPath - sets value at simple path', () => {
    const obj = { foo: {} };
    setAtPath(obj, '$.foo.bar', 'value');
    assert.strictEqual(obj.foo.bar, 'value');
  });

  await t.test('setAtPath - creates intermediate objects', () => {
    const obj = {};
    setAtPath(obj, '$.foo.bar.baz', 'value');
    assert.strictEqual(obj.foo.bar.baz, 'value');
  });

  await t.test('setAtPath - replaces array values', () => {
    const obj = { foo: { enum: ['a', 'b'] } };
    setAtPath(obj, '$.foo.enum', ['x', 'y', 'z']);
    assert.deepStrictEqual(obj.foo.enum, ['x', 'y', 'z']);
  });

  await t.test('setAtPath - merges object values', () => {
    const obj = {
      Person: {
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' }
        }
      }
    };
    setAtPath(obj, '$.Person.properties', {
      newField: { type: 'boolean' }
    });
    // Should merge, not replace
    assert.strictEqual(obj.Person.properties.name.type, 'string');
    assert.strictEqual(obj.Person.properties.age.type, 'integer');
    assert.strictEqual(obj.Person.properties.newField.type, 'boolean');
  });

  await t.test('setAtPath - replaces non-object values', () => {
    const obj = { foo: { value: 'old' } };
    setAtPath(obj, '$.foo.value', 'new');
    assert.strictEqual(obj.foo.value, 'new');
  });

  // ==========================================================================
  // removeAtPath tests
  // ==========================================================================

  await t.test('removeAtPath - removes value at path', () => {
    const obj = { foo: { bar: 'value', baz: 'keep' } };
    removeAtPath(obj, '$.foo.bar');
    assert.strictEqual(obj.foo.bar, undefined);
    assert.strictEqual(obj.foo.baz, 'keep');
  });

  await t.test('removeAtPath - handles non-existent path gracefully', () => {
    const obj = { foo: {} };
    removeAtPath(obj, '$.foo.bar.baz'); // Should not throw
    assert.deepStrictEqual(obj, { foo: {} });
  });

  // ==========================================================================
  // renameAtPath tests
  // ==========================================================================

  await t.test('renameAtPath - renames property at path', () => {
    const obj = {
      Person: {
        properties: {
          oldName: { type: 'string', description: 'Original field' }
        }
      }
    };
    const result = renameAtPath(obj, '$.Person.properties.oldName', 'newName');
    assert.strictEqual(result, true);
    assert.strictEqual(obj.Person.properties.oldName, undefined);
    assert.deepStrictEqual(obj.Person.properties.newName, { type: 'string', description: 'Original field' });
  });

  await t.test('renameAtPath - preserves other properties', () => {
    const obj = {
      Person: {
        properties: {
          keep: { type: 'integer' },
          rename: { type: 'string' }
        }
      }
    };
    renameAtPath(obj, '$.Person.properties.rename', 'renamed');
    assert.strictEqual(obj.Person.properties.keep.type, 'integer');
    assert.strictEqual(obj.Person.properties.renamed.type, 'string');
    assert.strictEqual(obj.Person.properties.rename, undefined);
  });

  await t.test('renameAtPath - returns false for non-existent source', () => {
    const obj = { Person: { properties: {} } };
    const result = renameAtPath(obj, '$.Person.properties.nonexistent', 'newName');
    assert.strictEqual(result, false);
  });

  await t.test('renameAtPath - returns false for non-existent path', () => {
    const obj = { Person: {} };
    const result = renameAtPath(obj, '$.Person.properties.field', 'newName');
    assert.strictEqual(result, false);
  });

  // ==========================================================================
  // checkPathExists tests
  // ==========================================================================

  await t.test('checkPathExists - returns fullPathExists true for existing path', () => {
    const obj = {
      Person: {
        properties: {
          name: { type: 'string' }
        }
      }
    };
    const result = checkPathExists(obj, '$.Person.properties.name');
    assert.strictEqual(result.rootExists, true);
    assert.strictEqual(result.fullPathExists, true);
    assert.strictEqual(result.missingAt, null);
  });

  await t.test('checkPathExists - returns rootExists false for missing root', () => {
    const obj = { Person: {} };
    const result = checkPathExists(obj, '$.Application.properties');
    assert.strictEqual(result.rootExists, false);
    assert.strictEqual(result.fullPathExists, false);
    assert.strictEqual(result.missingAt, null);
  });

  await t.test('checkPathExists - identifies where path stops existing', () => {
    const obj = {
      Person: {
        properties: {
          name: { type: 'string' }
        }
      }
    };
    const result = checkPathExists(obj, '$.Person.properties.age.enum');
    assert.strictEqual(result.rootExists, true);
    assert.strictEqual(result.fullPathExists, false);
    assert.strictEqual(result.missingAt, 'Person.properties.age');
  });

  // ==========================================================================
  // rootExists tests
  // ==========================================================================

  await t.test('rootExists - returns true when root schema exists', () => {
    const obj = { Person: { properties: {} } };
    assert.strictEqual(rootExists(obj, '$.Person.properties.name'), true);
  });

  await t.test('rootExists - returns false when root schema missing', () => {
    const obj = { Person: {} };
    assert.strictEqual(rootExists(obj, '$.Application.properties'), false);
  });

  // ==========================================================================
  // applyOverlay tests
  // ==========================================================================

  await t.test('applyOverlay - applies update action', () => {
    const spec = {
      Person: {
        properties: {
          status: {
            enum: ['active', 'inactive']
          }
        }
      }
    };
    const overlay = {
      actions: [
        {
          target: '$.Person.properties.status.enum',
          update: ['enabled', 'disabled', 'pending']
        }
      ]
    };

    const { result, warnings } = applyOverlay(spec, overlay, { silent: true });

    assert.deepStrictEqual(result.Person.properties.status.enum, ['enabled', 'disabled', 'pending']);
    assert.strictEqual(warnings.length, 0);
  });

  await t.test('applyOverlay - applies remove action', () => {
    const spec = {
      Person: {
        properties: {
          name: { type: 'string' },
          deprecated: { type: 'string' }
        }
      }
    };
    const overlay = {
      actions: [
        {
          target: '$.Person.properties.deprecated',
          remove: true
        }
      ]
    };

    const { result, warnings } = applyOverlay(spec, overlay, { silent: true });

    assert.strictEqual(result.Person.properties.deprecated, undefined);
    assert.strictEqual(result.Person.properties.name.type, 'string');
  });

  await t.test('applyOverlay - adds new properties without warning', () => {
    const spec = {
      Person: {
        properties: {
          name: { type: 'string' }
        }
      }
    };
    const overlay = {
      actions: [
        {
          target: '$.Person.properties',
          description: 'Add new field',
          update: {
            countyCode: { type: 'string' }
          }
        }
      ]
    };

    const { result, warnings } = applyOverlay(spec, overlay, { silent: true });

    assert.strictEqual(result.Person.properties.countyCode.type, 'string');
    assert.strictEqual(result.Person.properties.name.type, 'string'); // Preserved
    assert.strictEqual(warnings.length, 0); // No warning for adding to .properties
  });

  await t.test('applyOverlay - warns on non-existent target path', () => {
    const spec = {
      Person: {
        properties: {
          name: { type: 'string' }
        }
      }
    };
    const overlay = {
      actions: [
        {
          target: '$.Person.properties.nonExistent.enum',
          description: 'Update missing field',
          update: ['a', 'b']
        }
      ]
    };

    const { result, warnings } = applyOverlay(spec, overlay, { silent: true });

    assert.strictEqual(warnings.length, 1);
    assert.ok(warnings[0].includes('does not exist in base schema'));
    assert.ok(warnings[0].includes('Update missing field'));
  });

  await t.test('applyOverlay - skips actions for non-matching root schemas', () => {
    const spec = {
      Person: {
        properties: {}
      }
    };
    const overlay = {
      actions: [
        {
          target: '$.Application.properties.status',
          update: ['new', 'old']
        }
      ]
    };

    const { result, warnings } = applyOverlay(spec, overlay, { silent: true });

    // Should not modify anything or warn (Application root doesn't exist in this file)
    assert.strictEqual(result.Application, undefined);
    assert.strictEqual(warnings.length, 0);
  });

  await t.test('applyOverlay - does not mutate original spec', () => {
    const spec = {
      Person: {
        properties: {
          status: { enum: ['a', 'b'] }
        }
      }
    };
    const overlay = {
      actions: [
        {
          target: '$.Person.properties.status.enum',
          update: ['x', 'y']
        }
      ]
    };

    const { result } = applyOverlay(spec, overlay, { silent: true });

    // Original should be unchanged
    assert.deepStrictEqual(spec.Person.properties.status.enum, ['a', 'b']);
    // Result should have new values
    assert.deepStrictEqual(result.Person.properties.status.enum, ['x', 'y']);
  });

  await t.test('applyOverlay - handles empty overlay', () => {
    const spec = { Person: { properties: {} } };
    const overlay = {};

    const { result, warnings } = applyOverlay(spec, overlay, { silent: true });

    assert.deepStrictEqual(result, spec);
    assert.strictEqual(warnings.length, 0);
  });

  await t.test('applyOverlay - handles overlay with no actions', () => {
    const spec = { Person: { properties: {} } };
    const overlay = { info: { title: 'Test' }, actions: [] };

    const { result, warnings } = applyOverlay(spec, overlay, { silent: true });

    assert.deepStrictEqual(result, spec);
    assert.strictEqual(warnings.length, 0);
  });

  await t.test('applyOverlay - skips action with missing target', () => {
    const spec = { Person: { properties: {} } };
    const overlay = {
      actions: [
        { update: ['a', 'b'] } // Missing target
      ]
    };

    const { result, warnings } = applyOverlay(spec, overlay, { silent: true });

    // Should not crash, just skip
    assert.deepStrictEqual(result, spec);
  });

  // ==========================================================================
  // applyOverlay rename action tests
  // ==========================================================================

  await t.test('applyOverlay - applies rename action', () => {
    const spec = {
      Person: {
        properties: {
          oldFieldName: { type: 'string', description: 'A field' }
        }
      }
    };
    const overlay = {
      actions: [
        {
          target: '$.Person.properties.oldFieldName',
          description: 'Rename to match state terminology',
          rename: 'newFieldName'
        }
      ]
    };

    const { result, warnings } = applyOverlay(spec, overlay, { silent: true });

    assert.strictEqual(result.Person.properties.oldFieldName, undefined);
    assert.deepStrictEqual(result.Person.properties.newFieldName, { type: 'string', description: 'A field' });
    assert.strictEqual(warnings.length, 0);
  });

  await t.test('applyOverlay - rename preserves complex property definition', () => {
    const spec = {
      Person: {
        properties: {
          federalProgramId: {
            type: 'string',
            description: 'Federal program identifier',
            pattern: '^[A-Z]{2}[0-9]{6}$',
            example: 'CA123456'
          }
        }
      }
    };
    const overlay = {
      actions: [
        {
          target: '$.Person.properties.federalProgramId',
          description: 'Use state-specific name',
          rename: 'stateProgramId'
        }
      ]
    };

    const { result, warnings } = applyOverlay(spec, overlay, { silent: true });

    assert.strictEqual(result.Person.properties.federalProgramId, undefined);
    assert.deepStrictEqual(result.Person.properties.stateProgramId, {
      type: 'string',
      description: 'Federal program identifier',
      pattern: '^[A-Z]{2}[0-9]{6}$',
      example: 'CA123456'
    });
  });

  await t.test('applyOverlay - rename warns on non-existent target', () => {
    const spec = {
      Person: {
        properties: {
          name: { type: 'string' }
        }
      }
    };
    const overlay = {
      actions: [
        {
          target: '$.Person.properties.nonexistent',
          description: 'Try to rename missing field',
          rename: 'newName'
        }
      ]
    };

    const { result, warnings } = applyOverlay(spec, overlay, { silent: true });

    assert.strictEqual(warnings.length, 1);
    assert.ok(warnings[0].includes('does not exist in base schema'));
  });

  await t.test('applyOverlay - rename does not mutate original spec', () => {
    const spec = {
      Person: {
        properties: {
          original: { type: 'string' }
        }
      }
    };
    const overlay = {
      actions: [
        {
          target: '$.Person.properties.original',
          rename: 'renamed'
        }
      ]
    };

    const { result } = applyOverlay(spec, overlay, { silent: true });

    // Original should be unchanged
    assert.strictEqual(spec.Person.properties.original.type, 'string');
    assert.strictEqual(spec.Person.properties.renamed, undefined);
    // Result should have renamed property
    assert.strictEqual(result.Person.properties.original, undefined);
    assert.strictEqual(result.Person.properties.renamed.type, 'string');
  });

});
