# vite-plugin-auto-update-packages

[![npm](https://img.shields.io/npm/v/vite-plugin-auto-update-packages.svg?style=flat-square)](https://www.npmjs.com/package/vite-plugin-auto-update-packages)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/atlowChemi/vite-plugin-auto-update-packages/main.yaml?branch=main&style=flat-square)
[![npm](https://img.shields.io/npm/dm/vite-plugin-auto-update-packages.svg?style=flat-square)](https://www.npmjs.com/package/vite-plugin-auto-update-packages)
[![license](https://img.shields.io/github/license/atlowChemi/vite-plugin-auto-update-packages.svg?style=flat-square)](https://github.com/atlowChemi/vite-plugin-auto-update-packages/blob/master/LICENSE)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/vite-plugin-auto-update-packages?style=flat-square)](https://img.shields.io/bundlephobia/minzip/vite-plugin-auto-update-packages?style=flat-square)
[![node engine](https://img.shields.io/node/v/vite-plugin-auto-update-packages?style=flat-square)](https://img.shields.io/node/v/vite-plugin-auto-update-packages?style=flat-square)
[![Package Quality](https://packagequality.com/shield/vite-plugin-auto-update-packages.svg)](https://packagequality.com/#?package=vite-plugin-auto-update-packages)

A Vite Plugin that watches for changes in the lock file, and re-installs dependencies on lock changes. This is can be useful when working in a team, in a case where the dependencies are updated by other team members, and the changes were pulled in from the remote repository while the dev server is running.

## Installation

#### NPM

```
npm i -D vite-plugin-auto-update-packages
```

#### YARN

```
yarn add -D vite-plugin-auto-update-packages
```

#### PNPM

```
pnpm add -D vite-plugin-auto-update-packages
```

## Usage

Add the plugin to the `vite.config.ts` with the wanted setup.

### Vite config

Add the plugin to your vite configs plugin array.

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import autoUpdatePackages from 'vite-plugin-auto-update-packages';

export default defineConfig({
    plugins: [
        autoUpdatePackages(),
    ],
});
```

## Configuration

The plugin has a slim API consisting of two optional parameters allowing to customize plugin setup.

### pkgManager

-   **type**: `'npm' | 'yarn' | 'pnpm' | 'bun'`
-   **default**: `npm`
-   **description**: The package manager used by the project for installing dependencies. This will affect the which lock file is watched, as well as the installation command executed.

### installOnCacheNotFound

-   **type**: `boolean`
-   **default**: `false`
-   **description**: If set to true, the plugin will install dependencies if the lock-file cache is not found upon instantiation.
