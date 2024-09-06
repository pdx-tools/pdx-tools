const globalCsp = [
  "default-src 'self'",
  "connect-src 'self' blob: https://skanderbeg.pm/api.php https://a.pdx.tools/api/event",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://a.pdx.tools/js/index.js"
];

module.exports = {
  csp: globalCsp,
};
