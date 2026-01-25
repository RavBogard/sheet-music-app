const fs = require('fs');
const { execSync } = require('child_process');

try {
    // Get Git Info
    const commitHash = execSync('git rev-parse --short HEAD').toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const buildDate = new Date().toLocaleString();

    // Get Last 5 Commits for Changelog
    const changelog = execSync('git log -5 --pretty=format:"%h - %s (%cr)"').toString().trim().split('\n');

    const buildInfo = {
        version: `${branch}-${commitHash}`,
        buildDate,
        changelog
    };

    fs.writeFileSync('./src/build-info.json', JSON.stringify(buildInfo, null, 2));
    console.log('Build info generated:', buildInfo);

} catch (error) {
    console.error('Failed to generate build info:', error);
    // Fallback if no git (e.g. Vercel sometimes needs full history, but usually fine)
    fs.writeFileSync('./src/build-info.json', JSON.stringify({
        version: 'dev',
        buildDate: new Date().toLocaleString(),
        changelog: ['Git info unavailable']
    }, null, 2));
}
