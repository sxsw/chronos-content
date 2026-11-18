#!/usr/bin/env node
// Validates content.json against images-staging/. Exits 0 on success, 1 on
// any error. Prints every finding before exiting, so a designer who typed
// three bad fields sees three, not one per run.

import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {validateDocument} from './lib/rules.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function run({contentPath = join(REPO_ROOT, 'content.json'), assetsDir = join(REPO_ROOT, 'images-staging')} = {}) {
  let raw
  try {
    raw = readFileSync(contentPath, 'utf8')
  } catch (error) {
    return {errors: [`could not read ${contentPath}: ${error.message}`], warnings: []}
  }

  let doc
  try {
    doc = JSON.parse(raw)
  } catch (error) {
    return {errors: [`${contentPath} is not valid JSON: ${error.message}`], warnings: []}
  }

  return validateDocument(doc, {assetsDir})
}

function main() {
  const {errors, warnings} = run()

  if (warnings.length > 0) {
    console.log(`${warnings.length} warning(s):`)
    for (const warning of warnings) console.log(`  - ${warning}`)
  }

  if (errors.length > 0) {
    console.error(`${errors.length} error(s):`)
    for (const error of errors) console.error(`  - ${error}`)
    process.exit(1)
  }

  console.log('content.json is valid.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
