const path = require("path");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [path.join(__dirname, "./src/**/*.{js,ts,jsx,tsx}")],
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {},
  },
  plugins: [
    require("tailwindcss-animate"),
    require('@tailwindcss/container-queries'),
  ],
};
