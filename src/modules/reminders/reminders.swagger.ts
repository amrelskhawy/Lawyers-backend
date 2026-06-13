/**
 * @swagger
 * tags:
 *   name: Reminders
 *   description: Per-case WhatsApp reminders
 *
 * /reminders/types:
 *   get:
 *     tags: [Reminders]
 *     summary: List reminder types and their level descriptions
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Types retrieved }
 *
 * /reminders/case/{caseId}:
 *   get:
 *     tags: [Reminders]
 *     summary: List reminders for a case
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Reminders retrieved }
 *
 * /reminders:
 *   post:
 *     tags: [Reminders]
 *     summary: Create a reminder
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [caseId, type, hijriDate, time]
 *             properties:
 *               caseId: { type: string }
 *               type:
 *                 type: string
 *                 enum: [SESSION_DETAILS_REVIEW, MEMO_REVIEW_UPLOAD, URGENT_SESSION_SOON, CUSTOM]
 *               title: { type: string }
 *               content: { type: string }
 *               hijriDate: { type: string, example: "1447-12-15", description: "Hijri (Umm al-Qura) date iYYYY-iMM-iDD" }
 *               time: { type: string, example: "14:30", description: "Time of day HH:mm (Asia/Riyadh)" }
 *               repeat: { type: boolean }
 *               repeatEveryHours: { type: integer, minimum: 1 }
 *     responses:
 *       201: { description: Reminder created }
 *
 * /reminders/{id}:
 *   patch:
 *     tags: [Reminders]
 *     summary: Update a reminder
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Reminder updated }
 *   delete:
 *     tags: [Reminders]
 *     summary: Delete a reminder
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Reminder deleted }
 */
