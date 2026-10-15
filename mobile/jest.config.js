// Resolves @ade/protocol's imports from the app's node_modules, as Metro does,
// and compiles the package's TypeScript and the @noble peers.
module.exports = {
  preset: "jest-expo",
  moduleDirectories: ["node_modules", "<rootDir>/node_modules"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|expo-router|react-navigation|@react-navigation/.*|@ade/.*|@noble/.*)",
  ],
};
