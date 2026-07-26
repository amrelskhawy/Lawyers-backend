import express from "express";
import {
    getFinancialsSummary,
    getFinancialsContracts,
    getFinancialsYears,
} from "./financials.controller.js";
import { validateFinancialsQuery } from "./financials.validator.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";

const router = express.Router();

// Admins and moderators see all the money; a lawyer or consultant is narrowed
// to the clients they sourced by `validateFinancialsQuery`, which overrides the
// scope from the token. Every route below must therefore run that validator.
router.use(protect, requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"));

router.get("/years", validateFinancialsQuery, getFinancialsYears);
router.get("/summary", validateFinancialsQuery, getFinancialsSummary);
router.get("/contracts", validateFinancialsQuery, getFinancialsContracts);

export default router;
