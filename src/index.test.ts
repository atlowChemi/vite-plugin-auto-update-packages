/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
import type { ResolvedConfig } from 'vite';
import { afterEach, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';

const testedProps = new Set(['name', 'configResolved', 'configureServer', 'buildStart', 'buildEnd']);

type Utils = typeof import('./utils').Utils;
const abort = vi.fn();
vi.stubGlobal('AbortController', vi.fn(() => ({ abort })));
let SUPPORTED_PKG_MANAGERS: MockInstance<[], Utils['SUPPORTED_PKG_MANAGERS']>;
let handlePackageLockUpdates: MockInstance<Parameters<Utils['prototype']['handlePackageLockUpdates']>, ReturnType<Utils['prototype']['handlePackageLockUpdates']>>;
vi.mock('./utils', async () => {
    const module = await vi.importActual<typeof import('./utils')>('./utils');
    handlePackageLockUpdates = vi.spyOn(module.Utils.prototype, 'handlePackageLockUpdates');
    SUPPORTED_PKG_MANAGERS = vi.spyOn(module.Utils, 'SUPPORTED_PKG_MANAGERS', 'get').mockReturnValue(['npm'] as any);
    return module;
});

describe('autoUpdatePackages', () => {
    let config: ResolvedConfig;
    const logger = { error: vi.fn() };
    const resolver = vi.fn((val: string) => val);
    let defaultExp: typeof import('./index').default;
    let autoUpdatePackages: typeof import('./index').autoUpdatePackages;

    beforeAll(async () => {
        const module = await import('./index');
        defaultExp = module.default;
        autoUpdatePackages = module.autoUpdatePackages;
        config = { logger, createResolver: vi.fn(() => resolver) } as any as ResolvedConfig;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should export the same function named and default', () => {
        expect(defaultExp).toBe(autoUpdatePackages);
    });

    describe('configResolved', () => {
        it('should return a Vite plugin object, only with tested props', () => {
            const plugin = autoUpdatePackages();
            const pluginKeys = Object.keys(plugin);

            expect(pluginKeys).toHaveLength(testedProps.size);
            pluginKeys.forEach(key => expect(testedProps).toContain(key));
            expect(plugin.name).toBeTypeOf('string');
            expect(plugin.configResolved).toBeTypeOf('function');
            expect(plugin.configureServer).toBeTypeOf('function');
            expect(plugin.buildStart).toBeTypeOf('function');
            expect(plugin.buildEnd).toBeTypeOf('function');
        });

        it('should error on invalid package manager', async () => {
            const plugin = autoUpdatePackages({ pkgManager: 'invalid' as unknown as 'npm' });
            const configResolved = 'handler' in plugin.configResolved! ? plugin.configResolved.handler : plugin.configResolved!;
            expect(await configResolved(config)).toBeUndefined();
            expect(logger.error).toHaveBeenCalled();
        });

        it('should error on lock file not resolving', async () => {
            const plugin = autoUpdatePackages();
            const configResolved = 'handler' in plugin.configResolved! ? plugin.configResolved.handler : plugin.configResolved!;
            resolver.mockResolvedValueOnce('');
            expect(await configResolved(config)).toBeUndefined();
            expect(resolver).toHaveBeenCalledOnce();
            expect(logger.error).toHaveBeenCalled();
        });

        it('should complete successfully when lock file resolves', async () => {
            const plugin = autoUpdatePackages();
            const configResolved = 'handler' in plugin.configResolved! ? plugin.configResolved.handler : plugin.configResolved!;
            expect(await configResolved(config)).toBeUndefined();
            expect(resolver).toHaveBeenCalledOnce();
            expect(logger.error).not.toHaveBeenCalled();
        });
    });

    describe('buildStart', () => {
        it('exits early when not in build mode', () => {
            const plugin = autoUpdatePackages();
            const buildStart = 'handler' in plugin.buildStart! ? plugin.buildStart.handler : plugin.buildStart!;
            expect(buildStart.apply({} as any, {} as any)).toBeUndefined();
            expect(SUPPORTED_PKG_MANAGERS).not.toHaveBeenCalled();
            expect(handlePackageLockUpdates).not.toHaveBeenCalled();
        });

        it('should error and early exit on invalid package manager', async () => {
            Object.assign(config, { command: 'build', cacheDir: 'cacheDir' });
            const plugin = autoUpdatePackages({ pkgManager: 'invalid' as unknown as 'npm' });
            const configResolved = 'handler' in plugin.configResolved! ? plugin.configResolved.handler : plugin.configResolved!;
            const buildStart = 'handler' in plugin.buildStart! ? plugin.buildStart.handler : plugin.buildStart!;
            expect(await configResolved(config)).toBeUndefined();
            expect(buildStart.apply({} as any, {} as any)).toBeUndefined();
            expect(logger.error).toHaveBeenCalled();
            expect(SUPPORTED_PKG_MANAGERS).toHaveBeenCalledOnce();
            expect(handlePackageLockUpdates).not.toHaveBeenCalled();

            Object.assign(config, { command: undefined, cacheDir: undefined });
            expect(config.command).toBeUndefined();
            expect(config.cacheDir).toBeUndefined();
        });

        it('should error and early exit on missing cache dir', async () => {
            Object.assign(config, { command: 'build' });
            const plugin = autoUpdatePackages({ pkgManager: 'npm' });
            const configResolved = 'handler' in plugin.configResolved! ? plugin.configResolved.handler : plugin.configResolved!;
            const buildStart = 'handler' in plugin.buildStart! ? plugin.buildStart.handler : plugin.buildStart!;
            expect(await configResolved(config)).toBeUndefined();
            expect(buildStart.apply({} as any, {} as any)).toBeUndefined();
            expect(SUPPORTED_PKG_MANAGERS).toHaveBeenCalledOnce();
            expect(handlePackageLockUpdates).not.toHaveBeenCalled();

            Object.assign(config, { command: undefined, cacheDir: undefined });
            expect(config.command).toBeUndefined();
            expect(config.cacheDir).toBeUndefined();
        });

        it('should execute handlePackageLockUpdates', async () => {
            Object.assign(config, { command: 'build', cacheDir: 'cacheDir' });
            const plugin = autoUpdatePackages({ pkgManager: 'npm' });
            const configResolved = 'handler' in plugin.configResolved! ? plugin.configResolved.handler : plugin.configResolved!;
            const buildStart = 'handler' in plugin.buildStart! ? plugin.buildStart.handler : plugin.buildStart!;
            expect(await configResolved(config)).toBeUndefined();
            expect(buildStart.apply({} as any, {} as any)).toBeUndefined();
            expect(SUPPORTED_PKG_MANAGERS).toHaveBeenCalledTimes(2);
            expect(handlePackageLockUpdates).toHaveBeenCalledOnce();

            Object.assign(config, { command: undefined, cacheDir: undefined });
            expect(config.command).toBeUndefined();
            expect(config.cacheDir).toBeUndefined();
        });
    });

    describe('buildEnd', () => {
        it('should abort the controller on buildEnd', () => {
            const plugin = autoUpdatePackages();
            const buildEnd = 'handler' in plugin.buildEnd! ? plugin.buildEnd.handler : plugin.buildEnd!;
            expect(buildEnd.apply({} as any)).toBeUndefined();
            expect(abort).toHaveBeenCalled();
        });
    });
});
