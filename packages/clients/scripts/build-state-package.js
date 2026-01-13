#!/usr/bin/env node
/**
 * Build a state-specific npm package for publishing to GitHub Packages.
 *
 * Usage:
 *   node scripts/build-state-package.js --state=california --version=1.0.0
 *
 * This script:
 * 1. Resolves the state overlay
 * 2. Generates Zodios clients (with exported schemas)
 * 3. Creates package directory with package.json
 * 4. Compiles TypeScript to JavaScript
 * 5. Outputs ready-to-publish package in dist-packages/{state}/
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clientsRoot = join(__dirname, '..');
const repoRoot = join(clientsRoot, '..', '..');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = { state: null, version: null };

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--state=')) {
      args.state = arg.split('=')[1];
    } else if (arg.startsWith('--version=')) {
      args.version = arg.split('=')[1];
    }
  }

  if (!args.state) {
    console.error('Error: --state is required');
    console.error('Usage: node scripts/build-state-package.js --state=california --version=1.0.0');
    process.exit(1);
  }

  if (!args.version) {
    console.error('Error: --version is required');
    console.error('Usage: node scripts/build-state-package.js --state=california --version=1.0.0');
    process.exit(1);
  }

  return args;
}

/**
 * Execute a command and return a promise
 */
function exec(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`  Running: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      cwd: options.cwd || repoRoot,
      ...options
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with exit code ${code}`));
      } else {
        resolve();
      }
    });

    child.on('error', reject);
  });
}

/**
 * Title case a state name
 */
function titleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Main build function
 */
async function main() {
  const { state, version } = parseArgs();
  const stateTitle = titleCase(state);
  const outputDir = join(clientsRoot, 'dist-packages', state);
  const srcDir = join(outputDir, 'src');
  const templatesDir = join(clientsRoot, 'templates');

  console.log(`\nBuilding package for ${stateTitle}...`);
  console.log(`  State: ${state}`);
  console.log(`  Version: ${version}`);
  console.log(`  Output: ${outputDir}\n`);

  // Clean output directory
  if (existsSync(outputDir)) {
    console.log('Cleaning previous build...');
    rmSync(outputDir, { recursive: true });
  }
  mkdirSync(srcDir, { recursive: true });

  // Step 1: Resolve overlay for this state
  console.log('\n1. Resolving state overlay...');
  await exec('npm', ['run', 'overlay:resolve', '-w', '@safety-net/schemas', '--', `--state=${state}`]);

  // Step 2: Generate modular Zod schemas grouped by x-domain
  console.log('\n2. Generating modular Zod schemas by domain...');
  const specDir = join(repoRoot, 'packages', 'schemas', 'openapi', 'resolved');
  const { generateModularZodByDomain } = await import('./generate-modular-zod.js');

  const domains = await generateModularZodByDomain(specDir, srcDir);
  console.log(`  Discovered domains: ${domains.join(', ')}`);

  if (domains.length === 0) {
    throw new Error('No domains discovered from specs');
  }

  // Copy search helpers utility
  cpSync(join(templatesDir, 'search-helpers.ts'), join(srcDir, 'search-helpers.ts'));
  console.log('  Copied search-helpers.ts');

  // Step 3: Generate package.json with dynamic exports based on discovered domains
  console.log('\n3. Generating package metadata...');
  const packageTemplate = JSON.parse(readFileSync(join(templatesDir, 'package.template.json'), 'utf8'));

  // Replace template placeholders
  packageTemplate.name = `@codeforamerica/safety-net-${state}`;
  packageTemplate.version = version;
  packageTemplate.description = `Safety Net API Zod/Zodios client for ${stateTitle}`;
  packageTemplate.keywords = ['safety-net', state, 'zod', 'zodios', 'openapi', 'api-client'];

  // Generate dynamic exports based on discovered domains
  packageTemplate.exports = {
    '.': {
      import: './dist/index.js',
      types: './dist/index.d.ts'
    }
  };
  for (const domain of domains) {
    packageTemplate.exports[`./${domain}`] = {
      import: `./dist/${domain}.js`,
      types: `./dist/${domain}.d.ts`
    };
  }

  writeFileSync(join(outputDir, 'package.json'), JSON.stringify(packageTemplate, null, 2));
  console.log(`  Generated package.json with ${domains.length} domain exports`);

  const readmeTemplate = readFileSync(join(templatesDir, 'README.template.md'), 'utf8');
  const readme = readmeTemplate
    .replace(/\{\{STATE\}\}/g, state)
    .replace(/\{\{STATE_TITLE\}\}/g, stateTitle);
  writeFileSync(join(outputDir, 'README.md'), readme);
  console.log('  Generated README.md');

  // Step 4: Generate index.ts dynamically based on discovered domains
  console.log('\n4. Generating index.ts...');
  const indexLines = [
    `// Safety Net API Zod/Zodios client for ${stateTitle}`,
    '// Auto-generated - do not edit directly',
    '',
    '// Search query helpers',
    "export { q, search } from './search-helpers.js';",
    '',
    '// Zodios API clients with schemas (namespaced)',
    '// Each module exports: schemas and individual schema types',
  ];
  for (const domain of domains) {
    indexLines.push(`export * as ${domain} from './${domain}.js';`);
  }
  indexLines.push('');
  writeFileSync(join(srcDir, 'index.ts'), indexLines.join('\n'));
  console.log(`  Generated index.ts with ${domains.length} domain exports`);

  // Step 5: Copy tsconfig for compilation
  console.log('\n5. Setting up TypeScript compilation...');
  cpSync(join(templatesDir, 'tsconfig.build.json'), join(outputDir, 'tsconfig.json'));
  console.log('  Copied tsconfig.json');

  // Step 6: Compile TypeScript
  console.log('\n6. Compiling TypeScript...');
  await exec('npx', ['tsc'], { cwd: outputDir });
  console.log('  Compilation complete');

  // Summary
  console.log('\n========================================');
  console.log(`Package built successfully!`);
  console.log(`  Name: @codeforamerica/safety-net-${state}`);
  console.log(`  Version: ${version}`);
  console.log(`  Location: ${outputDir}`);
  console.log('========================================\n');
}

main().catch((error) => {
  console.error('\nBuild failed:', error.message);
  process.exit(1);
});
