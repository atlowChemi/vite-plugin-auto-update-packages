import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as childProcess from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Utils, type SupportedPkgManager, type WatcherArgs } from './utils';
import type { ViteDevServer } from 'vite';

const baseOptions: WatcherArgs = { cacheDir: '', pkgLockPath: '', pkgManager: 'npm', signal: new AbortController().signal };

vi.mock('node:fs/promises', async () => {
    const fsPromises = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const access = vi.fn().mockRejectedValueOnce(new Error());
    return { ...fsPromises, access, watch: vi.fn(fsPromises.watch), mkdir: vi.fn(), writeFile: vi.fn(), readFile: vi.fn() };
});
vi.mock('node:child_process', async () => {
    const childProcess = await vi.importActual<typeof import('node:child_process')>('node:process');
    const exec = vi.fn();
    // @ts-expect-error adding promisify to exec
    exec[promisify.custom] = vi.fn();
    return { ...childProcess, exec };
});

describe('utils', () => {
    describe('doesFileExist', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('return false if file doesn\'t have read access', async () => {
            const utils = new Utils(baseOptions);
            expect(await utils.doesFileExist('foo', 'bar')).to.equal(false);
            expect(fs.access).toHaveBeenCalledOnce();
        });

        it('return true if file has read access', async () => {
            const utils = new Utils(baseOptions);
            expect(await utils.doesFileExist('foo', 'bar')).to.equal(true);
            expect(fs.access).toHaveBeenCalledOnce();
        });
    });

    describe('handlePackageLockUpdates', () => {
        let utils: Utils;
        const restart = vi.fn();
        const devServer = { restart } as unknown as ViteDevServer;
        let setupWatcher: MockInstance<Parameters<typeof Utils.prototype['setupWatcher']>, ReturnType<typeof Utils.prototype['setupWatcher']>>;
        let doesFileExist: MockInstance<Parameters<typeof Utils.prototype['doesFileExist']>, ReturnType<typeof Utils.prototype['doesFileExist']>>;
        let getBufferHash: MockInstance<Parameters<typeof Utils.prototype['getBufferHash']>, ReturnType<typeof Utils.prototype['getBufferHash']>>;
        let installPackagesAndWriteHash: MockInstance<Parameters<typeof Utils.prototype['installPackagesAndWriteHash']>, ReturnType<typeof Utils.prototype['installPackagesAndWriteHash']>>;
        beforeEach(() => {
            utils = new Utils({ ...baseOptions });
            doesFileExist = vi.spyOn(utils, 'doesFileExist').mockResolvedValue(true);
            getBufferHash = vi.spyOn(utils, 'getBufferHash');
            setupWatcher = vi.spyOn(utils, 'setupWatcher').mockImplementation(vi.fn());
            installPackagesAndWriteHash = vi.spyOn(utils, 'installPackagesAndWriteHash').mockImplementation(vi.fn());
        });
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('handles missing cache', async () => {
            doesFileExist.mockResolvedValueOnce(false);
            vi.mocked(fs.readFile).mockResolvedValueOnce('lock-content');
            await utils.handlePackageLockUpdates(devServer);
            expect(doesFileExist).toHaveBeenCalledOnce();
            expect(getBufferHash).toHaveBeenCalledOnce();
            expect(installPackagesAndWriteHash).toHaveBeenCalledOnce();
            expect(restart).toHaveBeenCalledWith(true);
            expect(setupWatcher).toHaveBeenCalledOnce();
        });

        it('will not get hash when cache not found but signal aborted', async () => {
            doesFileExist.mockResolvedValueOnce(false);
            // @ts-expect-error writing to private options
            utils.options.signal = AbortSignal.abort('aborted');
            await utils.handlePackageLockUpdates();
            expect(doesFileExist).toHaveBeenCalledOnce();
            expect(getBufferHash).not.toHaveBeenCalled();
            expect(installPackagesAndWriteHash).not.toHaveBeenCalled();
            expect(restart).not.toHaveBeenCalled();
        });

        it('exits early if signal aborted', async () => {
            // @ts-expect-error writing to private options
            utils.options.signal = AbortSignal.abort('aborted');
            vi.mocked(fs.readFile).mockResolvedValueOnce('some-hash').mockResolvedValueOnce('lock-content');
            await utils.handlePackageLockUpdates();
            expect(doesFileExist).toHaveBeenCalledOnce();
            expect(fs.readFile).toHaveBeenCalledTimes(2);
            expect(getBufferHash).not.toHaveBeenCalled();
            expect(installPackagesAndWriteHash).not.toHaveBeenCalled();
            expect(restart).not.toHaveBeenCalled();
        });

        it('exits early if hash identical', async () => {
            vi.mocked(fs.readFile).mockResolvedValueOnce('some-hash').mockResolvedValueOnce('lock-content');
            getBufferHash.mockReturnValueOnce('some-hash');
            await utils.handlePackageLockUpdates();
            expect(doesFileExist).toHaveBeenCalledOnce();
            expect(fs.readFile).toHaveBeenCalledTimes(2);
            expect(getBufferHash).toHaveBeenCalledWith('lock-content');
            expect(installPackagesAndWriteHash).not.toHaveBeenCalled();
            expect(restart).not.toHaveBeenCalled();
        });

        it('will setup watcher', async () => {
            vi.mocked(fs.readFile).mockResolvedValueOnce('some-hash').mockResolvedValueOnce('lock-content');
            await utils.handlePackageLockUpdates(devServer);
            expect(doesFileExist).toHaveBeenCalledOnce();
            expect(getBufferHash).toHaveBeenCalledOnce();
            expect(installPackagesAndWriteHash).toHaveBeenCalledOnce();
            expect(restart).toHaveBeenCalledWith(true);
            expect(setupWatcher).toHaveBeenCalledOnce();
            expect(setupWatcher).toHaveBeenCalledWith(devServer);
        });
    });

    describe('setupWatcher', () => {
        const pkgLockPath = './file-path-somewhere.json';
        let utils: Utils;
        let ac: AbortController;
        let handleWatchEvent: MockInstance<Parameters<typeof Utils.prototype['handleWatchEvent']>, ReturnType<typeof Utils.prototype['handleWatchEvent']>>;

        beforeEach(() => {
            ac = new AbortController();
            utils = new Utils({ ...baseOptions, pkgLockPath, signal: ac.signal });
            handleWatchEvent = vi.spyOn(utils, 'handleWatchEvent').mockImplementation(vi.fn());
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('throws error if no such folder', async () => {
            const err = await utils.setupWatcher().catch(e => e as Error);
            expect(err).toBeInstanceOf(Error);
            expect((err as Error).message).to.be.eq(`ENOENT: no such file or directory, watch '${pkgLockPath}'`);
        });

        it('handles AbortError without throwing an error', async () => {
            ac.abort();
            expect(await utils.setupWatcher()).toBeUndefined();
        });

        it('attempts to handle the event', async () => {
            const restart = vi.fn();
            const { watch, readFile } = fs;
            const devServer = { restart } as unknown as ViteDevServer;
            const event = { eventType: 'change', filename: 'whatever.ext' };
            function* mock() {
                yield event;
            }
            if (vi.isMockFunction(watch)) watch.mockReturnValue(mock());
            if (vi.isMockFunction(readFile)) readFile.mockResolvedValue('some-hash');

            const result = await utils.setupWatcher(devServer);
            expect(result).toBeUndefined();
            expect(handleWatchEvent).toBeCalledWith(event, devServer);
        });
    });

    describe('handleWatchEvent', () => {
        let utils: Utils;
        let getBufferHash: MockInstance<Parameters<typeof Utils.prototype['getBufferHash']>, ReturnType<typeof Utils.prototype['getBufferHash']>>;
        let installPackagesAndWriteHash: MockInstance<Parameters<typeof Utils.prototype['installPackagesAndWriteHash']>, ReturnType<typeof Utils.prototype['installPackagesAndWriteHash']>>;

        beforeEach(() => {
            utils = new Utils({ ...baseOptions });
            getBufferHash = vi.spyOn(utils, 'getBufferHash');
            installPackagesAndWriteHash = vi.spyOn(utils, 'installPackagesAndWriteHash').mockImplementation(vi.fn());
        });
        afterEach(() => {
            vi.restoreAllMocks();
        });

        const { readFile } = fs;
        const pkgLockPath = 'ex.svg';

        it('doesn\'t execute callback for file rename', async () => {
            await utils.handleWatchEvent({ eventType: 'rename', filename: pkgLockPath });
            expect(readFile).not.toHaveBeenCalled();
            expect(installPackagesAndWriteHash).not.toHaveBeenCalled();
        });

        it('doesn\'t execute callback for files with empty name', async () => {
            await utils.handleWatchEvent({ eventType: 'change', filename: '' });
            expect(readFile).not.toHaveBeenCalled();
            expect(installPackagesAndWriteHash).not.toHaveBeenCalled();
        });

        it('aborts after reading files if aborted', async () => {
            // @ts-expect-error writing to private options
            utils.options.signal = AbortSignal.abort('aborted');

            await utils.handleWatchEvent({ eventType: 'change', filename: pkgLockPath });
            expect(readFile).toHaveBeenCalledTimes(2);
            expect(getBufferHash).not.toHaveBeenCalled();
            expect(installPackagesAndWriteHash).not.toHaveBeenCalled();
        });

        it('skips callback if hash identical', async () => {
            vi.mocked(readFile).mockResolvedValueOnce('some-hash').mockResolvedValueOnce('lock-content');
            getBufferHash.mockReturnValue('some-hash');
            await utils.handleWatchEvent({ eventType: 'change', filename: pkgLockPath });
            expect(readFile).toHaveBeenCalledTimes(2);
            expect(getBufferHash).toHaveBeenCalledOnce();
            expect(installPackagesAndWriteHash).not.toHaveBeenCalled();
        });

        it('executes callback for changed file', async () => {
            vi.mocked(readFile).mockResolvedValueOnce('some-hash').mockResolvedValueOnce('another-hash');
            await utils.handleWatchEvent({ eventType: 'change', filename: pkgLockPath });
            expect(readFile).toHaveBeenCalledTimes(2);
            expect(getBufferHash).toHaveBeenCalled();
            expect(installPackagesAndWriteHash).toHaveBeenCalledOnce();
        });

        it('restarts server for changed file', async () => {
            const restart = vi.fn();
            const devServer = { restart } as unknown as ViteDevServer;

            vi.mocked(readFile).mockResolvedValueOnce('some-hash').mockResolvedValueOnce('another-hash');
            await utils.handleWatchEvent({ eventType: 'change', filename: pkgLockPath }, devServer);
            expect(readFile).toHaveBeenCalledTimes(2);
            expect(getBufferHash).toHaveBeenCalled();
            expect(installPackagesAndWriteHash).toHaveBeenCalledOnce();
            expect(restart).toHaveBeenCalledWith(true);
        });
    });

    describe('installPackagesAndWriteHash', () => {
        let utils: Utils;
        let ensureDirExistsAndWriteFile: MockInstance<Parameters<typeof Utils.prototype['ensureDirExistsAndWriteFile']>, ReturnType<typeof Utils.prototype['ensureDirExistsAndWriteFile']>>;
        beforeEach(() => {
            utils = new Utils(baseOptions);
            ensureDirExistsAndWriteFile = vi.spyOn(utils, 'ensureDirExistsAndWriteFile').mockImplementation(vi.fn());
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        // @ts-expect-error typing of custom promise is not correct
        const { exec: { [promisify.custom]: exec } } = childProcess;

        it('attempts to write new hash', async () => {
            const signal = new AbortController().signal;
            await utils.installPackagesAndWriteHash({ hash: 'new-hash', hashFile: 'hash-file', pkgManager: 'npm', signal });
            expect(ensureDirExistsAndWriteFile).toHaveBeenCalledWith('new-hash', 'hash-file', signal);
            expect(exec).toHaveBeenCalled();
        });

        it('allows skipping installation', async () => {
            const signal = new AbortController().signal;
            await utils.installPackagesAndWriteHash({ hash: 'new-hash', hashFile: 'hash-file', pkgManager: 'npm', skipInstall: true, signal });
            expect(ensureDirExistsAndWriteFile).toHaveBeenCalledWith('new-hash', 'hash-file', signal);
            expect(exec).not.toHaveBeenCalled();
        });

        const data = Object.entries(Utils.COMMAND_MAP);
        it.concurrent.each(data)('runs correct installation based on package manager "%s"', async (manager, expectedCommand) => {
            const signal = new AbortController().signal;
            await utils.installPackagesAndWriteHash({ hash: 'new-hash', hashFile: 'hash-file', pkgManager: manager as SupportedPkgManager, signal });
            expect(exec).toHaveBeenCalledWith(expectedCommand, { signal });
        });
    });

    describe.concurrent('getBufferHash', () => {
        const testData: [string, string][] = [
            // [string, sha256 of string]
            ['test data 1', '05e8fdb3598f91bcc3ce41a196e587b4592c8cdfc371c217274bfda2d24b1b4e'],
            ['test data 2', '26637da1bd793f9011a3d304372a9ec44e36cc677d2bbfba32a2f31f912358fe'],
            ['test data 3', 'b2ce6625a947373fe8d578dca152cf152a5bd8aeca805b2d3b1fb4a340e1a123'],
            ['test data 4', '1e2b98ff6439d48d42ae71c0ea44f3c1e03665a34d1c368ac590aec5dadc48eb'],
            ['test data 5', '225b2e6c5664bb388cc40c9abeb289f9569ebc683ed4fdd76fef8421c32369b5'],
        ];
        const utils = new Utils(baseOptions);

        it.concurrent.each(testData)('should generate a correct hash for "%s"', (data, hash) => {
            const calculatedHash = utils.getBufferHash(Buffer.from(data));
            expect(calculatedHash).toEqual(hash);
        });
    });

    describe.concurrent('ensureDirExistsAndWriteFile', () => {
        const utils = new Utils(baseOptions);

        it.concurrent('makes a parent directory and writes file', async () => {
            const dir = '/root/example';
            const file = `${dir}/file.css`;
            const content = 'content';
            await utils.ensureDirExistsAndWriteFile(content, file);
            expect(fs.mkdir).toBeCalledWith(dir, { mode: 0o777, recursive: true });
            expect(fs.writeFile).toBeCalledWith(file, content, { signal: undefined });
        });
    });
});
