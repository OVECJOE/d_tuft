import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        include: ['tests/**/*.test.ts'],
    },
    resolve: {
        alias: {
            '~~': path.resolve(__dirname, './src'),
        },
    },
});
