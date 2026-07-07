
const app = require('../server');

// Export a Vercel-compatible handler that waits for DB initialization
module.exports = async (req, res) => {
  await require('../server').initPromise;
  return app(req, res);
};
