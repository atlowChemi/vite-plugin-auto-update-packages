import type { Logger, Plugin } from 'vite';
import { Utils, type SupportedPkgManager } from './utils';

interface Options {
    /**
     * @default 'npm'
     */
    pkgManager?: SupportedPkgManager;
    /**
     * @default false
     */
    installOnCacheNotFound?: boolean;
}

const ac = new AbortController();

export function autoUpdatePackages(options: Options): Plugin<never> {
    let logger: Logger;
    let isBuild: boolean;
    let cacheDir: string;
    let pkgLockPath: string;

    const { pkgManager = 'npm' } = options;

    return {
        name: 'auto-update-packages',
        async configResolved(config) {
            ({ logger } = config);
            ({ cacheDir } = config);
            isBuild = config.command === 'build';
            const resolver = config.createResolver({ extensions: ['.json'] });

            if (!Utils.SUPPORTED_PKG_MANAGERS.includes(pkgManager)) {
                logger.error('Using an invalid package manager.', { error: new Error(`Unsupported package manager: ${pkgManager}`), timestamp: true });
            }

            const path = await resolver(Utils.LOCK_FILE_MAP[pkgManager]);
            if (!path) {
                logger.error(`Could not find ${Utils.LOCK_FILE_MAP[pkgManager]} file.`, { timestamp: true });
                return;
            }
            pkgLockPath = path;
        },
        buildStart() {
            if (!isBuild || !pkgLockPath) {
                return;
            }
            const { pkgManager = 'npm' } = options;
            if (!Utils.SUPPORTED_PKG_MANAGERS.includes(pkgManager)) {
                logger.error('Using an invalid package manager.', { error: new Error(`Unsupported package manager: ${pkgManager}`), timestamp: true });
            }
            const utils = new Utils({ logger, cacheDir, pkgLockPath, pkgManager, signal: ac.signal, installOnCacheNotFound: options.installOnCacheNotFound });
            utils.handlePackageLockUpdates().catch(err => logger.error('', { error: err as Error, timestamp: true }));
        },
        buildEnd() {
            ac.abort();
        },
    };
}
export default autoUpdatePackages;
