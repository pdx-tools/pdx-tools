#!/usr/bin/env node

import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readdir } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..', '..');

const execCommand = async (command, options = {}) => {
    console.log(`Executing: ${command}`);
    return new Promise((resolve, reject) => {
        const isWindows = process.platform === 'win32';
        const shell = isWindows ? 'cmd' : 'sh';
        const shellFlag = isWindows ? '/c' : '-c';
        
        const child = spawn(shell, [shellFlag, command], {
            cwd: projectRoot,
            stdio: 'inherit',
            ...options,
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });
        
        child.on('error', (error) => {
            reject(error);
        });
    });
};

async function main() {
    const args = process.argv.slice(2);
    
    // Parse environment argument
    let env = 'test'; // default
    let remainingArgs = args;
    
    if (args[0] === '--test') {
        env = 'test';
        remainingArgs = args.slice(1);
    } else if (args[0] === '--dev') {
        env = 'dev';
        remainingArgs = args.slice(1);
    }
    
    const envPrefix = `mise run env:${env} --`;
    
    await execCommand(`${envPrefix} build`);
    await execCommand(`${envPrefix} up --no-start`);
    await execCommand(`${envPrefix} up --wait db`);
    
    // Wait for PostgreSQL to be ready (up to 3 attempts)
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await execCommand(`${envPrefix} exec -u postgres --no-TTY db pg_isready`);
            break;
        } catch (error) {
            if (attempt === 3) {
                throw error;
            }
            console.log(`PostgreSQL not ready, attempt ${attempt}/3. Waiting 1 second...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    

    await execCommand(`${envPrefix} cp ../src/app/migrations db:/`);
    // Run migrations
    const migrationFiles = await readdir(resolve(projectRoot, 'src/app/migrations'));
    const sqlFiles = migrationFiles.filter(file => file.endsWith('.sql')).sort();
    
    for (const sqlFile of sqlFiles) {
        await execCommand(`${envPrefix} exec -u postgres --no-TTY db psql -f /migrations/${sqlFile}`);
    }
    
    const upArgs = remainingArgs.length > 0 ? ` ${remainingArgs.join(' ')}` : '';
    await execCommand(`${envPrefix} up${upArgs}`);
}

await main();