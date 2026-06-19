// [SCOPE] Shared cross-platform product.json debrand (audit C2 + Windows parity). Applies the
// Redivivus identity fields that are IDENTICAL on every OS, so Linux and Windows can't drift apart.
// Platform scripts add their own extras (build-windows.sh adds win32* fields) and own the file I/O.
//
// [C2-CRITICAL] dataFolderName drives where the running IDE reads user-installed extensions
// (~/<dataFolderName>/extensions). It MUST stay '.redivivus' to match the deploy/auto-update target in
// scripts/postcompile-deploy.js. If you change it here, change it there too.

'use strict';

/** Mutates `p` in place with the cross-platform Redivivus brand fields. Returns `p`. */
function applyCrossPlatformDebrand(p) {
  p.nameShort = 'Redivivus';
  p.nameLong = 'Redivivus IDE';
  p.applicationName = 'redivivus';
  p.dataFolderName = '.redivivus';
  // The audit-flagged leftovers Windows previously never patched (now shared so both OSes get them).
  p.serverDataFolderName = '.redivivus-server';
  p.urlProtocol = 'redivivus';
  p.reportIssueUrl = 'https://github.com/smithkjnc-ux/Redivivus/issues/new';
  p.documentationUrl = 'https://redivivus.dev';
  p.releaseNotesUrl = 'https://github.com/smithkjnc-ux/Redivivus/releases';
  return p;
}

module.exports = { applyCrossPlatformDebrand };
