#!/usr/bin/env node
// [SCOPE] Linux debrand patch (audit C2). Rewrites the VSCodium Linux base product.json with
// Redivivus identity so the shipped Linux IDE is not branded "VSCodium". Mirrors the inline patch in
// scripts/build-windows.sh for the cross-platform fields, and also fixes the Linux-relevant leftovers
// the audit flagged that Windows does not set (urlProtocol, serverDataFolderName, doc/issue URLs).
//
// [C2-CRITICAL] dataFolderName drives the directory the running IDE reads user-installed extensions
// from (~/<dataFolderName>/extensions). It MUST stay '.redivivus' to match the deploy/auto-update
// target in scripts/postcompile-deploy.js (~/.redivivus/extensions) — otherwise updates land where the
// IDE never looks. If you change it here, change it there too.
//
// Idempotent. Usage:
//   node scripts/debrand-linux-product.js [path/to/product.json]
//   default: $HOME/projects/redivivus-build/VSCode-linux-x64/resources/app/product.json

const fs = require('fs');
const path = require('path');
const os = require('os');
const { applyCrossPlatformDebrand } = require('./debrand-product.js');

const target = process.argv[2] || path.join(
  os.homedir(), 'projects', 'redivivus-build', 'VSCode-linux-x64', 'resources', 'app', 'product.json'
);

if (!fs.existsSync(target)) {
  console.error(`❌ Linux product.json not found at ${target} — run scripts/update-linux-base.sh first.`);
  process.exit(1);
}

let p;
try {
  p = JSON.parse(fs.readFileSync(target, 'utf8'));
} catch (e) {
  console.error(`❌ Could not parse ${target}: ${e.message}`);
  process.exit(1);
}

// All cross-platform brand fields live in the shared helper so Linux + Windows can't drift apart.
applyCrossPlatformDebrand(p);

fs.writeFileSync(target, JSON.stringify(p, null, 2) + '\n');
console.log(`✓  Debranded Linux product.json → ${target}`);
console.log(`   nameShort=${p.nameShort}  dataFolderName=${p.dataFolderName}  urlProtocol=${p.urlProtocol}`);
