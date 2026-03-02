/**
 * Builds a test update for the auto-update flow.
 * Run: node scripts/build-test-update.js
 * Expects package.json at current version (e.g. 1.0.2). Builds that version, then
 * rebuilds the previous version for win-unpacked so you can test Check for updates.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseVersion(v) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)] : null;
}

function prevVersion(v) {
  const [major, minor, patch] = parseVersion(v) || [1, 0, 0];
  if (patch > 0) return `${major}.${minor}.${patch - 1}`;
  if (minor > 0) return `${major}.${minor - 1}.99`;
  return `${major - 1}.99.99`;
}

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const newVersion = pkg.version;
const oldVersion = prevVersion(newVersion);

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');

const setupNew = path.join(distDir, `AnimeDB UPnP Setup ${newVersion}.exe`);
const setupNewSafe = path.join(distDir, `AnimeDB-UPnP-Setup-${newVersion}.exe`);

console.log(`Building ${newVersion}...`);
execSync('npm run build', { cwd: root, stdio: 'inherit' });

const latestYml = path.join(distDir, 'latest.yml');
if (!fs.existsSync(setupNew) && !fs.existsSync(setupNewSafe)) {
  console.error('Build failed - setup exe not found');
  process.exit(1);
}
if (!fs.existsSync(latestYml)) {
  console.error('Build failed - latest.yml not found');
  process.exit(1);
}

const tempDir = path.join(distDir, `update-${newVersion}`);
fs.mkdirSync(tempDir, { recursive: true });
const srcSetup = fs.existsSync(setupNew) ? setupNew : setupNewSafe;
fs.copyFileSync(srcSetup, path.join(tempDir, path.basename(srcSetup)));
fs.copyFileSync(latestYml, path.join(tempDir, 'latest.yml'));

console.log(`Rebuilding ${oldVersion} (win-unpacked = older version for testing)...`);
pkg.version = oldVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
execSync('npm run build', { cwd: root, stdio: 'inherit' });

// Restore new version in package.json and dist artifacts
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
fs.copyFileSync(path.join(tempDir, path.basename(srcSetup)), srcSetup);
fs.copyFileSync(path.join(tempDir, 'latest.yml'), latestYml);
if (setupNew !== srcSetup) fs.copyFileSync(path.join(tempDir, path.basename(srcSetup)), setupNewSafe);
fs.rmSync(tempDir, { recursive: true });

console.log(`\nDone!`);
console.log(`  - Create GitHub release with tag: upnp-tray-v${newVersion}`);
console.log(`  - Upload dist/AnimeDB UPnP Setup ${newVersion}.exe and dist/latest.yml`);
console.log(`  - dist/win-unpacked/ = ${oldVersion} app (run this to test Check for updates)`);
