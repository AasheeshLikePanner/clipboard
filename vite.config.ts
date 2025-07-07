import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	plugins: [react(), tailwindcss(), tsconfigPaths()],
	base: './',
	publicDir: 'public',
	build: {
		outDir: 'dist-react',
	},
	server: {
		port: 3524,
		strictPort: true,
		headers: {
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval';"
    }
	},
});
