import express from "express";
import {
    listCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    deleteMultipleCustomers,
} from "./customers.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";
import { validateCreateCustomer, validateUpdateCustomer } from "./customers.validator.js";

const router = express.Router();

router.get("/", protect, requireRole("ADMIN", "LAWYER", "MODERATOR", "RECEPTIONIST"), listCustomers);
router.get("/:id", protect, requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"), getCustomer);
router.post("/", protect, requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"), validateCreateCustomer, logActivity("CREATE", "Customer"), createCustomer);
router.put("/:id", protect, requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"), validateUpdateCustomer, logActivity("UPDATE", "Customer"), updateCustomer);
router.delete("/many", protect, requireRole("ADMIN"), validateRequest(BulkDeleteSchema as any), logActivity("DELETE_MANY", "Customer"), deleteMultipleCustomers);
router.delete("/:id", protect, requireRole("ADMIN"), logActivity("DELETE", "Customer"), deleteCustomer);

export default router;
