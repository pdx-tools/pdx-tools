const path = require("node:path");
const { promises: fs } = require("node:fs");

module.exports = function updatesPlugin(context, options = {}) {
  const { siteDir } = context;
  const updatesDir = path.resolve(
    siteDir,
    options.updatesDir ?? "../app/public/updates",
  );
  const indexPath = path.resolve(
    siteDir,
    options.indexPath ?? "../app/public/updates.json",
  );

  return {
    name: "pdx-updates-plugin",

    async loadContent() {
      let dates = [];
      try {
        const indexContent = await fs.readFile(indexPath, "utf-8");
        dates = JSON.parse(indexContent);
      } catch (error) {
        console.warn(`[updates-plugin] Failed to read index: ${error}`);
        return { releases: [] };
      }

      const releases = [];
      for (const date of dates) {
        try {
          const filePath = path.join(updatesDir, `${date}.json`);
          const fileContent = await fs.readFile(filePath, "utf-8");
          const data = JSON.parse(fileContent);
          releases.push({ release_date: date, ...data });
        } catch (error) {
          console.warn(`[updates-plugin] Failed to process ${date}: ${error}`);
        }
      }

      return { releases };
    },

    async contentLoaded({ content, actions }) {
      const { setGlobalData } = actions;
      setGlobalData(content);
    },
  };
};
