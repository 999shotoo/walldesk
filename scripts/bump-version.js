#!/usr/bin/env node
// Usage: node scripts/bump-version.js 0.3.0
const fs = require('fs');
const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/bump-version.js <version>');
  process.exit(1);
}

// Each file's key uses a different syntax: JSON ("version": "...") vs TOML (version = "...").
const files = [
  { path: 'package.json', key: 'version', regex: /("version"\s*:\s*")([^"]+)(")/ },
  { path: 'src-tauri/Cargo.toml', key: 'version', regex: /^(version\s*=\s*")([^"]+)(")/m },
  { path: 'src-tauri/tauri.conf.json', key: 'version', regex: /("version"\s*:\s*")([^"]+)(")/ },
];

let ok = true;
files.forEach(({ path, key, regex }) => {
  const content = fs.readFileSync(path, 'utf8');
  if (!regex.test(content)) {
    console.error(`ERROR: could not find "${key}" in ${path}`);
    ok = false;
    return;
  }
  const updated = content.replace(regex, `$1${version}$3`);
  fs.writeFileSync(path, updated);
  console.log(`Updated ${path} -> ${version}`);
});

if (!ok) {
  console.error('\nAborted: not all version fields found. Fix the offending file and re-run.');
  process.exit(1);
}

console.log('\nNow run: git commit -am "chore: release v' + version + '"');
