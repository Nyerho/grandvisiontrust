
const { initPromise } = require('../server');
const app = require('../server');

// Export a Vercel-compatible handler that waits for DB initialization
module.exports = async (req, res) => {
  await initPromise;
  return app(req, res);
};
