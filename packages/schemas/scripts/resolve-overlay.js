#!/usr/bin/env node
/**
 * Resolve OpenAPI overlays for state-specific configurations.
 *
 * This script applies OpenAPI Overlay Specification (1.0.0) transformations
 * to base schemas, producing state-specific resolved specifications.
 *
 * Usage:
 *   STATE=california node scripts/resolve-overlay.js
 *   node scripts/resolve-overlay.js --state=colorado
 *
 * The resolved specs are written to openapi/resolved/ and used by
 * the mock server, client generators, and other tooling.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, cpSync, rmSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { applyOverlay } from '../src/overlay/overlay-resolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const openapiDir = join(rootDir, 'openapi');
const overlaysDir = join(openapiDir, 'overlays');
const resolvedDir = join(openapiDir, 'resolved');

/**
 * Get the state from environment or CLI args
 */
function getState() {
  // Check CLI args first
  const stateArg = process.argv.find(arg => arg.startsWith('--state='));
  if (stateArg) {
    return stateArg.split('=')[1];
  }

  // Fall back to environment variable
  return process.env.STATE || null;
}

/**
 * List available state overlays
 */
function listAvailableStates() {
  if (!existsSync(overlaysDir)) {
    return [];
  }

  return readdirSync(overlaysDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(overlaysDir, entry.name, 'modifications.yaml')))
    .map(entry => entry.name);
}

/**
 * Process all YAML files in a directory, applying overlay where targets match
 * Returns: array of warning strings
 */
function processDirectory(sourceDir, overlay, targetDir, overlayDir) {
  const files = readdirSync(sourceDir, { withFileTypes: true });
  let allWarnings = [];

  for (const file of files) {
    const sourcePath = join(sourceDir, file.name);
    const targetPath = join(targetDir, file.name);

    if (file.isDirectory()) {
      // Skip overlays and resolved directories
      if (file.name === 'overlays' || file.name === 'resolved') {
        continue;
      }
      mkdirSync(targetPath, { recursive: true });
      const dirWarnings = processDirectory(sourcePath, overlay, targetPath, overlayDir);
      allWarnings = allWarnings.concat(dirWarnings);
    } else if (file.name.endsWith('.yaml')) {
      // Process YAML files
      const content = readFileSync(sourcePath, 'utf8');
      const spec = yaml.load(content);

      // Apply overlay transformations
      const { result: resolved, warnings } = applyOverlay(spec, overlay, { overlayDir });
      allWarnings = allWarnings.concat(warnings);

      // Write resolved spec
      const output = yaml.dump(resolved, {
        lineWidth: -1,  // Don't wrap lines
        noRefs: true,   // Don't use aliases
        quotingType: '"',
        forceQuotes: false
      });
      writeFileSync(targetPath, output);
    }
  }

  return allWarnings;
}

/**
 * Main execution
 */
function main() {
  const state = getState();
  const availableStates = listAvailableStates();

  // Clean and recreate resolved directory
  if (existsSync(resolvedDir)) {
    rmSync(resolvedDir, { recursive: true });
  }
  mkdirSync(resolvedDir, { recursive: true });

  if (!state) {
    // No state specified - copy base specs as-is
    console.log('No STATE specified, using base specifications');
    console.log(`Available states: ${availableStates.join(', ') || '(none)'}`);
    console.log('');

    // Copy all files except overlays and resolved
    const files = readdirSync(openapiDir, { withFileTypes: true });
    for (const file of files) {
      if (file.name === 'overlays' || file.name === 'resolved') continue;

      const source = join(openapiDir, file.name);
      const target = join(resolvedDir, file.name);

      if (file.isDirectory()) {
        cpSync(source, target, { recursive: true });
      } else {
        cpSync(source, target);
      }
    }

    console.log(`Base specs copied to ${resolvedDir}`);
    return;
  }

  // Validate state exists
  if (!availableStates.includes(state)) {
    console.error(`Error: Unknown state '${state}'`);
    console.error(`Available states: ${availableStates.join(', ') || '(none)'}`);
    process.exit(1);
  }

  // Load overlay
  const stateOverlayDir = join(overlaysDir, state);
  const overlayPath = join(stateOverlayDir, 'modifications.yaml');
  console.log(`Applying overlay: ${state}`);
  console.log(`Overlay file: ${overlayPath}`);
  console.log('');

  const overlayContent = readFileSync(overlayPath, 'utf8');
  const overlay = yaml.load(overlayContent);

  console.log(`Overlay: ${overlay.info?.title || state}`);
  console.log(`Version: ${overlay.info?.version || 'unknown'}`);
  console.log('');

  // Process all specs with overlay
  const warnings = processDirectory(openapiDir, overlay, resolvedDir, stateOverlayDir);

  // Display warnings if any
  if (warnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    // Deduplicate warnings (same warning may appear from multiple files)
    const uniqueWarnings = [...new Set(warnings)];
    for (const warning of uniqueWarnings) {
      console.log(`  ⚠ ${warning}`);
    }
  }

  console.log('');
  console.log(`Resolved specs written to ${resolvedDir}`);
  console.log(`State: ${state}`);
}

main();
