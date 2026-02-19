/**
 * Chatbot Swagger Documentation
 * OpenAPI specification for chatbot endpoints
 */

/**
 * @swagger
 * tags:
 *   name: Chatbot
 *   description: AI-powered chatbot for booking system inquiries
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ChatMessage:
 *       type: object
 *       required:
 *         - role
 *         - parts
 *       properties:
 *         role:
 *           type: string
 *           enum: [user, model]
 *           description: The role of the message sender
 *           example: user
 *         parts:
 *           type: string
 *           description: The content of the message
 *           example: "What services do you offer?"
 * 
 *     ChatRequest:
 *       type: object
 *       required:
 *         - question
 *       properties:
 *         question:
 *           type: string
 *           description: The question to ask the chatbot
 *           example: "What are your working hours on Monday?"
 *           maxLength: 1000
 *         conversationHistory:
 *           type: array
 *           description: Optional conversation history for context (max 20 messages)
 *           maxItems: 20
 *           items:
 *             $ref: '#/components/schemas/ChatMessage'
 * 
 *     ChatResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             answer:
 *               type: string
 *               description: The chatbot's response
 *               example: "Our working hours on Monday are from 09:00 to 17:00."
 *             timestamp:
 *               type: string
 *               format: date-time
 *               description: When the response was generated
 *               example: "2024-02-15T10:30:00.000Z"
 *             contextVersion:
 *               type: integer
 *               description: Current version of the chatbot context
 *               example: 5
 * 
 *     ContextInfo:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             version:
 *               type: integer
 *               description: Current context version number
 *               example: 5
 *             lastUpdated:
 *               type: string
 *               format: date-time
 *               description: When the context was last updated
 *               example: "2024-02-15T10:00:00.000Z"
 *             statistics:
 *               type: object
 *               properties:
 *                 services:
 *                   type: integer
 *                   description: Number of active services in context
 *                   example: 3
 *                 workingDays:
 *                   type: integer
 *                   description: Number of working day configurations
 *                   example: 7
 *                 holidays:
 *                   type: integer
 *                   description: Number of upcoming holidays
 *                   example: 5
 * 
 *     HealthCheckResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Chatbot service is healthy"
 *         data:
 *           type: object
 *           properties:
 *             status:
 *               type: string
 *               example: operational
 *             version:
 *               type: integer
 *               example: 5
 *             lastUpdated:
 *               type: string
 *               format: date-time
 *               example: "2024-02-15T10:00:00.000Z"
 *             statistics:
 *               type: object
 *               properties:
 *                 services:
 *                   type: integer
 *                   example: 3
 *                 workingDays:
 *                   type: integer
 *                   example: 7
 *                 holidays:
 *                   type: integer
 *                   example: 5
 * 
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: "Question cannot be empty"
 *         errorCode:
 *           type: string
 *           example: "EMPTY_QUESTION"
 */

/**
 * @swagger
 * /api/v1/chat:
 *   post:
 *     summary: Ask a question to the chatbot
 *     description: |
 *       Send a question to the AI chatbot about services, working hours, holidays, or booking policies.
 *       
 *       **Security & Privacy:**
 *       - The chatbot CANNOT access customer booking data or personal information
 *       - Only public information (services, hours, holidays) is available
 *       - All customer data is protected and never shared with the AI
 *       
 *       **Features:**
 *       - Maintains conversation history for context
 *       - Provides accurate information based on current system data
 *       - Auto-updates when business data changes
 *     tags: [Chatbot]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatRequest'
 *           examples:
 *             simpleQuestion:
 *               summary: Simple question
 *               value:
 *                 question: "What services do you offer?"
 *             withHistory:
 *               summary: Question with conversation history
 *               value:
 *                 question: "How much does it cost?"
 *                 conversationHistory:
 *                   - role: "user"
 *                     parts: "Tell me about your consultation service"
 *                   - role: "model"
 *                     parts: "Our consultation service is a 60-minute session where we discuss your needs..."
 *     responses:
 *       200:
 *         description: Successful response with chatbot answer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatResponse'
 *       400:
 *         description: Invalid request (empty question, too long, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               emptyQuestion:
 *                 value:
 *                   success: false
 *                   message: "Question cannot be empty"
 *                   errorCode: "EMPTY_QUESTION"
 *               questionTooLong:
 *                 value:
 *                   success: false
 *                   message: "Question is too long (max 1000 characters)"
 *                   errorCode: "QUESTION_TOO_LONG"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /api/v1/chat/context:
 *   get:
 *     summary: Get current chatbot context information
 *     description: Retrieve metadata about the chatbot's current knowledge base, including version, last update time, and statistics.
 *     tags: [Chatbot]
 *     responses:
 *       200:
 *         description: Context information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContextInfo'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /api/v1/chat/refresh:
 *   post:
 *     summary: Manually refresh chatbot context
 *     description: |
 *       Force an immediate refresh of the chatbot's context data from the database.
 *       
 *       **Note:** Context automatically updates when data changes via CRUD operations.
 *       This endpoint is for manual refreshes or troubleshooting.
 *       
 *       **TODO:** Add authentication middleware to restrict access to admin users only.
 *     tags: [Chatbot]
 *     responses:
 *       200:
 *         description: Context refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Context refreshed successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ContextInfo/properties/data'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /api/v1/chat/health:
 *   get:
 *     summary: Check chatbot service health
 *     description: Verify that the chatbot service is operational and retrieve current status information.
 *     tags: [Chatbot]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheckResponse'
 *       500:
 *         description: Service is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

export { };
