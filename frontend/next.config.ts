import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 writes AGENTS.md / CLAUDE.md into the project on dev startup; this
  // project does not ship them.
  agentRules: false,
  images: {
    // Open Food Facts serves every product photo from this host.
    remotePatterns: [
      { protocol: 'https', hostname: 'images.openfoodfacts.org' },
      { protocol: 'https', hostname: 'static.openfoodfacts.org' },
    ],
  },
};

export default withNextIntl(nextConfig);
