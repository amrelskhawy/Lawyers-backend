import { google } from 'googleapis';
import { auth } from './index.js';

async function createCalendarEvent() {
    const calendar = google.calendar({
        version: 'v3',
        auth,
    });

    const event = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
            summary: 'Meeting With Amr Elskhawy',
            start: {
                dateTime: '2026-03-12T10:00:00+02:00',
            },
            end: {
                dateTime: '2026-03-12T11:00:00+02:00',
            },
            conferenceData: {
                createRequest: {
                    requestId: 'meet-' + Date.now(),
                    conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
            },
        },
        conferenceDataVersion: 1,
    });

    console.log(event.data.hangoutLink);
}

createCalendarEvent();