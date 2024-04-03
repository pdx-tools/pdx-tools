// @ts-check

const { themes } = require("prism-react-renderer");
const lightCodeTheme = themes.github;
const darkCodeTheme = themes.dracula;
const repo = "https://github.com/pdx-tools/pdx-tools";
const url = "https://pdx.tools";

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "PDX Tools",
  url,
  baseUrl: "/",
  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "throw",
  favicon: "img/favicon.ico",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  scripts: [
    {
      src: "https://a.pdx.tools/js/index.js",
      async: true,
      "data-domain": "pdx.tools",
    },
  ],

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          editUrl: `${repo}/edit/master/src/docs`,
          breadcrumbs: false,
        },
        blog: {
          editUrl: `${repo}/edit/master/src/docs`,
          postsPerPage: "ALL",
          showReadingTime: true,
          blogSidebarCount: "ALL",
          blogSidebarTitle: "Posts",
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        disableSwitch: true,
        respectPrefersColorScheme: true,
      },

      navbar: {
        title: "PDX Tools Docs",
        style: "dark",
        logo: {
          alt: "PDX Tools Logo",
          src: "img/logo.svg",
          href: "/docs",
          width: 48,
          height: 48,
          style: {
            height: "48px",
            width: "48px",
            marginTop: "-8px",
          },
        },
        items: [
          {
            to: "/docs/category/eu4-guides",
            label: "Guides",
            position: "left",
          },
          { to: "/blog", label: "Blog", position: "left" },
          { to: "/changelog", label: "Changelog", position: "left" },
          { to: "/docs/api", label: "API", position: "left" },
          {
            href: "https://github.com/pdx-tools/pdx-tools",
            position: "right",
            className: "header-github-link menu-icon",
          },
          {
            href: "https://discord.gg/rCpNWQW",
            position: "right",
            className: "header-discord-link menu-icon",
          },
          {
            to: "pathname:///",
            label: "Open PDX Tools",
            position: "right",
          },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Docs",
            items: [
              {
                label: "Guides",
                to: "/docs/category/eu4-guides",
              },
            ],
          },
          {
            title: "Community",
            items: [
              {
                label: "Discord",
                href: "https://discord.gg/rCpNWQW",
              },
              {
                label: "GitHub",
                href: "https://github.com/pdx-tools/pdx-tools",
              },
            ],
          },
          {
            title: "More",
            items: [
              {
                label: "Blog",
                to: "/blog",
              },
              {
                label: "API",
                to: "/docs/api",
              },
            ],
          },
        ],
      },
      prism: {
        additionalLanguages: ["toml"],
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
    }),
};

module.exports = config;
