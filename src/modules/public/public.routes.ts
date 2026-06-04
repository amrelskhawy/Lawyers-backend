import express from "express";
import {
    getPublicData,
    getLawyers
} from './public.controller.js';

const router = express.Router();


// Main endpoint: Get all public data (services + holidays + working days)
router.get("/", getPublicData);
router.get("/lawyers", getLawyers);


export default router;