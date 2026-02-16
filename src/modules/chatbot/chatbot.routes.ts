import express from "express";
import { handleChat } from "./chatbot.controller.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Chatbot
 *   description: AI Chatbot Service
 */

/**
 * @swagger
 * /chat:
 *   post:
 *     summary: Ask a question to the chatbot
 *     tags: [Chatbot]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - question
 *             properties:
 *               question:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     answer:
 *                       type: string
 */
router.post("/", handleChat as any);

export default router;
