const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {google} = require('googleapis');
const {authorize} = require('./google-auth');

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

