// webpack / Turbopack `require.context` (used only by src/i18n/catalogue-source.ts).
declare namespace NodeJS {
    interface Require {
        context(
            directory: string,
            useSubdirectories: boolean,
            regExp: RegExp,
        ): { keys(): string[]; (id: string): unknown }
    }
}
