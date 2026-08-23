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
 *         caseDegree:
 *           type: string
 *           enum: [FIRST_INSTANCE, APPEAL, CASSATION, PETITION]
 *           nullable: true
 *         caseDate: { type: string, format: date-time }
 *         hijriDate: { type: string, nullable: true }
 *         agencyNumber: { type: string, nullable: true }
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
 *         agencyNumber: { type: string }
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
 *
 * /cases/{id}/assignment/reject:
 *   patch:
 *     tags: [Cases]
 *     summary: Reject a pending case assignment (assigned lawyer only) with a required reason
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Why the lawyer is rejecting the assignment
 *     responses:
 *       200: { description: Assignment rejected }
 *
 * /cases/{id}/stand-in:
 *   patch:
 *     tags: [Cases]
 *     summary: Name or clear the person covering a slot while its holder is away
 *     description: >
 *       Takes effect immediately — a stand-in has no accept/reject lifecycle of
 *       their own. They see the case and act with the slot holder's rights.
 *       Requires the slot to have an active (PENDING or ACCEPTED) holder, and the
 *       picked user's role must match the slot. Passing a null userId clears it.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [kind, userId]
 *             properties:
 *               kind:
 *                 type: string
 *                 enum: [LAWYER, CONSULTANT]
 *                 description: Which slot the stand-in covers
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: The stand-in; null clears the slot's stand-in
 *               userName: { type: string }
 *     responses:
 *       200: { description: Stand-in updated }
 *       400: { description: Slot has no active holder, or the pick is invalid }
 *
 * /cases/{id}/session:
 *   patch:
 *     tags: [Cases]
 *     summary: Set or clear the (Hijri) session date and time; (re)schedules the session reminders
 *     description: >
 *       Stores the Hijri session date as the canonical value and derives the Gregorian
 *       instant used for reminder scheduling. (Re)schedules the SESSION_DETAILS_REVIEW
 *       (15 days before), MEMO_REVIEW_UPLOAD (7 days before) and URGENT_SESSION_SOON
 *       (1 hour before) reminders, replacing any still-pending auto reminders.
 *       Passing both fields as null clears the session date and cancels the pending
 *       auto reminders. Both fields must be set or cleared together.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionHijriDate, sessionTime]
 *             properties:
 *               sessionHijriDate:
 *                 type: string
 *                 nullable: true
 *                 example: "1447-12-15"
 *                 description: Hijri date as iYYYY-iMM-iDD, or null to clear
 *               sessionTime:
 *                 type: string
 *                 nullable: true
 *                 example: "14:30"
 *                 description: 24h time-of-day as HH:mm, or null to clear
 *     responses:
 *       200: { description: Session date set/cleared and reminders (re)scheduled }
 *       400: { description: Invalid Hijri date or date in the past }
 *
 * /cases/{id}/degree:
 *   patch:
 *     tags: [Cases]
 *     summary: Set the case's litigation degree (درجة التقاضي)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [caseDegree]
 *             properties:
 *               caseDegree:
 *                 type: string
 *                 enum: [FIRST_INSTANCE, APPEAL, CASSATION, PETITION]
 *     responses:
 *       200: { description: Case degree set }
 *
 * /cases/{id}/court-info:
 *   patch:
 *     tags: [Cases]
 *     summary: Set the court (المحكمة) + case number (رقم القضية)
 *     description: >
 *       Persists the court and case number shown in the reminders dialog. Both
 *       feed the client-facing reminder messages and gate reminder dispatch —
 *       reminders are not sent while either is missing. Empty strings clear the
 *       field.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               courtName:
 *                 type: string
 *                 nullable: true
 *                 example: "المحكمة العامة بالرياض"
 *               caseNumber:
 *                 type: string
 *                 nullable: true
 *                 example: "1447/123"
 *     responses:
 *       200: { description: Court info saved }
 */
export {};
