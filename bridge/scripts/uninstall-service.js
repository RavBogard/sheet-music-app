/**
 * Uninstall CentralReform Bridge Windows Service
 * 
 * Usage: node scripts/uninstall-service.js
 */

const path = require('path')

try {
    const { Service } = require('node-windows')

    const svc = new Service({
        name: 'CentralReform Bridge',
        script: path.join(__dirname, '..', 'dist', 'index.js'),
    })

    svc.on('uninstall', () => {
        console.log('✅ Service uninstalled.')
        console.log('   The bridge will no longer start on boot.')
    })

    svc.on('error', (err) => {
        console.error('❌ Failed to uninstall service:', err)
    })

    console.log('Uninstalling CentralReform Bridge service...')
    svc.uninstall()

} catch (e) {
    console.error('❌ node-windows is required. Install it with:')
    console.error('   npm install -g node-windows')
}
