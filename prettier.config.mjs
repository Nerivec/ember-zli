import oclifPrettierConfig from '@oclif/prettier-config';
import sortImports from '@ianvs/prettier-plugin-sort-imports';

export default {
    ...oclifPrettierConfig,
    plugins: [sortImports],
    singleQuote: true,
    printWidth: 150,
    bracketSpacing: true,
    endOfLine: "lf",
    tabWidth: 4,
    importOrder: [
        "",
        "<TYPES>^(node:)",
        "",
        "<TYPES>",
        "",
        "<TYPES>^[.]",
        "",
        "<BUILTIN_MODULES>",
        "",
        "<THIRD_PARTY_MODULES>",
        "",
        "^zigbee",
        "",
        "^[.]",
    ],
};
