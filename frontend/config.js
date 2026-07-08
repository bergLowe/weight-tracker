// Non-secret config. The OAuth Client ID is visible in frontend JS regardless of how
// it's stored — see backend/Code.gs for why the real security boundary is server-side.
//
// REPLACE BEFORE TESTING — do not commit the real value:
const CONFIG = {
  CLIENT_ID: 'REPLACE_WITH_YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com'
};
