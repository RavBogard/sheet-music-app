const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
    const commitHash = execSync('git rev-parse --short HEAD').toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const buildDate = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });

    // Read version from package.json (single source of truth)
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const version = pkg.version;

    // Get recent meaningful commits for changelog
    const log = execSync('git log --oneline --no-merges -20').toString().trim();
    const changelog = log
        .split('\n')
        .filter(line => /feat:|fix:|refactor:|perf:/.test(line))
        .map(line => {
            const msg = line.replace(/^[a-f0-9]+ /, '');
            return `${version} - ${msg}`;
        })
        .slice(0, 12);

    const buildInfo = {
        version,
        commit: commitHash,
        branch,
        buildDate,
        changelog,
    };

    const outPath = path.join(__dirname, '..', 'src', 'build-info.json');
    fs.writeFileSync(outPath, JSON.stringify(buildInfo, null, 2) + '\n');
    console.log(`✓ build-info.json → v${version} (${commitHash})`);

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
