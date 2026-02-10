/**
 * @swagger
 * components:
 *   schemas:
 *     Moderator:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         email:
 *           type: string
 *         role:
 *           type: string
 *           enum: [ADMIN, MODERATOR]
 *         isVerified:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *     CreateModeratorInput:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - password
 *       properties:
 *         name:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           minLength: 6
 * 
 * /moderators:
 *   post:
 *     tags: [Moderators]
 *     summary: Create a new moderator (Admin only)
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateModeratorInput'
 *     responses:
 *       201:
 *         description: Moderator created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Moderator'
 *       400:
 *         description: Invalid input or user already exists
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 * 
 *   get:
 *     tags: [Moderators]
 *     summary: Get all moderators (Admin only)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of moderators
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Moderator'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 * 
 * /moderators/{id}:
 *   delete:
 *     tags: [Moderators]
 *     summary: Delete a moderator (Admin only)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The moderator ID
 *     responses:
 *       200:
 *         description: Moderator deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid role operation (if user is not a moderator)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 *       404:
 *         description: Moderator not found
 */
