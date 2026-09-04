/**
 * @swagger
 * components:
 *   schemas:
 *     Article:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         slug:
 *           type: string
 *         title:
 *           type: string
 *         excerpt:
 *           type: string
 *           nullable: true
 *         content:
 *           type: string
 *           description: Sanitised rich-text HTML from the dashboard editor.
 *         coverImage:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [DRAFT, PUBLISHED]
 *         publishedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateArticleInput:
 *       type: object
 *       required:
 *         - title
 *         - content
 *       properties:
 *         title:
 *           type: string
 *         slug:
 *           type: string
 *           description: Optional — derived from the title when omitted.
 *         excerpt:
 *           type: string
 *           description: Optional — derived from the body when omitted.
 *         content:
 *           type: string
 *         coverImage:
 *           type: string
 *         status:
 *           type: string
 *           enum: [DRAFT, PUBLISHED]
 *     UpdateArticleInput:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *         slug:
 *           type: string
 *         excerpt:
 *           type: string
 *         content:
 *           type: string
 *         coverImage:
 *           type: string
 *         status:
 *           type: string
 *           enum: [DRAFT, PUBLISHED]
 *
 * tags:
 *   - name: Articles
 *     description: Blog articles — managed by ADMIN/MODERATOR, read by anyone.
 */

/**
 * @swagger
 * /articles:
 *   get:
 *     summary: List articles (dashboard — includes drafts)
 *     tags: [Articles]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [DRAFT, PUBLISHED] }
 *     responses:
 *       200:
 *         description: A page of articles with pagination meta
 *       403:
 *         description: Not an ADMIN/MODERATOR
 *   post:
 *     summary: Create an article
 *     tags: [Articles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateArticleInput'
 *     responses:
 *       201:
 *         description: Article created
 *
 * /articles/{id}:
 *   get:
 *     summary: Get one article by id (dashboard)
 *     tags: [Articles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The article
 *       404:
 *         description: ARTICLE_NOT_FOUND
 *   put:
 *     summary: Update an article
 *     tags: [Articles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateArticleInput'
 *     responses:
 *       200:
 *         description: Article updated
 *   delete:
 *     summary: Delete an article
 *     tags: [Articles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Article deleted
 *
 * /articles/{id}/toggle-status:
 *   patch:
 *     summary: Flip an article between DRAFT and PUBLISHED
 *     tags: [Articles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: New status applied
 *
 * /articles/many:
 *   delete:
 *     summary: Delete several articles
 *     tags: [Articles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Deleted count
 *
 * /articles/upload-image:
 *   post:
 *     summary: Upload a cover or in-body image (max 5 MB)
 *     tags: [Articles]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Public image URL and Drive file id
 *
 * /public/articles:
 *   get:
 *     summary: List published articles (public blog)
 *     tags: [Articles]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 9 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: A page of published articles (cards, no body)
 *
 * /public/articles/{slug}:
 *   get:
 *     summary: Read one published article by slug
 *     tags: [Articles]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The article plus up to 3 related ones
 *       404:
 *         description: ARTICLE_NOT_FOUND
 */

export {};
