const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Auto-generates build-info.json with:
 * - Version derived from latest git tag + commit analysis (no manual bumping)
 * - Commit hash and branch
 * - Changelog from recent conventional commits
 *
 * Version logic:
 *   1. Find latest v*.*.* tag (e.g., v4.1.1)
 *   2. Count commits since that tag
 *   3. If 0 commits → use tag version as-is
 *   4. If commits exist with "feat:" → bump minor, reset patch (4.1.1 → 4.2.0)
 *   5. If commits exist with only "fix:/perf:/refactor:" → bump patch (4.1.1 → 4.1.2)
 *   6. Write computed version back to package.json so other tools stay in sync
 *
 * To "release" a version: just `git tag v4.2.0` — subsequent builds auto-increment from there.
 */

function run(cmd, { silent = false } = {}) {
    const opts = { encoding: 'utf-8' };
    if (silent) opts.stdio = ['pipe', 'pipe', 'ignore'];
    return execSync(cmd, opts).trim();
}

function parseVersion(tag) {
    const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;
    return { major: parseInt(match[1]), minor: parseInt(match[2]), patch: parseInt(match[3]) };
}

try {
    const commitHash = run('git rev-parse --short HEAD');
    const branch = run('git rev-parse --abbrev-ref HEAD');
    const buildDate = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });

    // Find latest version tag
    let latestTag;
    try {
        // First try to unshallow if needed (Vercel does shallow clones)
        try { run('git fetch --tags --depth=1', { silent: true }); } catch { /* ok */ }
        latestTag = run('git describe --tags --abbrev=0 --match "v*"', { silent: true });
    } catch {
        latestTag = null;
    }

    // v54-02 fix: previously, when no tag was found (shallow clone), this
    // fell back to `pkg.version` and computed bumps from there. That made
    // the version regress whenever pkg.version was already stale — a
    // bad run wrote pkg.version=0.2.6, the next run read 0.2.6 as
    // baseline and computed 0.3.0, etc. The high-water v5.3 git tag was
    // ignored. Fix: when git describe fails, KEEP whatever pkg.version
    // already says — do not recompute, do not bump. This way shallow
    // clones (Vercel default) preserve the version set by the most-recent
    // full-history run instead of regressing.
    let base;
    let skipBump = false;
    if (latestTag) {
        base = parseVersion(latestTag) || { major: 0, minor: 0, patch: 0 };
    } else {
        const pkgPath = path.join(__dirname, '..', 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const parsed = parseVersion('v' + (pkg.version || '0.0.0'));
        base = parsed || { major: 0, minor: 0, patch: 0 };
        latestTag = 'v' + pkg.version;
        // Skip the bump arithmetic when we're operating without a real
        // tag — preserve the version we read.
        skipBump = true;
        console.warn(
            `[build-info] no git tag found (shallow clone?). Using package.json version v${pkg.version || '0.0.0'} as-is; will not bump.`,
        );
    }

    // Get commits since that tag
    let commitsSinceTag = [];
    try {
        const log = run(`git log ${latestTag}..HEAD --oneline --no-merges`);
        if (log) commitsSinceTag = log.split('\n');
    } catch {
        // Shallow clone can't compare to tag — try last 20 commits instead
        try {
            const log = run('git log --oneline --no-merges -20');
            if (log) commitsSinceTag = log.split('\n');
        } catch { /* no git log available */ }
    }

    // Compute version
    let version;
    if (skipBump) {
        // No real tag → use whatever pkg.version was as-is, no arithmetic.
        version = `${base.major}.${base.minor}.${base.patch}`;
    } else if (commitsSinceTag.length === 0) {
        // Exactly at the tag
        version = `${base.major}.${base.minor}.${base.patch}`;
    } else {
        const hasFeature = commitsSinceTag.some(line => /\bfeat[:(]/.test(line));
        if (hasFeature) {
            // Minor bump: new features since last release
            version = `${base.major}.${base.minor + 1}.0`;
        } else {
            // Patch bump: fixes/perf/refactor only
            version = `${base.major}.${base.minor}.${base.patch + 1}`;
        }
    }

    // Build changelog from recent meaningful commits
    let changelog = [];
    try {
        const log = run('git log --oneline --no-merges -20');
        changelog = log
            .split('\n')
            .filter(line => /feat:|fix:|refactor:|perf:/.test(line))
            .map(line => {
                const msg = line.replace(/^[a-f0-9]+ /, '');
                return `${version} - ${msg}`;
            })
            .slice(0, 12);
    } catch { /* no git log available */ }

    const buildInfo = {
        version,
        commit: commitHash,
        branch,
        buildDate,
        changelog,
    };

    // Write build-info.json
    const outPath = path.join(__dirname, '..', 'src', 'build-info.json');
    fs.writeFileSync(outPath, JSON.stringify(buildInfo, null, 2) + '\n');

    // Keep package.json version in sync (so other tools that read it get the right number)
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg.version !== version) {
        pkg.version = version;
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    }

    console.log(`✓ build-info.json → v${version} (${commitHash}) [${commitsSinceTag.length} commits since ${latestTag}]`);

} catch (error) {
    console.error('Failed to generate build info:', error.message);
    const outPath = path.join(__dirname, '..', 'src', 'build-info.json');
    fs.writeFileSync(outPath, JSON.stringify({
        version: 'dev',
        commit: 'unknown',
        branch: 'unknown',
        buildDate: new Date().toLocaleDateString(),
        changelog: ['Build info unavailable']
    }, null, 2) + '\n');
}
