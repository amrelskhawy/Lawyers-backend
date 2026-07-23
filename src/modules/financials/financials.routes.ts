import express from "express";
import {
    getFinancialsSummary,
    getFinancialsContracts,
    getFinancialsYears,
} from "./financials.controller.js";
import { validateFinancialsQuery } from "./financials.validator.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";

const router = express.Router();

// Company-wide money — admins and moderators only.
router.use(protect, requireRole("ADMIN", "MODERATOR"));

router.get("/years", getFinancialsYears);
router.get("/summary", validateFinancialsQuery, getFinancialsSummary);
router.get("/contracts", validateFinancialsQuery, getFinancialsContracts);

export default router;
