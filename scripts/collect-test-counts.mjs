#!/usr/bin/env node
/*
 * collect-test-counts.mjs — derives the Quality section's evidence numbers
 * from the repo's actual test files instead of hand-typed figures (landing
 * plan A6 / T3.2). Counts real `it(`/`test(` call sites (including
 * `.each`/`.skip`/`.only` variants) per test tier and writes the result to
 * apps/web/src/data/quality-evidence.json.
 *
 * Run from the repo root: `node scripts/collect-test-counts.mjs`.
 * Re-run before any landing release so the panel never drifts from the
 * suite (README's hand-written table is a reference, not the source).
 */
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const TEST_CALL_RE = /^\s*(it|test)(\.(each|skip|only))?\(/

/** Recursively collect files under `dir` matching `filePattern`. */
function collectFiles(dir, filePattern, exclude = []) {
  let results = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return results
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (exclude.some((ex) => full.includes(ex))) continue
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results = results.concat(collectFiles(full, filePattern, exclude))
    } else if (filePattern.test(entry)) {
      results.push(full)
    }
  }
  return results
}

/** Count `it(`/`test(` call sites across a set of files. */
function countTests(files) {
  let count = 0
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n')
    for (const line of lines) {
      if (TEST_CALL_RE.test(line)) count += 1
    }
  }
  return count
}

// apps/api's vitest config includes all of test/**/*.spec.ts (see
// apps/api/vitest.config.ts), not just test/unit/ — e.g. test/placeholder.spec.ts
// lives one level up. Match that glob exactly, minus integration, so this
// count never drifts from what `pnpm test` actually runs.
const apiUnitFiles = collectFiles(join(ROOT, 'apps/api/test'), /\.spec\.ts$/, ['/integration/'])
const apiIntegrationFiles = collectFiles(join(ROOT, 'apps/api/test/integration'), /\.spec\.ts$/)
const webUnitFiles = collectFiles(join(ROOT, 'apps/web/test'), /\.test\.tsx?$/, ['/e2e/'])
const webA11yFiles = webUnitFiles.filter((f) => f.endsWith('a11y.test.tsx'))
const e2eFiles = collectFiles(join(ROOT, 'apps/web/test/e2e'), /\.spec\.ts$/)

const unitApi = countTests(apiUnitFiles)
const unitWeb = countTests(webUnitFiles)
const integrationApi = countTests(apiIntegrationFiles)
const e2ePlaywright = countTests(e2eFiles)
const a11y = countTests(webA11yFiles)

const evidence = {
  generatedAt: new Date().toISOString(),
  unitApi,
  unitWeb,
  unitTotal: unitApi + unitWeb,
  integrationApi,
  e2ePlaywright,
  a11y,
}

const outPath = join(ROOT, 'apps/web/src/data/quality-evidence.json')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(evidence, null, 2) + '\n')

console.log('Wrote', outPath)
console.log(evidence)
