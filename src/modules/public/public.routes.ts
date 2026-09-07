import express from "express";
import {
    getPublicData,
    getLawyers,
    getServiceCategories,
    getServiceCategoryBySlug,
} from './public.controller.js';

const router = express.Router();


// Main endpoint: Get all public data (services + holidays + working days)
router.get("/", getPublicData);
router.get("/lawyers", getLawyers);
router.get("/service-categories", getServiceCategories);
router.get("/service-categories/:slug", getServiceCategoryBySlug);


export default router;