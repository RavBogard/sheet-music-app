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

function run(cmd) {
    return execSync(cmd, { encoding: 'utf-8' }).trim();
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
        latestTag = run('git describe --tags --abbrev=0 --match "v*"');
    } catch {
        latestTag = 'v0.0.0';
    }

    const base = parseVersion(latestTag) || { major: 0, minor: 0, patch: 0 };

    // Get commits since that tag
    let commitsSinceTag = [];
    try {
        const log = run(`git log ${latestTag}..HEAD --oneline --no-merges`);
        if (log) commitsSinceTag = log.split('\n');
    } catch {
        // No commits since tag, or tag doesn't exist in history
    }

    // Compute version
    let version;
    if (commitsSinceTag.length === 0) {
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
