const { withSentryConfig } = require("@sentry/nextjs");
const { csp, docsCsp } = require("./next.cors");

// @ts-check
/** @type {import('next').NextConfig} */
let nextConfig = {
  reactStrictMode: true,
  output: process.env.NEXT_OUTPUT,
  transpilePackages: ["map"],
  webpack: (config, { webpack }) => {
    const experiments = config.experiments || {};
    config.experiments = { ...experiments, asyncWebAssembly: true };

    config.output.assetModuleFilename = `static/[hash][ext]`;
    config.output.publicPath = `/_next/`;
    config.module.rules.push({
      test: /\.(png|wasm|bin|webp|frag|vert|svg|mp4)$/,
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
    unoptimized: true,
  },

  headers: () => [
    {
      source: "/:path*",
      headers: [
        {
          key: "Content-Security-Policy",
          value: csp.join("; "),
        },
      ],
    },

    ...["/docs/:path*", "/blog/:path*", "/changelog/:path*"].map((source) => ({
      source,
      headers: [
        {
          key: "Content-Security-Policy",
          value: docsCsp.join("; "),
        },
      ],
    })),
  ],

  rewrites: async () => ({
    beforeFiles: process.env.PROXY_NODE_URL
      ? [
          "/api/achievements/:path*",
          "/api/admin/:path*",
          "/api/key",
          "/api/login/steam-callback",
          "/api/new",
          "/api/saves",
          "/api/saves/:slug",
          "/api/skan/:path*",
          "/api/users/:path*",
        ].map((source) => ({
          source,
          destination: `${process.env.PROXY_NODE_URL}${source}`,
        }))
      : undefined,

    fallback:
      process.env.NODE_ENV !== "production"
        ? [
            {
              source: "/:path*",
              destination: `http://localhost:3000/:path*`,
            },
          ]
        : undefined,
  }),
};

module.exports = withSentryConfig(nextConfig, {
  widenClientFileUpload: true,
  hideSourceMaps: true,
  autoInstrumentAppDirectory: false,
  autoInstrumentMiddleware: false,
  autoInstrumentServerFunctions: false,
  tunnelRoute: "/api/tunnel",
  silent: true,
  dryRun: process.env.PDX_RELEASE !== "1",
});
