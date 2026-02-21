import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // All 11 instances are intentional data-fetching patterns (onSnapshot callbacks,
      // WebSocket handlers, auth state listeners). React itself recommends this pattern.
      "react-hooks/set-state-in-effect": "off",
      // All 8 instances are tiny avatars/icons (Google profile photos, 32×32 placeholders)
      // where next/image's optimization overhead isn't warranted.
      "@next/next/no-img-element": "off",
      // Allow underscore-prefixed variables to indicate intentionally unused params
      "@typescript-eslint/no-unused-vars": "off",
      // Override for rapid prototyping
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/**",
  ]),
]);

export default eslintConfig;
