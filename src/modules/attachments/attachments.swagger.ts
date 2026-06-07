/**
 * @swagger
 * tags:
 *   name: Attachments
 *   description: Case document attachments stored in the customer's Drive folder
 *
 * /attachments/case/{caseId}:
 *   get:
 *     tags: [Attachments]
 *     summary: List attachments for a case
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Attachments retrieved }
 *   post:
 *     tags: [Attachments]
 *     summary: Upload a document to the customer's Drive folder
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201: { description: Attachment uploaded }
 *       400: { description: File missing or too large }
 *
 * /attachments/{id}/send:
 *   post:
 *     tags: [Attachments]
 *     summary: Send an attachment to the client via WhatsApp
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Attachment sent }
 *       400: { description: Client has no phone on file }
 *
 * /attachments/{id}:
 *   delete:
 *     tags: [Attachments]
 *     summary: Delete an attachment (removes the Drive file too)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Attachment deleted }
 */
export {};
