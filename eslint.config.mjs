import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            parserOptions: {
                project: true,
            },
        },
        rules: {
            complexity: ["warn", 30],
            "max-params": ["error", 10],
            "@typescript-eslint/no-floating-promises": "error",
        },
    },
    {
        ignores: ["./eslint.config.mjs", "dist", "tmp"],
    },
);
