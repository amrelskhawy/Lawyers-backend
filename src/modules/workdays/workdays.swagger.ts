/**
 * @swagger
 * components:
 *   schemas:
 *     WorkingDay:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated id of the working day
 *         day:
 *           type: string
 *           description: The day of the week (e.g., "Monday")
 *         isOpen:
 *           type: boolean
 *           default: true
 *           description: Whether the office is open on this day
 *         startTime:
 *           type: string
 *           default: "09:00"
 *           description: Opening time in HH:mm format
 *         endTime:
 *           type: string
 *           default: "17:00"
 *           description: Closing time in HH:mm format
 *     UpdateWorkingDaysInput:
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               day:
 *                 type: string
 *               isOpen:
 *                 type: boolean
 *               startTime:
 *                 type: string
 *               endTime:
 *                 type: string
 *
 * /workdays:
 *   get:
 *     summary: Retrieve all working days
 *     tags: [Workdays]
 *     responses:
 *       200:
 *         description: A list of working days
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/WorkingDay'
 *   patch:
 *     summary: Update working days
 *     tags: [Workdays]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateWorkingDaysInput'
 *     responses:
 *       200:
 *         description: Working days updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/WorkingDay'
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 */
