import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Local-network access: both servers bind every interface, and the host check is
  // off because this is a development/preview server on a LAN — never expose it
  // publicly. The camera still needs a secure context: see the `insecure-context`
  // guidance in TrackingProblem for the three ways to get one.
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
});
