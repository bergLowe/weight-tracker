// Non-secret config. The OAuth Client ID is visible in frontend JS regardless of how
// it's stored — see backend/Code.gs for why the real security boundary is server-side.
//
// This is a TEMPLATE — config.js itself is gitignored, never committed, not even as
// a placeholder. For local dev: copy this file to config.js and fill in your real
// Client ID. For GitHub Pages: .github/workflows/deploy.yml generates the real
// config.js at deploy time from the OAUTH_CLIENT_ID repository secret.
const CONFIG = {
  CLIENT_ID: 'REPLACE_WITH_YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com',
  WEB_APP_URL: 'REPLACE_WITH_YOUR_APPS_SCRIPT_WEB_APP_URL'
};
