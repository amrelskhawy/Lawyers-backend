/**
 * @swagger
 * components:
 *   schemas:
 *     Service:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name_ar:
 *           type: string
 *         name_en:
 *           type: string
 *         description_ar:
 *           type: string
 *           nullable: true
 *         description_en:
 *           type: string
 *           nullable: true
 *         price:
 *           type: number
 *           format: decimal
 *           nullable: true


 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateServiceInput:
 *       type: object
 *       required:
 *         - name_ar
 *         - name_en
 *       properties:
 *         name_ar:
 *           type: string
 *         name_en:
 *           type: string
 *         description_ar:
 *           type: string
 *         description_en:
 *           type: string
 *         price:
 *           type: number
 *           format: decimal
 *     UpdateServiceInput:
 *       type: object
 *       properties:
 *         name_ar:
 *           type: string
 *         name_en:
 *           type: string
 *         description_ar:
 *           type: string
 *         description_en:
 *           type: string
 *         price:
 *           type: number
 *           format: decimal
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
 * /services:
 *   get:
 *     tags: [Services]
 *     summary: List all services (Public)
 *     responses:
 *       200:
 *         description: Services retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 * 
 *   post:
 *     tags: [Services]
 *     summary: Create a new service (Moderator/Admin only)
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateServiceInput'
 *     responses:
 *       201:
 *         description: Service created successfully
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
 * 
 * /services/{id}:
 *   get:
 *     tags: [Services]
 *     summary: Get service by ID (Public)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The service ID
 *     responses:
 *       200:
 *         description: Service retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: Service not found
 * 
 *   put:
 *     tags: [Services]
 *     summary: Update service (Moderator/Admin only)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The service ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateServiceInput'
 *     responses:
 *       200:
 *         description: Service updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Moderator/Admin only)
 *       404:
 *         description: Service not found
 * 
 *   delete:
 *     tags: [Services]
 *     summary: Delete service (Moderator/Admin only)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The service ID
 *     responses:
 *       200:
 *         description: Service deleted or disabled successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Moderator/Admin only)
 *       404:
 *         description: Service not found
 * 
 * /services/bulk-delete:
 *   delete:
 *     tags: [Services]
 *     summary: Bulk delete services (Moderator/Admin only)
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
 *         description: Services deleted or disabled successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Moderator/Admin only)
 * 
 * /services/{id}/toggle-status:
 *   patch:
 *     tags: [Services]
 *     summary: Toggle service status (Moderator/Admin only)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The service ID
 *     responses:
 *       200:
 *         description: Service status toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Moderator/Admin only)
 *       404:
 *         description: Service not found
 */
