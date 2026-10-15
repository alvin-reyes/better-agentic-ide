// @ade/protocol lives outside the app (file:../packages/protocol). Metro watches
// it, and resolves its imports (the @noble peers) from the app's node_modules,
// which is all EAS installs.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), path.resolve(projectRoot, "../packages/protocol")];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

module.exports = config;
