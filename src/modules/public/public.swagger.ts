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
 *     Holiday:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         date:
 *           type: string
 *           description: Formatted date (YYYY-MM-DD)
 *           example: "2024-12-25"
 *         name:
 *           type: string
 *         startTime:
 *           type: string
 *           nullable: true
 *           example: "09:00"
 *         endTime:
 *           type: string
 *           nullable: true
 *           example: "17:00"
 *         isFullDay:
 *           type: boolean
 *     WorkingDay:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         day:
 *           type: string
 *         isOpen:
 *           type: boolean
 *         startTime:
 *           type: string
 *         endTime:
 *           type: string
 *     DataResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Data retrieved successfully"
 *         data:
 *           type: object
 *           properties:
 *             services:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Service'
 *             holidays:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Holiday'
 *             workingDays:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/WorkingDay'
 *
 * /public:
 *   get:
 *     summary: Get all  data
 *     description: Retrieve all active services, future holidays, and working days configuration.
 *     tags: []
 *     responses:
 *       200:
 *         description:  data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DataResponse'
 *
 * /public/service-categories:
 *   get:
 *     summary: List the 8 fixed service categories
 *     description: Returns the fixed category list (name, description, icon, color) with a live count of published services in each.
 *     tags: []
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 *
 * /public/service-categories/{slug}:
 *   get:
 *     summary: Get one category page
 *     description: Returns one category's metadata plus every published service assigned to it.
 *     tags: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category retrieved successfully
 *       404:
 *         description: Unknown category slug
 */
