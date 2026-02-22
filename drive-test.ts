import { loadEnvConfig } from '@next/env'
import { DriveClient } from './src/lib/google-drive';

loadEnvConfig(process.cwd())

async function run() {
    console.log("Testing drive file: 17TDzffOQT4ohO2p7yQcuUUTYbj1tRg28")
    const drive = new DriveClient()
    try {
        const metadata = await drive.getFileMetadata('17TDzffOQT4ohO2p7yQcuUUTYbj1tRg28')
        console.log("Metadata SUCCESS:", metadata)
    } catch (e) {
        console.error("Metadata ERROR:", e)
    }
}

run().catch(console.error);
