const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

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
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listEvents(auth, timeMin, timeMax) {
  const calendar = google.calendar({version: 'v3', auth});
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin,
    timeMax: timeMax,
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items;
}

/**
 * Creates a new event in the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {object} event The event object to create.
 */
async function addEvent(auth, event) {
    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
    });
    return res.data;
}

/**
 * Deletes an event from the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {string} eventId The ID of the event to delete.
 */
async function deleteEvent(auth, eventId) {
    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
    });
    return res.data;
}

/**
 * Updates an existing event in the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {string} eventId The ID of the event to update.
 * @param {object} eventData The updated event data.
 */
async function updateEvent(auth, eventId, eventData) {
    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        resource: eventData,
    });
    return res.data;
}

/**
 * Searches for events matching specific criteria.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {string} query Search query for event summary.
 * @param {string} timeMin Start time for search range.
 * @param {string} timeMax End time for search range.
 */
async function searchEvents(auth, query, timeMin, timeMax) {
    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.events.list({
        calendarId: 'primary',
        q: query,
        timeMin: timeMin,
        timeMax: timeMax,
        maxResults: 50,
        singleEvents: true,
        orderBy: 'startTime',
    });
    return res.data.items;
}

module.exports = { authorize, listEvents, addEvent, deleteEvent, updateEvent, searchEvents };

