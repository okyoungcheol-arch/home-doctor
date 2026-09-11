import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["components/**/*.{ts,tsx}"],
    rules: {
      // Use the @typescript-eslint variant (not core no-restricted-imports) so
      // `allowTypeImports: true` can exempt `import type { MedicalRecord } from
      // '@/lib/server/db/schema'` (ManagerDashboard.tsx) — a type-only import has
      // no runtime/bundle effect, so it doesn't cross the client/server boundary
      // this rule exists to protect. Value imports of lib/server are still blocked.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/server/*", "@/lib/server"],
              message:
                "components/**는 클라이언트 UI 전용입니다. lib/server는 app/api/** 라우트에서만 사용하세요(타입만 필요하면 import type은 허용됩니다).",
              allowTypeImports: true,
            },
          ],
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
  ]),
]);

export default eslintConfig;
