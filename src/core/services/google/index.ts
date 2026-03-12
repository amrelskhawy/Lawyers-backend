import { GoogleAuth } from 'google-auth-library';

let _auth: GoogleAuth | null = null;
export function getAuth(): GoogleAuth {
    if (_auth) return _auth;

    const privateKey = process.env.GOOGLE_PRIVATE_KEY ?? "";

    _auth = new GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: privateKey,
        },
        scopes: [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/meetings.space.created',
            'https://www.googleapis.com/auth/drive',
        ],
    });

    return _auth;
}