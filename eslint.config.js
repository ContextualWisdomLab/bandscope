import js from "@eslint/js";
import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      jsdoc: jsdoc,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    rules: {
      "no-console": "error"
    }
  },
  {
    files: ["packages/shared-types/src/**/*.ts", "apps/desktop/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "**/*.stories.tsx", "apps/desktop/src/vite-env.d.ts", "apps/desktop/src/main.tsx"],
    plugins: {
      jsdoc: jsdoc,
    },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          require: {
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: true,
          },
          contexts: [
            "ExportNamedDeclaration > TSTypeAliasDeclaration",
            "ExportNamedDeclaration > TSInterfaceDeclaration",
            "ExportNamedDeclaration[declaration.type=\"VariableDeclaration\"]",
            "ExportNamedDeclaration > FunctionDeclaration"
          ]
        }
      ],
      "jsdoc/require-description": "error",
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off"
    }
  },
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"]
  }
);
