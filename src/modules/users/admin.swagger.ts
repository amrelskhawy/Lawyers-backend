/**
 * @swagger
 * /api/v1/admin/users/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a user (Admin only)
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
 *         description: User deleted successfully
 * 
 * /api/v1/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Get all users (Creator/Admin only)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
