/** @type {import('tailwindcss').Config} */

const path = require("path");

module.exports = {
  corePlugins: {
    preflight: false,
  },
  content: [path.join(__dirname, "./src/**/*.{js,ts,jsx,tsx}")],
  theme: {
    extend: {},
  },
  plugins: [],
};
