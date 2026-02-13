import express from "express";
import { handleChatMessage } from "./chatbot.controller.js";

const router = express.Router();

router.post("/query", handleChatMessage);

export default router;
