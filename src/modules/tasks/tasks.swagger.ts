/**
 * @swagger
 * tags:
 *   name: Tasks
 *   description: Staff to-dos. A task is visible only to its creator and its assignees — there is no admin-wide view.
 *
 * components:
 *   schemas:
 *     Task:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         title: { type: string }
 *         description: { type: string, nullable: true }
 *         status: { type: string, enum: [TODO, IN_PROGRESS, DONE] }
 *         priority: { type: string, enum: [LOW, MEDIUM, HIGH] }
 *         dueDate: { type: string, format: date-time, nullable: true }
 *         caseId: { type: string, format: uuid, nullable: true }
 *         createdById: { type: string, format: uuid }
 *         assignees:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               userId: { type: string, format: uuid }
 *     TaskInput:
 *       type: object
 *       required: [title]
 *       properties:
 *         title: { type: string, maxLength: 200 }
 *         description: { type: string, nullable: true }
 *         status: { type: string, enum: [TODO, IN_PROGRESS, DONE] }
 *         priority: { type: string, enum: [LOW, MEDIUM, HIGH] }
 *         dueDate: { type: string, format: date-time, nullable: true }
 *         caseId: { type: string, format: uuid, nullable: true }
 *         assigneeIds:
 *           type: array
 *           items: { type: string, format: uuid }
 *
 * /tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: List the tasks I created or am assigned to
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: mine
 *         schema: { type: string, enum: [created, assigned] }
 *         description: Narrow to only the tasks I created, or only those assigned to me
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [TODO, IN_PROGRESS, DONE] }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [LOW, MEDIUM, HIGH] }
 *       - in: query
 *         name: caseId
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Tasks retrieved }
 *   post:
 *     tags: [Tasks]
 *     summary: Create a task and assign it to any staff members
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TaskInput' }
 *     responses:
 *       201: { description: Task created }
 *
 * /tasks/assignable-users:
 *   get:
 *     tags: [Tasks]
 *     summary: Staff list for the assignee picker
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Users retrieved }
 *
 * /tasks/{id}:
 *   get:
 *     tags: [Tasks]
 *     summary: Get one task (404 when I am neither creator nor assignee)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Task retrieved }
 *       404: { description: TASK_NOT_FOUND }
 *   put:
 *     tags: [Tasks]
 *     summary: Update a task (creator only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TaskInput' }
 *     responses:
 *       200: { description: Task updated }
 *       403: { description: TASK_FORBIDDEN }
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete a task (creator only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Task deleted }
 *       403: { description: TASK_FORBIDDEN }
 *
 * /tasks/{id}/status:
 *   patch:
 *     tags: [Tasks]
 *     summary: Move a task along its status (creator or assignee)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [TODO, IN_PROGRESS, DONE] }
 *     responses:
 *       200: { description: Status updated }
 *       403: { description: TASK_FORBIDDEN }
 *
 * /tasks/many:
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete several tasks (only those I created are removed)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: string, format: uuid }
 *     responses:
 *       200: { description: Tasks deleted }
 */
export {};
