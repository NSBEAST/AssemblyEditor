import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // relative asset paths, so the site works under any GitHub Pages address (user.github.io/repo/)
  base: './',
  plugins: [svelte()],
})
