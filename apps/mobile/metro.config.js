const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const coreRoot = path.resolve(projectRoot, '../../packages/core');

const config = getDefaultConfig(projectRoot);

// Share platform-independent logic with the web app (@dmm/core lives outside this project root)
config.watchFolders = [...(config.watchFolders ?? []), coreRoot];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@dmm/core': path.join(coreRoot, 'src'),
};

module.exports = config;
