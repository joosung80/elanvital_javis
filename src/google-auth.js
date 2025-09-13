const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = [
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/documents', // 읽기/쓰기 권한으로 변경
    'https://www.googleapis.com/auth/spreadsheets', // 읽기/쓰기 권한으로 변경
    'https://www.googleapis.com/auth/drive', // 읽기/쓰기 권한으로 변경
    'https://www.googleapis.com/auth/presentations' // 읽기/쓰기 권한으로 변경
];

const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

let authClient = null;

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  try {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
      type: 'authorized_user',
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
  } catch (error) {
    console.error('Error saving credentials:', error);
    throw new Error('Could not save credentials.');
  }
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  if (authClient) return authClient;

  try {
    let client = await loadSavedCredentialsIfExist();
    if (client) {
      authClient = client;
      return authClient;
    }
    client = await authenticate({
      scopes: SCOPES,
      keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
      await saveCredentials(client);
    }
    authClient = client;
    return authClient;
  } catch (error) {
    console.error('Authentication failed:', error);
    if (error.message.includes('invalid_grant')) {
      throw new Error('Authentication failed: The provided credentials are invalid or expired. Please re-authenticate.');
    } else if (error.message.includes('ENOENT')) {
      throw new Error('Authentication failed: credentials.json not found. Please ensure the file exists in the root directory.');
    }
    throw new Error('An unexpected error occurred during authentication.');
  }
}

/**
 * 인증된 Google API 객체를 반환합니다.
 * @returns {Promise<object>} 인증된 google 객체
 */
async function getAuthenticatedGoogleApis() {
    const auth = await authorize();

    // Add an event listener for token refresh
    auth.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
            // A new refresh token might be issued, save it.
            console.log('[AUTH] New refresh token received, saving...');
            const existingPayload = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
            existingPayload.refresh_token = tokens.refresh_token;
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(existingPayload));
        }
    });

    return {
        auth,
        drive: google.drive({ version: 'v3', auth }),
        docs: google.docs({ version: 'v1', auth }),
        sheets: google.sheets({ version: 'v4', auth }),
        slides: google.slides({ version: 'v1', auth }),
        tasks: google.tasks({ version: 'v1', auth }),
        calendar: google.calendar({ version: 'v3', auth })
    };
}

module.exports = {
    authorize,
    getAuthenticatedGoogleApis
};
