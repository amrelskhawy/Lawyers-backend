/**
 * @swagger
 * components:
 *   schemas:
 *     ConsultingRecord:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         clientName:
 *           type: string
 *         date:
 *           type: string
 *           format: date-time
 *         value:
 *           type: number
 *           format: decimal
 *         type:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateConsultingRecordInput:
 *       type: object
 *       required:
 *         - clientName
 *         - date
 *         - value
 *         - type
 *       properties:
 *         clientName:
 *           type: string
 *         date:
 *           type: string
 *           format: date-time
 *         value:
 *           type: number
 *           format: decimal
 *         type:
 *           type: string
 *     UpdateConsultingRecordInput:
 *       type: object
 *       properties:
 *         clientName:
 *           type: string
 *         date:
 *           type: string
 *           format: date-time
 *         value:
 *           type: number
 *           format: decimal
 *         type:
 *           type: string
 *
 * /consulting:
 *   get:
 *     tags: [Consulting]
 *     summary: List consulting records (Admin/Moderator only)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Consulting records retrieved successfully
 *   post:
 *     tags: [Consulting]
 *     summary: Create a new consulting record (Admin/Moderator only)
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateConsultingRecordInput'
 *     responses:
 *       201:
 *         description: Consulting record created successfully
 *       403:
 *         description: Forbidden (Admin/Moderator only)
 *
 * /consulting/{id}:
 *   get:
 *     tags: [Consulting]
 *     summary: Get consulting record by ID (Admin/Moderator only)
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
 *         description: Consulting record retrieved successfully
 *       404:
 *         description: Consulting record not found
 *   put:
 *     tags: [Consulting]
 *     summary: Update consulting record (Admin/Moderator only)
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
 *             $ref: '#/components/schemas/UpdateConsultingRecordInput'
 *     responses:
 *       200:
 *         description: Consulting record updated successfully
 *       404:
 *         description: Consulting record not found
 *   delete:
 *     tags: [Consulting]
 *     summary: Delete consulting record (Admin/Moderator only)
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
 *         description: Consulting record deleted successfully
 *       404:
 *         description: Consulting record not found
 *
 * /consulting/many:
 *   delete:
 *     tags: [Consulting]
 *     summary: Bulk delete consulting records (Admin/Moderator only)
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
 *         description: Consulting records deleted successfully
 */
