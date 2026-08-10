import { config as dotenvConfig } from 'dotenv';
import { UnderworldApplication } from './UnderworldApplication';

dotenvConfig();

async function main() {
    const app = new UnderworldApplication();

    try {
        await app.bootstrap();
        await app.initSession();
        await app.configureAgents();
        await app.startMinecraftBot();
        
        app.startCLI();
    } catch (err) {
        console.error('Fatal error during startup:', err);
        process.exit(1);
    }
}

main();
