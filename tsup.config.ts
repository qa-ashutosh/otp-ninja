import { defineConfig } from 'tsup';

export default defineConfig([
  // ESM build — dist/index.js (matches "import" in package.json exports)
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    outExtension: () => ({ js: '.js' }),
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    outDir: 'dist',
    target: 'node16',
  },
  // CJS build — dist/index.cjs (matches "require" in package.json exports)
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    dts: false,
    clean: false,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    outDir: 'dist',
    target: 'node16',
  },
]);