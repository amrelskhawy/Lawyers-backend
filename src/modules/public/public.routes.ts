import express from "express";
import {
    getPublicData
} from './public.controller.js';

const router = express.Router();


// Main endpoint: Get all public data (services + holidays + working days)
router.get("/", getPublicData);


export default router;