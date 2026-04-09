import { google } from 'googleapis';
import { auth } from './index.js';
import { parse, format } from "date-fns";

export async function createGoogleEvent(
    booking: any,
    serviceName: string,
): Promise<{ calendarUrl: string | null, meetLink: string | null }> {
    try {
        const calendar = google.calendar({
            version: 'v3',
            auth
        });

        const startDateTime = parse(
            `${format(booking.date, "yyyy-MM-dd")} ${booking.startTime}`,
            "yyyy-MM-dd HH:mm",
            new Date()
        );
        const endDateTime = parse(
            `${format(booking.date, "yyyy-MM-dd")} ${booking.endTime}`,
            "yyyy-MM-dd HH:mm",
            new Date()
        );

        const eventBody: any = {
            summary: `Booking: ${serviceName}`,
            description: `Client: ${booking.customer?.email || 'N/A'}`,
            start: { dateTime: startDateTime.toISOString(), timeZone: 'UTC' },
            end: { dateTime: endDateTime.toISOString(), timeZone: 'UTC' },
            conferenceData: {
                createRequest: {
                    requestId: 'meet-' + Date.now(),
                    conferenceSolutionKey: {
                        type: 'hangoutsMeet'
                    }
                }
            }
        };

        // if (meetLink) {
        //     eventBody.conferenceData = {
        //         conferenceSolution: { key: { type: 'hangoutsMeet' }, name: 'Google Meet' },
        //         entryPoints: [{
        //             entryPointType: 'video',
        //             uri: meetLink,
        //             label: meetLink.replace('https://', ''),
        //         }],
        //     };
        // }

        const response = await calendar.events.insert({
            calendarId: 'primary',
            conferenceDataVersion: 1,
            requestBody: eventBody,
        });

        return {
            calendarUrl: response.data.htmlLink ?? null,
            meetLink: response.data.hangoutLink ?? null
        };
    } catch (error: any) {
        console.error("Google Calendar event creation failed:", error?.message || error);
        throw error;
    }
}