import express from "express";
import multer from "multer";
import {
    listCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    deleteMultipleCustomers,
    sendCustomerDocument,
} from "./customers.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";
import { validateCreateCustomer, validateUpdateCustomer } from "./customers.validator.js";

// Signed documents are held in memory, forwarded to WhatsApp, never written to disk.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

const router = express.Router();

router.get("/", protect, listCustomers);
router.get("/:id", protect, requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"), getCustomer);
router.post("/", protect, requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"), validateCreateCustomer, logActivity("CREATE", "Customer"), createCustomer);
router.put("/:id", protect, requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"), validateUpdateCustomer, logActivity("UPDATE", "Customer"), updateCustomer);
router.post(
    "/:id/send-document",
    protect,
    requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"),
    upload.single("file"),
    logActivity("SEND", "Customer"),
    sendCustomerDocument,
);
router.delete("/many", protect, requireRole("ADMIN"), validateRequest(BulkDeleteSchema as any), logActivity("DELETE_MANY", "Customer"), deleteMultipleCustomers);
router.delete("/:id", protect, requireRole("ADMIN"), logActivity("DELETE", "Customer"), deleteCustomer);

export default router;
