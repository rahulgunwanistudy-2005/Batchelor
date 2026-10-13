import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ runtime: 'nodejs24.x' }),
    csp: { mode: 'auto', directives: {
      'default-src': ['self'], 'script-src': ['self'],
      'style-src': ['self', 'unsafe-inline'], 'font-src': ['self'],
      'img-src': ['self'], 'connect-src': ['self'],
      'object-src': ['none'], 'base-uri': ['self'],
      'frame-ancestors': ['none'], 'form-action': ['self']
    } }
  }
};
