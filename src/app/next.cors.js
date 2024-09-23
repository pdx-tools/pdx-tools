const globalCsp = [
  "default-src 'self'",
  "connect-src 'self' blob: https://skanderbeg.pm/api.php",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:"
];

module.exports = {
  csp: globalCsp,
};
