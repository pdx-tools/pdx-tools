const { withSentryConfig } = require("@sentry/nextjs");

// @ts-check
/** @type {import('next').NextConfig} */
let nextConfig = {
  // disabled until https://github.com/ant-design/ant-design/issues/26136
  // reactStrictMode: true,
  output: "standalone",
  webpack: (config, { webpack }) => {
    const experiments = config.experiments || {};
    config.experiments = { ...experiments, asyncWebAssembly: true };

    config.output.assetModuleFilename = `static/[hash][ext]`;
    config.output.publicPath = `/_next/`;
    config.module.rules.push({
      test: /\.(png|wasm|bin|webp|frag|vert|svg)$/,
      type: "asset/resource",
    });

    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/tree-shaking/#tree-shaking-optional-code-with-nextjs
    config.plugins.push(
      new webpack.DefinePlugin({
        __SENTRY_DEBUG__: process.env.NODE_ENV !== "production",
        __SENTRY_TRACING__: false,
      })
    );

    return config;
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
          {
            key: "Content-Security-Policy",
            value: "default-src 'self';" +
              "connect-src 'self' blob: https://skanderbeg.pm/api.php https://a.pdx.tools/api/event https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.0/;" +
              "img-src 'self' data:;" +
              "script-src 'self' 'unsafe-eval' blob: https://a.pdx.tools/js/index.js;" +
              "style-src 'self' 'unsafe-inline'"
          }
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
  async rewrites() {
    return {
      fallback: [
        {
          source: '/:path*',
          destination: `http://localhost:3000/:path*`,
        },
      ],
    }
  },
  serverRuntimeConfig: {
    PROJECT_ROOT: __dirname,
  },
};

if (process.env.SENTRY_DSN) {
  nextConfig = withSentryConfig(
    {
      ...nextConfig,
      sentry: {
        widenClientFileUpload: true,
      },
    },
    { silent: true, dryRun: process.env.PDX_RELEASE !== "1" }
  );
}

module.exports = nextConfig;
