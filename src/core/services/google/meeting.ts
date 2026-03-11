import { SpacesServiceClient } from '@google-apps/meet';
import { auth } from './index.js';

async function createMeetSpace() {
    const authClient = await auth.getClient();


    const meetClient = new SpacesServiceClient({
        auth,
    });

    const [response] = await meetClient.createSpace({
        space: {
            config: {
                accessType: 'OPEN', // Or 'TRUSTED'
            }
        }
    });

    console.log('Meet URL:', response.meetingUri);
}

const meet = await createMeetSpace();