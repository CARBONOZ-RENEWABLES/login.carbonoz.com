#!/usr/bin/env node
/* eslint-disable */
/**
 * Secret scan for tracked files (and, with --untracked, files git would add).
 * Prints file:line and the kind of secret — never the value. Exit 1 on any
 * finding. No dependencies; runs in CI and locally:
 *
 *   node scripts/secret-scan.js             # tracked files
 *   node scripts/secret-scan.js --untracked # + untracked, not ignored
 *
 * A line can be exempted with a trailing `secret-scan:allow` comment (for
 * documented test fixtures only). Lock files and binary files are skipped.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

// Always scan from the repository root, wherever it is started.
process.chdir(
  execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(),
);

const files = execFileSync(
  'git',
  ['ls-files', '-z', ...(process.argv.includes('--untracked') ? ['--cached', '--others', '--exclude-standard'] : [])],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
)
  .split('\0')
  .filter(Boolean)
  .filter((f) => !/(^|\/)node_modules\//.test(f))
  .filter((f) => !/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(f))
  .filter((f) => !/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|eot|zip|gz|tgz|mp4|mov)$/i.test(f));

// Values that are obviously not secrets.
const PLACEHOLDER_WORDS = /your|change[-_]?me|change[-_]?this|example|replace|placeholder|secret[-_]key/i;
const PLACEHOLDER =
  /^(<[^>]*>|\$\{?[A-Za-z_][\w:?-]*\}?|\*+|x+|changeme|change-me|example\w*|your[-_]\w*|placeholder|redacted|\[redacted\]|dummy|test|e2e[-\w]*|null|undefined|true|false)$/i;

const RULES = [
  ['private key', /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Stripe live key', /\b(sk|rk)_live_[0-9A-Za-z]{20,}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['InfluxDB-style token', /[A-Za-z0-9_-]{80,}==/],
  ['sshpass with a literal password', /sshpass\s+-p\s*['"]?(?!\$)[^\s'"]{4,}/],
  ['password piped to sudo', /echo\s+['"][^'"$]{4,}['"]\s*\|\s*sudo\s+-S/],
  [
    'URL with embedded password',
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"`]+:([^\s@'"`]+)@/i,
    (m) =>
      !PLACEHOLDER.test(m[1]) &&
      !PLACEHOLDER_WORDS.test(m[1]) &&
      !/^\$|\$\{|<|\*/.test(m[1]),
  ],
  [
    'hard-coded credential assignment',
    /\b([A-Z0-9_]*(PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|APIKEY|PRIVATE_KEY))\b["']?\s*[:=]\s*["']?([^\s"'`,;#}]{8,})/,
    (m, file) =>
      !PLACEHOLDER.test(m[3]) &&
      !PLACEHOLDER_WORDS.test(m[3]) &&
      !/^(process\.env|env\(|\$|\{|config\.|this\.|<)/.test(m[3]) &&
      !/(_FILE|_HEADER|_NAME|_PATH|_URL|_ID)$/.test(m[1]) &&
      // test/support starts throwaway services with fixed local-only values
      !/(^|\/)test\/support\//.test(file),
  ],
];

let findings = 0;
for (const file of files) {
  let text;
  try {
    const buf = fs.readFileSync(file);
    if (buf.includes(0)) continue; // binary
    text = buf.toString('utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, i) => {
    if (line.includes('secret-scan:allow')) return;
    for (const [kind, re, keep] of RULES) {
      const m = line.match(re);
      if (m && (!keep || keep(m, file))) {
        console.log(`${file}:${i + 1}: ${kind}`);
        findings++;
        break;
      }
    }
  });
}
console.log(findings ? `\n${findings} possible secret(s) found (values not shown)` : `secret scan: ${files.length} files, no findings`);
process.exit(findings ? 1 : 0);
