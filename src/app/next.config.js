const { withSentryConfig } = require("@sentry/nextjs");

const cspScriptApp = [
  "'self'",
  "'unsafe-eval'",
  "blob:",
  "https://a.pdx.tools/js/index.js",
];

const globalCsp = [
  "default-src 'self'",
  "connect-src 'self' blob: https://skanderbeg.pm/api.php https://a.pdx.tools/api/event",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
];

const csp = [...globalCsp, `script-src ${cspScriptApp.join(" ")}`];
const docsCsp = [
  ...globalCsp,

  // Docusaurus does dark mode through an inline script
  `script-src ${[...cspScriptApp, "'unsafe-inline'"].join(" ")}`,
];

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
          key: "Cross-Origin-Embedder-Policy",
          value: "require-corp",
        },
        {
          key: "Cross-Origin-Opener-Policy",
          value: "same-origin",
        },
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

if (process.env.SENTRY_DSN) {
  nextConfig = withSentryConfig(
    {
      ...nextConfig,
      sentry: {
        widenClientFileUpload: true,
        hideSourceMaps: true,
        autoInstrumentAppDirectory: false,
        autoInstrumentMiddleware: false,
        autoInstrumentServerFunctions: false,
        tunnelRoute: "/api/tunnel",
      },
    },
    { silent: true, dryRun: process.env.PDX_RELEASE !== "1" }
  );
}

module.exports = nextConfig;
