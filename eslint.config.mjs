import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooksPlugin from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { "react-hooks": reactHooksPlugin },
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
      "react-hooks/exhaustive-deps": "warn",
      // New React Compiler rules from eslint-config-next 16.4 (34 hits in 12 files:
      // latest-ref-in-render in Perform/PDFViewer/auth-context, Date.now in render in
      // SoundSystemSection). They flag working patterns; rewriting them inside Perform
      // is a behaviour risk, so they warn until each file is refactored deliberately.
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
    },
  },
  {
    // v4.3 C01 — API routes and server libs must use the `logger` helper
    // instead of raw `console.*` so production Vercel logs stay structured
    // and greppable. Test files and scripts/ are exempt.
    files: ["src/app/api/**/*.ts", "src/lib/**/*.ts"],
    ignores: ["src/lib/logger.ts", "**/__tests__/**", "**/*.test.ts"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // Setlist sync PR 2: client list queries over tenant collections are built
    // only in src/lib/tenant-query.ts (orgId filter first; the rules refuse a
    // list without it). `collection`/`collectionGroup` from the client SDK are
    // banned elsewhere, statically, as a namespace, or through a dynamic
    // import. A file that needs collection() for a write or a non-tenant
    // subcollection disables the rule on that line and says why.
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: [
      "src/lib/tenant-query.ts",
      "src/app/api/**",
      "src/lib/mcp/**",
      "src/test/**",
      "**/__tests__/**",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "firebase/firestore",
          importNames: ["collection", "collectionGroup"],
          message: "Build client list queries in src/lib/tenant-query.ts. For a write or a non-tenant subcollection, disable this line and name the reason.",
        }],
      }],
      "no-restricted-syntax": ["error",
        {
          selector: "VariableDeclarator[init.argument.type='ImportExpression'][init.argument.source.value='firebase/firestore'] > ObjectPattern > Property[key.name=/^collection(Group)?$/]",
          message: "Build client list queries in src/lib/tenant-query.ts (dynamic import of collection/collectionGroup).",
        },
        {
          selector: "CallExpression[callee.property.name='then'][callee.object.type='ImportExpression'][callee.object.source.value='firebase/firestore'] ObjectPattern > Property[key.name=/^collection(Group)?$/]",
          message: "Build client list queries in src/lib/tenant-query.ts (dynamic import of collection/collectionGroup).",
        },
        {
          selector: "MemberExpression[object.argument.type='ImportExpression'][object.argument.source.value='firebase/firestore'][property.name=/^collection(Group)?$/]",
          message: "Build client list queries in src/lib/tenant-query.ts (dynamic import of collection/collectionGroup).",
        },
        {
          selector: "MemberExpression[object.type='ImportExpression'][object.source.value='firebase/firestore'][property.name=/^collection(Group)?$/]",
          message: "Build client list queries in src/lib/tenant-query.ts (dynamic import of collection/collectionGroup).",
        },
      ],
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
