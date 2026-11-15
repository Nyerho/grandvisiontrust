const serverless = require('serverless-http');
const app = require('../../server');

const expressHandler = serverless(app);
const FUNCTION_PREFIX = '/.netlify/functions/api';

exports.handler = async (event, context) => {
  // Netlify rewrites /api/* to the function URL. Restore the Express route path
  // because the function URL itself is otherwise visible to the adapter.
  const incomingPath = event.path || '/';
  let apiPath = incomingPath;
  if (apiPath.startsWith(FUNCTION_PREFIX)) {
    apiPath = apiPath.slice(FUNCTION_PREFIX.length) || '/';
  }
  if (apiPath !== '/api' && !apiPath.startsWith('/api/')) {
    apiPath = `/api${apiPath === '/' ? '' : apiPath}`;
  }

  const netlifyEvent = { ...event, path: apiPath };
  await app.initDb();
  return expressHandler(netlifyEvent, context);
};
