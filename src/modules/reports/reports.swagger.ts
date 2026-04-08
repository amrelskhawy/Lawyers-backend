/**
 * @swagger
 * components:
 *   schemas:
 *     ApiResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 *         data:
 *           type: object
 * 
 *     SessionReport:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         clientName:
 *           type: string
 *         clientPhone:
 *           type: string
 *         clientDate:
 *           type: string
 *           format: date-time
 *         caseType:
 *           type: string
 *           enum: [CRIMINAL, ADMINISTRATIVE, LABOR, COMMERCIAL, PERSONAL_STATUS, GENERAL]
 *         status:
 *           type: string
 *           enum: [DRAFT, GENERATING, READY, SENT]
 *         pdfUrl:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 * 
 *     CreateSessionReportInput:
 *       type: object
 *       required:
 *         - client
 *         - lawyer
 *         - documents
 *       properties:
 *         client:
 *           type: object
 *           required: [name, phone, date, caseType]
 *           properties:
 *             name: { type: string }
 *             phone: { type: string }
 *             date: { type: string, format: date, example: "2024-04-08" }
 *             caseType: { type: string, enum: [CRIMINAL, ADMINISTRATIVE, LABOR, COMMERCIAL, PERSONAL_STATUS, GENERAL] }
 *         lawyer:
 *           type: object
 *           properties:
 *             name: { type: string }
 *             specificLawyerRequested: { type: boolean, default: false }
 *         documents:
 *           type: object
 *           properties:
 *             idCopy: { type: boolean, default: false }
 *             absherMobile: { type: boolean, default: false }
 *             nationalAddress: { type: boolean, default: false }
 *             documentsCopy: { type: boolean, default: false }
 *             tawakkalna: { type: boolean, default: false }
 *         session:
 *           type: object
 *           properties:
 *             receiverName: { type: string }
 *             sessionDate: { type: string, format: date }
 *             strengths: { type: string }
 *             weaknesses: { type: string }
 *             gaps: { type: string }
 * 
 *     SendReportInput:
 *       type: object
 *       required:
 *         - channel
 *         - destination
 *       properties:
 *         channel:
 *           type: string
 *           enum: [email, sms, whatsapp]
 *         destination:
 *           type: string
 *           description: Email address or Phone number
 * 
 * /reports/session:
 *   post:
 *     tags: [Reports]
 *     summary: Create a new report draft
 *     description: Creates a session report draft without generating the PDF.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSessionReportInput'
 *     responses:
 *       201:
 *         description: Report draft created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized
 * 
 *   get:
 *     tags: [Reports]
 *     summary: List all reports
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: List of reports retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 * 
 * /reports/session/{id}/generate:
 *   post:
 *     tags: [Reports]
 *     summary: Queue PDF generation
 *     description: Adds a job to the background queue to generate the report PDF.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: PDF generation queued
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       409:
 *         description: Report is already being generated
 * 
 * /reports/session/{id}/preview:
 *   get:
 *     tags: [Reports]
 *     summary: Get report preview details
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Report preview details retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       202:
 *         description: Report is still generating
 *       400:
 *         description: Report is not ready
 * 
 * /reports/session/{id}/send:
 *   post:
 *     tags: [Reports]
 *     summary: Send report via a channel
 *     security:
 *       - cookieAuth: []
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
 *             $ref: '#/components/schemas/SendReportInput'
 *     responses:
 *       200:
 *         description: Report sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Report not ready or invalid channel
 */
