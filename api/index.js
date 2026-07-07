
const server = require('../server');
const app = server;

// Export a Vercel-compatible handler that waits for DB initialization
module.exports = async (req, res) => {
  try {
    await server.initPromise;
    app(req, res);
  } catch (err) {
    console.error('Error in Vercel handler:', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
};
