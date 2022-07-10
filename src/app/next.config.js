const SentryWebpackPlugin = require("@sentry/webpack-plugin");
const {
  getWebpackPluginOptions,
} = require("@sentry/nextjs/cjs/config/webpack");

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

// a poor man's withSentryConfig that allows lazy loading by not requiring
// sentry.client.config
const withCustomSentry = (userNextConfig, userSentryWebpackPluginOptions) => {
  if (!process.env.SENTRY_DSN) {
    return userNextConfig;
  }

  return {
    ...userNextConfig,
    webpack: (incomingConfig, buildContext) => {
      let newConfig = { ...incomingConfig };
      newConfig = userNextConfig.webpack(newConfig, buildContext);
      newConfig.plugins = newConfig.plugins || [];
      newConfig.plugins.push(
        new SentryWebpackPlugin(
          getWebpackPluginOptions(buildContext, userSentryWebpackPluginOptions)
        )
      );
      return newConfig;
    },
  };
};

module.exports = withCustomSentry(nextConfig, {
  silent: true,
  include: [
    {
      paths: [".next/static/chunks"],
      urlPrefix: "~/_next/static/chunks",
    },
  ],
});
