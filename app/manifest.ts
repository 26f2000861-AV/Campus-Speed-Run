import type { MetadataRoute } from 'next';

// Installable PWA / Capacitor shell: opens full screen with the app's dark ink chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Campluse',
    short_name: 'Campluse',
    description: 'Report campus issues anonymously and track them to resolution.',
    start_url: '/',
    display: 'standalone',
    background_color: '#08090B',
    theme_color: '#08090B',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // The plus sits inside the maskable safe zone, so the same artwork works for adaptive icons.
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
