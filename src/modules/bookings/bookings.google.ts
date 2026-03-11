import { google } from "googleapis";
import { format, parse } from "date-fns";

export class GoogleIntegration {
    public calendar: any;
    public meet: any;

    constructor() {
        const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
        const privateKey = process.env.GOOGLE_PRIVATE_KEY;
        const { calendar, meet } = this.initialize(clientEmail || "", privateKey || "");
        this.calendar = calendar;
        this.meet = meet;
    }

    initialize(clientEmail: string, privateKey: string): { calendar: any; meet: any } {
        if (clientEmail && privateKey) {
            try {
                const auth = new google.auth.GoogleAuth({
                    credentials: {
                        client_email: clientEmail,
                        private_key: privateKey.replace(/\\n/g, '\n'),
                    },
                    scopes: [
                        'https://www.googleapis.com/auth/calendar',
                        'https://www.googleapis.com/auth/meetings.space.created',
                    ],
                });
                return {
                    calendar: google.calendar({ version: 'v3', auth }),
                    meet: google.meet({ version: 'v2', auth }),
                };
            } catch (error) {
                console.error("Failed to initialize Google APIs:", error);
                return { calendar: null, meet: null };
            }
        } else {
            console.warn("Google credentials missing. Calendar/Meet integration disabled.");
            return { calendar: null, meet: null };
        }
    }

    async createMeetLink(meet: any): Promise<string | null> {
        if (!meet) return null;
        try {
            const space = await meet.spaces.create({ requestBody: {} });
            const uri = space.data?.meetingUri ?? null;
            if (uri) console.log(`Google Meet link created: ${uri} `);
            return uri;
        } catch (err: any) {
            console.warn('Could not create Meet space:', err?.message ?? err);
            return null;
        }
    }

    async createGoogleEvent(
        calendar: any,
        booking: any,
        serviceName: string,
        meetLink: string | null = null
    ): Promise<{ calendarUrl: string | null }> {
        const startDateTime = parse(
            `${format(booking.date, "yyyy-MM-dd")} ${booking.startTime} `,
            "yyyy-MM-dd HH:mm",
            new Date()
        );
        const endDateTime = parse(
            `${format(booking.date, "yyyy-MM-dd")} ${booking.endTime} `,
            "yyyy-MM-dd HH:mm",
            new Date()
        );

        const eventBody: any = {
            summary: `Booking: ${serviceName} `,
            description: `Client: ${booking.clientEmail} `,
            start: { dateTime: startDateTime.toISOString(), timeZone: 'UTC' },
            end: { dateTime: endDateTime.toISOString(), timeZone: 'UTC' },
        };

        if (meetLink) {
            eventBody.conferenceData = {
                conferenceSolution: { key: { type: 'hangoutsMeet' }, name: 'Google Meet' },
                entryPoints: [{
                    entryPointType: 'video',
                    uri: meetLink,
                    label: meetLink.replace('https://', ''),
                }],
            };
        }

        const response = await calendar.events.insert({
            calendarId: 'primary',
            conferenceDataVersion: meetLink ? 1 : 0,
            requestBody: eventBody,
        });

        return { calendarUrl: response.data.htmlLink ?? null };
    }
}
