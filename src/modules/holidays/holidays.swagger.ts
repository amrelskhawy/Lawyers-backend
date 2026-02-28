/**
 * @swagger
 * components:
 *   schemas:
 *     Holiday:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         date:
 *           type: string
 *           format: date-time
 *         startTime:
 *           type: string
 *           description: Optional start time (HH:mm) for partial holidays
 *           nullable: true
 *         endTime:
 *           type: string
 *           description: Optional end time (HH:mm) for partial holidays
 *           nullable: true
 *         name:
 *           type: string
 *     CreateHolidayInput:
 *       type: object
 *       required:
 *         - date
 *         - name
 *       properties:
 *         date:
 *           type: string
 *           format: date-time
 *         name:
 *           type: string
 *         startTime:
 *           type: string
 *           example: "14:00"
 *         endTime:
 *           type: string
 *           example: "16:00"
 *     BulkDeleteInput:
 *       type: object
 *       required:
 *         - ids
 *       properties:
 *         ids:
 *           type: array
 *           items:
 *             type: string
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
 * /holidays:
 *   get:
 *     tags: [Holidays]
 *     summary: List all holidays (Public)
 *     responses:
 *       200:
 *         description: Holidays retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 * 
 *   post:
 *     tags: [Holidays]
 *     summary: Create a new holiday or blocked time (Moderator/Admin only)
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateHolidayInput'
 *     responses:
 *       201:
 *         description: Holiday created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Moderator/Admin only)
 *       409:
 *         description: Holiday already exists
 * 
 * /holidays/{id}:
 *   delete:
 *     tags: [Holidays]
 *     summary: Delete holiday (Moderator/Admin only)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The holiday ID
 *     responses:
 *       200:
 *         description: Holiday deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Moderator/Admin only)
 *       404:
 *         description: Holiday not found
 * 
 * /holidays/bulk-delete:
 *   delete:
 *     tags: [Holidays]
 *     summary: Bulk delete holidays (Moderator/Admin only)
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkDeleteInput'
 *     responses:
 *       200:
 *         description: Holidays deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Moderator/Admin only)
 */
