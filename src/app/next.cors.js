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

module.exports = {
  csp: [...globalCsp, `script-src ${cspScriptApp.join(" ")}`],
  docsCsp: [
    ...globalCsp,

    // Docusaurus does dark mode through an inline script
    `script-src ${[...cspScriptApp, "'unsafe-inline'"].join(" ")}`,
  ],
};
