import { SpacesServiceClient } from '@google-apps/meet';
import { auth } from './index.js';

export async function createMeetLink(): Promise<string | null> {
    try {
        const meetClient = new SpacesServiceClient({
            auth,
        });

        const [space] = await meetClient.createSpace({
            space: {
                config: {
                    accessType: 'OPEN', // Or 'TRUSTED'
                }
            }
        });

        const uri = space.meetingUri ?? null;
        if (uri) console.log(`Google Meet link created: ${uri}`);
        return uri;
    } catch (err: any) {
        console.warn('Could not create Meet space:', err?.message ?? err);
        return null;
    }
}