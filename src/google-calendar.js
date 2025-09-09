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
  
  console.log(`[GOOGLE API] Calendar.events.list() 호출 - 범위: ${timeMin} ~ ${timeMax}`);
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin,
    timeMax: timeMax,
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime',
  });
  console.log(`[GOOGLE API] ✅ 캘린더 이벤트 조회 완료: ${res.data.items?.length || 0}개`);
  
  return res.data.items;
}

/**
 * Creates a new event in the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {object} event The event object to create.
 */
async function addEvent(auth, event) {
    const calendar = google.calendar({ version: 'v3', auth });
    
    console.log(`[GOOGLE API] Calendar.events.insert() 호출 - "${event.summary}" 추가`);
    const res = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
    });
    console.log(`[GOOGLE API] ✅ 캘린더 이벤트 생성 완료: "${res.data.summary}" (ID: ${res.data.id})`);
    
    return res.data;
}

/**
 * Deletes an event from the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {string} eventId The ID of the event to delete.
 */
async function deleteEvent(auth, eventId) {
    const calendar = google.calendar({ version: 'v3', auth });
    
    console.log(`[GOOGLE API] Calendar.events.delete() 호출 - ID: ${eventId}`);
    const res = await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
    });
    console.log(`[GOOGLE API] ✅ 캘린더 이벤트 삭제 완료: ID ${eventId}`);
    
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
    
    console.log(`[GOOGLE API] Calendar.events.update() 호출 - ID: ${eventId}, 제목: "${eventData.summary}"`);
    const res = await calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        resource: eventData,
    });
    console.log(`[GOOGLE API] ✅ 캘린더 이벤트 수정 완료: "${res.data.summary}" (ID: ${res.data.id})`);
    
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
    
    console.log(`[GOOGLE API] Calendar.events.list() 호출 - 검색: "${query}", 범위: ${timeMin} ~ ${timeMax}`);
    const res = await calendar.events.list({
        calendarId: 'primary',
        q: query,
        timeMin: timeMin,
        timeMax: timeMax,
        maxResults: 50,
        singleEvents: true,
        orderBy: 'startTime',
    });
    console.log(`[GOOGLE API] ✅ 캘린더 이벤트 검색 완료: ${res.data.items?.length || 0}개`);
    
    return res.data.items;
}

module.exports = { authorize, listEvents, addEvent, deleteEvent, updateEvent, searchEvents };

