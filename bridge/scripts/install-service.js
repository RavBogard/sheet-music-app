/**
 * Install CentralReform Bridge as a Windows Service
 * 
 * Usage: node scripts/install-service.js
 * 
 * Requires: npm install -g node-windows (one-time)
 * 
 * This registers the bridge server to start automatically
 * when the production PC boots up.
 */

const path = require('path')

try {
    const { Service } = require('node-windows')

    const svc = new Service({
        name: 'CentralReform Bridge',
        description: 'X32 Monitor Bridge for CentralReform',
        script: path.join(__dirname, '..', 'dist', 'index.js'),
        nodeOptions: [],
        env: [{
            name: 'NODE_ENV',
            value: 'production'
        }]
    })

    svc.on('install', () => {
        svc.start()
        console.log('✅ Service installed and started!')
        console.log('   The bridge will now start automatically on boot.')
        console.log('')
        console.log('   To uninstall: node scripts/uninstall-service.js')
    })

    svc.on('alreadyinstalled', () => {
        console.log('ℹ️  Service is already installed.')
        console.log('   To reinstall, run: node scripts/uninstall-service.js first')
    })

    svc.on('error', (err) => {
        console.error('❌ Failed to install service:', err)
    })

    console.log('Installing CentralReform Bridge as a Windows service...')
    svc.install()

} catch (e) {
    console.error('❌ node-windows is required. Install it with:')
    console.error('   npm install -g node-windows')
    console.error('')
    console.error('Then run this script again.')
}
