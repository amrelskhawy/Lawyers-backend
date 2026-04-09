/**
 * @swagger
 * components:
 *   schemas:
 *     Organizer:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         userId:
 *           type: string
 *         isActive:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *             email:
 *               type: string
 *             role:
 *               type: string
 *               enum: [ADMIN, MODERATOR]
 *     CreateOrganizerInput:
 *       type: object
 *       required:
 *         - userId
 *       properties:
 *         userId:
 *           type: string
 *           description: ID of an existing admin or moderator user
 *     UpdateOrganizerInput:
 *       type: object
 *       required:
 *         - isActive
 *       properties:
 *         isActive:
 *           type: boolean
 *
 * /organizers:
 *   get:
 *     tags: [Organizers]
 *     summary: Get all organizers
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of organizers with user details
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
 *                     $ref: '#/components/schemas/Organizer'
 *   post:
 *     tags: [Organizers]
 *     summary: Add a user as an organizer
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrganizerInput'
 *     responses:
 *       201:
 *         description: Organizer created
 *       404:
 *         description: User not found
 *       409:
 *         description: User is already an organizer
 *
 * /organizers/{id}:
 *   get:
 *     tags: [Organizers]
 *     summary: Get an organizer by ID
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organizer details with user info
 *       404:
 *         description: Organizer not found
 *   put:
 *     tags: [Organizers]
 *     summary: Toggle organizer active status
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateOrganizerInput'
 *     responses:
 *       200:
 *         description: Organizer updated
 *       404:
 *         description: Organizer not found
 *   delete:
 *     tags: [Organizers]
 *     summary: Remove an organizer
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organizer deleted
 *       404:
 *         description: Organizer not found
 *
 * /organizers/many:
 *   delete:
 *     tags: [Organizers]
 *     summary: Delete multiple organizers
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Organizers deleted
 */
