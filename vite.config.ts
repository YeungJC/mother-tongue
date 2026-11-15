import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The generated program client lives in chain/client; dedupe Kit so the viewer and
// the generated code share one copy (branded types and signers must match).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // The generated client (our source, not node_modules) reads process.env.NODE_ENV.
  define: { 'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development') },
  resolve: { dedupe: ['@solana/kit', '@solana/program-client-core', '@solana-program/token', '@solana-program/system'] },
}))
