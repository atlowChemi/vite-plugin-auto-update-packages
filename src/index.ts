import type { Logger, Plugin, ViteDevServer } from 'vite';
import { Utils, type SupportedPkgManager } from './utils';

interface Options {
    /**
     * The package manager used by the project for installing dependencies.
     *
     * This will affect the which lock file is watched, as well as the installation command executed.
     * @default 'npm'
     */
    pkgManager?: SupportedPkgManager;
    /**
     * If set to true, the plugin will install dependencies if the lock-file cache is not found upon instantiation.
     * @default false
     */
    installOnCacheNotFound?: boolean;
}

const ac = new AbortController();

/**
 * A Vite Plugin that watches for changes in the lock file, and re-installs dependencies on lock changes.
 *
 * This is can be useful when working in a team, in a case where the dependencies are updated by other team members, and the changes were pulled in from the remote repository while the dev server is running.
 * @param options Customization options for the plugin.
 */
export function autoUpdatePackages(options: Options = {}): Plugin<never> {
    let logger: Logger | undefined;
    let isBuild: boolean | undefined;
    let cacheDir: string | undefined;
    let pkgLockPath: string | undefined;
    let server: ViteDevServer | undefined;

    const { pkgManager = 'npm' } = options;

    return {
        name: 'auto-update-packages',
        async configResolved(config) {
            ({ logger, cacheDir } = config);
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
        configureServer(s) {
            server = s;
        },
        buildStart() {
            if (!isBuild || !pkgLockPath || !logger || !cacheDir) {
                return;
            }
            const { pkgManager = 'npm' } = options;
            if (!Utils.SUPPORTED_PKG_MANAGERS.includes(pkgManager)) {
                logger.error('Using an invalid package manager.', { error: new Error(`Unsupported package manager: ${pkgManager}`), timestamp: true });
                return;
            }
            const utils = new Utils({ logger, cacheDir, pkgLockPath, pkgManager, signal: ac.signal, installOnCacheNotFound: options.installOnCacheNotFound });
            utils.handlePackageLockUpdates(server).catch(err => logger!.error('', { error: err as Error, timestamp: true }));
        },
        buildEnd() {
            ac.abort();
        },
    };
}
export default autoUpdatePackages;
