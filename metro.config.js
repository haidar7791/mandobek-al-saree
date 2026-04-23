const { getDefaultConfig } = require("expo/metro-config");
const { createProxyMiddleware } = require("http-proxy-middleware");

const config = getDefaultConfig(__dirname);

const apiProxy = createProxyMiddleware({
  target: "http://localhost:5000",
  changeOrigin: true,
  logLevel: "warn",
});

config.server = config.server || {};
const previousEnhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const base = previousEnhance ? previousEnhance(middleware, server) : middleware;
  return (req, res, next) => {
    if (req.url && req.url.startsWith("/api")) {
      return apiProxy(req, res, next);
    }
    return base(req, res, next);
  };
};

module.exports = config;
