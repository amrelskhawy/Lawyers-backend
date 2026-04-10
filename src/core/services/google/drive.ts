import { google } from 'googleapis';
import { Readable } from 'stream';
import { auth } from './index.js';

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

    /**
     * Upload a binary buffer (e.g. a generated PDF) into a specific Drive folder.
     * Returns id + webViewLink.
     */
    uploadBuffer: async (
        name: string,
        buffer: Buffer,
        parentFolderId: string,
        mimeType = 'application/pdf'
    ) => {
        const response = await drive.files.create({
            requestBody: {
                name,
                mimeType,
                parents: [parentFolderId],
            },
            media: {
                mimeType,
                body: Readable.from(buffer),
            },
            fields: 'id, name, webViewLink, webContentLink',
        });
        return response.data;
    },

    /**
     * Create a sub-folder in Drive (or at root if parentFolderId is omitted).
     */
    createFolder: async (name: string, parentFolderId?: string) => {
        const response = await drive.files.create({
            requestBody: {
                name,
                mimeType: 'application/vnd.google-apps.folder',
                ...(parentFolderId ? { parents: [parentFolderId] } : {}),
            },
            fields: 'id, name, webViewLink',
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

