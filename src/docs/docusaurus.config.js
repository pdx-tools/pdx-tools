// @ts-check

const lightCodeTheme = require("prism-react-renderer/themes/github");
const darkCodeTheme = require("prism-react-renderer/themes/dracula");
const repo = "https://github.com/pdx-tools/pdx-tools";
const url = "https://dev.pdx.tools";

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
      announcementBar: {
        id: "pre-vic3-survey",
        content:
          'Fill out <a target="_blank" rel="noopener noreferrer" href="https://strawpoll.vote/polls/axicc6u8/vote?s=0">a quick 2 question survey</a> about PDX Tools 📝',
        backgroundColor: "#0284C7", // bg-sky-600
        textColor: "white",
        isCloseable: false,
      },

      colorMode: {
        disableSwitch: true,
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
            to: "pathname:///",
            label: "Open PDX Tools",
            position: "right",
          },
          {
            href: "https://github.com/pdx-tools/pdx-tools",
            position: "right",
            className: "header-github-link",
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
