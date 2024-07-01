import { constants } from 'node:fs';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { exec } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { watch, access, mkdir, writeFile, readFile } from 'node:fs/promises';
import type { FileChangeInfo } from 'node:fs/promises';
import type { Logger } from 'vite';

const execAsync = promisify(exec);
export type SupportedPkgManager = typeof Utils.SUPPORTED_PKG_MANAGERS[number];
export interface WatcherArgs {
    logger?: Logger;
    cacheDir: string;
    pkgLockPath: string;
    signal: AbortSignal;
    pkgManager: SupportedPkgManager;
    installOnCacheNotFound?: boolean;
}

export class Utils {
    #watcher: ReturnType<typeof watch> | undefined;

    public static readonly SUPPORTED_PKG_MANAGERS = ['npm', 'yarn', 'pnpm', 'bun'] as const;
    public static readonly HASH_FILE_NAME = '.auto-update-pkgs-hash';
    public static readonly LOCK_FILE_MAP: Record<SupportedPkgManager, string> = {
        npm: 'package-lock.json',
        yarn: 'yarn.lock',
        pnpm: 'pnpm-lock.yaml',
        bun: 'bun.lockb',
    };

    public static readonly COMMAND_MAP: Record<SupportedPkgManager, string> = {
        npm: 'npm install',
        yarn: 'yarn install',
        pnpm: 'pnpm install',
        bun: 'bun install',
    };

    constructor(private readonly options: WatcherArgs) {}

    public async doesFileExist(folderPath: string, fileName: string) {
        const fileToFind = resolve(folderPath, fileName);
        try {
            await access(fileToFind, constants.R_OK);
            return true;
        } catch {
            return false;
        }
    }

    public async handlePackageLockUpdates() {
        const { cacheDir, pkgLockPath, pkgManager, signal, installOnCacheNotFound, logger } = this.options;

        const hashFile = resolve(cacheDir, Utils.HASH_FILE_NAME);
        const doesHashFileExist = await this.doesFileExist(hashFile, '');
        if (!doesHashFileExist) {
            logger?.info('Seems that auto-update-packages cache is missing, setting cache');
            const pkgLock = await readFile(pkgLockPath, { signal });
            if (signal.aborted) return;
            const newHash = this.getBufferHash(pkgLock);
            await this.installPackagesAndWriteHash({
                hash: newHash,
                hashFile,
                pkgManager,
                signal,
                skipInstall: !installOnCacheNotFound,
            });
        } else {
            const [prevHash, pkgLock] = await Promise.all([
                readFile(hashFile, { signal, encoding: 'utf-8' }),
                readFile(pkgLockPath, { signal }),
            ]);
            if (signal.aborted) return;
            const newHash = this.getBufferHash(pkgLock);
            if (prevHash === newHash) {
                logger?.info('No changes in package-lock.json, skipping installation');
                return;
            }
            await this.installPackagesAndWriteHash({ hash: newHash, hashFile, pkgManager, signal });
        }

        return this.setupWatcher();
    }

    public async setupWatcher() {
        const { pkgLockPath, signal } = this.options;
        try {
            this.#watcher = watch(pkgLockPath, { signal });
            for await (const event of this.#watcher) {
                await this.handleWatchEvent(event);
            }
        } catch (err) {
            if ('name' in err && err instanceof Error && err.name === 'AbortError') {
                return;
            }
            throw err;
        }
    }

    public async handleWatchEvent({ eventType, filename }: FileChangeInfo<string>) {
        if (eventType !== 'change' || !filename) {
            return;
        }
        const { cacheDir, pkgLockPath, pkgManager, signal } = this.options;
        const hashFile = resolve(cacheDir, Utils.HASH_FILE_NAME);
        const [prevHash, pkgLock] = await Promise.all([
            readFile(hashFile, { signal, encoding: 'utf-8' }),
            readFile(pkgLockPath, { signal }),
        ]);
        if (signal.aborted) return;
        const newHash = this.getBufferHash(pkgLock);
        if (prevHash === newHash) {
            return;
        }
        await this.installPackagesAndWriteHash({ hash: newHash, hashFile, pkgManager, signal });
    }

    public async installPackagesAndWriteHash({ hash, hashFile, pkgManager, signal, skipInstall }: { hash: string; hashFile: string; pkgManager: SupportedPkgManager; signal: AbortSignal; skipInstall?: boolean }) {
        await Promise.all([
            this.ensureDirExistsAndWriteFile(hash, hashFile, signal),
            !skipInstall && execAsync(Utils.COMMAND_MAP[pkgManager], { signal }),
        ]);
    }

    public getBufferHash(buf: Buffer) {
        return createHash('sha256').update(buf).digest('hex');
    }

    public async ensureDirExistsAndWriteFile(content: string | Buffer, dest: string, signal?: AbortSignal) {
        const options = { mode: 0o777, recursive: true };
        await mkdir(dirname(dest), options);
        await writeFile(dest, content, { signal });
    }
}
