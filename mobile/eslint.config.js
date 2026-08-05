// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // These new experimental react-hooks rules fire on the app's standard
    // "seed form state from async data" and "latest ref" patterns (used across
    // every screen), producing false positives. Keep them off; the rest of the
    // react-hooks rules still apply.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
]);
