import 'dotenv/config';
import { AuthClient, GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';

const ALLOWED_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/meetings.space.created',
    'https://www.googleapis.com/auth/drive'
]

type TCreateEvent = {
    client_email: string,
    client_phone: string,
    client_name: string,

    from: string,
    to: string,

    notes?: string
}


export class GoogleService {

    auth: GoogleAuth<AuthClient>;

    constructor() {
        this.auth = this.init()
    }

    init(): GoogleAuth<AuthClient> {
        return new GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
            },
            clientOptions: {
                subject: 'saadalbogamiksa.com@saadalbogamiksa.com'
            },
            scopes: ALLOWED_SCOPES,
        });

    }

    // create Calendar Event
    async createEvent(body: TCreateEvent) {
        const calendar = google.calendar({
            version: 'v3',
            auth: this.auth,
        });

        console.log({
            calendarId: 'primary',
            sendUpdates: 'all', // <--- CRITICAL: This sends the email invite to the client
            requestBody: {
                summary: `Meeting With Mr/s. ${body.client_name}`,
                start: {
                    dateTime: body.from,
                },
                end: {
                    dateTime: body.to,
                },
                description: body.notes,
                attendees: [
                    // client email only should be attend 
                    {
                        displayName: body.client_name,
                        email: body.client_email,
                        responseStatus: 'needsAction' // Sets it as a "pending" invite for them
                    },
                ],
                conferenceData: {
                    createRequest: {
                        requestId: 'meet-' + Date.now(),
                        conferenceSolutionKey: { type: 'hangoutsMeet' },
                    },
                },
            },
            conferenceDataVersion: 1,
        });


        const event = await calendar.events.insert({
            calendarId: 'primary',
            sendUpdates: 'all', // <--- CRITICAL: This sends the email invite to the client
            requestBody: {
                summary: `Meeting With Mr/s. ${body.client_name}`,
                start: {
                    // TODO: Change to SA time zone offset
                    dateTime: `${body.from}:00+02:00`,
                },
                end: {
                    // TODO: Change to SA time zone offset
                    dateTime: `${body.to}:00+02:00`,
                },
                description: body.notes,
                attendees: [
                    // client email only should be attend 
                    {
                        displayName: body.client_name,
                        email: body.client_email,
                        responseStatus: 'needsAction' // Sets it as a "pending" invite for them
                    },
                ],
                conferenceData: {
                    createRequest: {
                        requestId: 'meet-' + Date.now(),
                        conferenceSolutionKey: { type: 'hangoutsMeet' },
                    },
                },
            },
            conferenceDataVersion: 1,
        });

        return {
            meetingLink: event.data.hangoutLink,
        }

    }


}