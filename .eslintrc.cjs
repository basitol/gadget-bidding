/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  ignorePatterns: ["**/dist/**", "**/node_modules/**", "**/generated/**"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-namespace": "off",
    "prefer-const": "off",
    "no-case-declarations": "off",
  },
  env: {
    node: true,
    es2022: true,
  },
  overrides: [
    {
      files: ["packages/mobile/**/*.{ts,tsx}"],
      env: { browser: true },
    },
  ],
};
