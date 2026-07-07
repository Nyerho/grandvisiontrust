
const server = require('../server');
const app = server;

// Export a Vercel-compatible handler that waits for DB initialization
module.exports = async (req, res) => {
  await server.initPromise;
  app(req, res);
};
