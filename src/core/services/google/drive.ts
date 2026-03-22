import { google } from 'googleapis';
import { auth } from './index.ts';

const drive = google.drive({ version: 'v3', auth });

export const driveService = {
    // 1. Create (Upload) a file
    uploadFile: async (name: string, content: string, mimeType = 'text/plain') => {
        const response = await drive.files.create({
            requestBody: { name, mimeType },
            media: { mimeType, body: content },
        });
        return response.data;
    },

    // 2. Get (Download/Metadata)
    getFile: async (fileId: string) => {
        const response = await drive.files.get({
            fileId,
            fields: 'id, name, webViewLink, permissions',
        });
        return response.data;
    },

    /**
     * Lists files inside a specific folder
     * @param folderId The ID of the parent folder
     */
    listFilesByFolder: async (folderId: string) => {
        try {
            const response = await drive.files.list({
                // The query 'q' is the secret sauce here
                q: `'${folderId}' in parents and trashed = false`,
                // Define which fields you want back to save bandwidth
                fields: 'nextPageToken, files(id, name, mimeType, webViewLink, createdTime)',
                pageSize: 100, // Optional: Limit results per page
            });

            return response.data.files;
        } catch (error) {
            console.error('Error listing files:', error);
            throw error;
        }
    },

    // 3. Edit (Update content or name)
    updateFile: async (fileId: string, newName: string) => {
        const response = await drive.files.update({
            fileId,
            requestBody: { name: newName },
        });
        return response.data;
    },

    // 4. Delete
    deleteFile: async (fileId: string) => {
        await drive.files.delete({ fileId });
        return { success: true };
    }
};

console.log(
    await driveService.listFilesByFolder('1aGu5-Y4Dog6F994QRK-yGJpQXrbasKgp')
)