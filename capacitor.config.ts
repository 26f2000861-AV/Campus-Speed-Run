import type { CapacitorConfig } from '@capacitor/cli';

// The Android app is a native shell around the deployed site, so the API routes,
// Supabase and Gemini keys stay on the server. A localhost URL is unreachable from
// a phone, so it falls back to the live deployment.
const envUrl = process.env.NEXT_PUBLIC_APP_URL;
const serverUrl = envUrl && !/localhost|127\.0\.0\.1/.test(envUrl) ? envUrl : 'https://campus-speed-run.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.campusspeedrun.app',
  appName: 'Campus Pulse+',
  webDir: 'public',
  server: {
    url: serverUrl,
    // Plain-HTTP traffic is only allowed when the server itself is HTTP (e.g. a LAN dev box).
    cleartext: serverUrl.startsWith('http://'),
  },
};

export default config;
