import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightBlog from "starlight-blog";

export default defineConfig({
  outDir: "./dist",
  trailingSlash: "never",
  integrations: [
    starlight({
      title: "PDX Tools",
      favicon: "/favicon.ico",
      logo: {
        src: "./src/assets/app.svg",
        alt: "PDX Tools",
      },
      plugins: [
        starlightBlog({
          authors: {
            comagoosie: {
              name: "comagoosie",
              title: "Creator of PDX Tools",
              url: "https://nickb.dev",
              picture: "/img/comagoosie.png",
            },
          },
        }),
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/pdx-tools/pdx-tools",
        },
        {
          icon: "discord",
          label: "Discord",
          href: "https://discord.gg/rCpNWQW",
        },
      ],
      editLink: {
        baseUrl:
          "https://github.com/pdx-tools/pdx-tools/edit/master/src/docs/",
      },
      sidebar: [
        { label: "Introduction", link: "/docs/" },
        { label: "API", link: "/docs/api" },
        {
          label: "EU4 Guides",
          items: [
            {
              label: "One Time Advisor Events",
              link: "/docs/eu4-guides/one-time-advisor-events",
            },
            {
              label: "Optimize Dev Push Institution",
              link: "/docs/eu4-guides/optimize-dev-push-institution",
            },
            {
              label: "Royal Marriage & Inheritance",
              link: "/docs/eu4-guides/royal-marriage-inheritance",
            },
          ],
        },
        { label: "Changelog", link: "/changelog" },
      ],
      customCss: ["./src/styles/custom.css"],
    }),
  ],
});
