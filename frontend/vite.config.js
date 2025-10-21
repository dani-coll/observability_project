import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Allow external connections (needed for Docker)
    port: 3000,
    strictPort: true,
    watch: {
      usePolling: true, // Needed for Docker volumes on some systems
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true, // Enable sourcemaps for debugging
  },
});
