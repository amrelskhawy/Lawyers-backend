import 'dotenv/config';
import { GoogleAuth } from 'google-auth-library';

export const auth = new GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL!,
        private_key: process.env.GOOGLE_PRIVATE_KEY!,
    },
    clientOptions: {
        subject: 'saadalbogamiksa.com@saadalbogamiksa.com'
    },
    scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/meetings.space.created',
        'https://www.googleapis.com/auth/drive'
    ],
});
