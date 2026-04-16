/**
 * @swagger
 * components:
 *   schemas:
 *     Case:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         customerId: { type: string }
 *         caseType:
 *           type: string
 *           enum: [CRIMINAL, ADMINISTRATIVE, LABOR, COMMERCIAL, PENAL, GENERAL, PERSONAL_STATUS, OTHER]
 *         otherCaseType: { type: string, nullable: true }
 *         caseDate: { type: string, format: date-time }
 *         hijriDate: { type: string, nullable: true }
 *         wantsSpecificLawyer: { type: boolean }
 *         preferredLawyerId: { type: string, nullable: true }
 *         sessionReceiverId: { type: string, nullable: true }
 *         sessionDate: { type: string, format: date-time, nullable: true }
 *         hasStructuredNotes: { type: boolean }
 *         weaknesses: { type: array, items: { type: string } }
 *         strengths: { type: array, items: { type: string } }
 *         gaps: { type: array, items: { type: string } }
 *         freeNotes: { type: string, nullable: true }
 *         reportFileId: { type: string, nullable: true }
 *         reportUrl: { type: string, nullable: true }
 *         sentToClientAt: { type: string, format: date-time, nullable: true }
 *         createdById: { type: string }
 *         isDeleted: { type: boolean }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     CreateCaseInput:
 *       type: object
 *       required: [customerId, caseType, caseDate]
 *       properties:
 *         customerId: { type: string }
 *         caseType:
 *           type: string
 *           enum: [CRIMINAL, ADMINISTRATIVE, LABOR, COMMERCIAL, PENAL, GENERAL, PERSONAL_STATUS, OTHER]
 *         otherCaseType: { type: string }
 *         caseDate: { type: string, format: date-time }
 *         hijriDate: { type: string }
 *
 * /cases:
 *   get:
 *     tags: [Cases]
 *     summary: List all cases
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *   post:
 *     tags: [Cases]
 *     summary: Create a new case
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateCaseInput' }
 *     responses:
 *       201: { description: Created }
 *
 * /cases/{id}:
 *   get:
 *     tags: [Cases]
 *     summary: Get a case by id
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *   patch:
 *     tags: [Cases]
 *     summary: Partially update a case
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated }
 *   delete:
 *     tags: [Cases]
 *     summary: Soft-delete a case
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 *
 * /cases/{id}/generate-pdf:
 *   post:
 *     tags: [Cases]
 *     summary: Generate the case report PDF and upload to the customer's Drive folder
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: PDF generated and uploaded }
 *
 * /cases/{id}/send-to-client:
 *   post:
 *     tags: [Cases]
 *     summary: Email the case report PDF to the customer
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Sent }
 */
export {};
