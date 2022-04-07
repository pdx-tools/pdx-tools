const { withSentryConfig } = require("@sentry/nextjs");

// @ts-check
/** @type {import('next').NextConfig} */
let nextConfig = {
  // disabled until https://github.com/ant-design/ant-design/issues/26136
  // reactStrictMode: true,
  webpack: (config) => {
    const experiments = config.experiments || {};
    config.experiments = { ...experiments, asyncWebAssembly: true };

    config.output.assetModuleFilename = `static/[hash][ext]`;
    config.output.publicPath = `/_next/`;
    config.module.rules.push({
      test: /\.(png|wasm|bin|webp|frag|vert)$/,
      type: "asset/resource",
    });
    return config;
  },
  experimental: {
    outputStandalone: true,
  },
  images: {
    disableStaticImages: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
      {
        source: "/:path*.bin",
        headers: [
          {
            key: "Content-Encoding",
            value: "br",
          },
        ],
      },
    ];
  },
  serverRuntimeConfig: {
    PROJECT_ROOT: __dirname,
  },
};

if (process.env.SENTRY_DSN) {
  nextConfig = withSentryConfig(nextConfig, {
    silent: true,
    include: [
      {
        paths: [".next/static/chunks"],
        urlPrefix: "~/_next/static/chunks",
      },
    ],
  });
}

module.exports = nextConfig;
