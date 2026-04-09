import express from "express";
import {
    listCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    deleteMultipleCustomers,
} from "./customers.controller.js";
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";
import { validateCreateCustomer, validateUpdateCustomer } from "./customers.validator.js";

const router = express.Router();

router.get("/", protect, moderatorMiddleware, listCustomers);
router.get("/:id", protect, moderatorMiddleware, getCustomer);
router.post("/", protect, moderatorMiddleware, validateCreateCustomer, createCustomer);
router.put("/:id", protect, moderatorMiddleware, validateUpdateCustomer, updateCustomer);
router.delete("/many", protect, moderatorMiddleware, validateRequest(BulkDeleteSchema as any), deleteMultipleCustomers);
router.delete("/:id", protect, moderatorMiddleware, deleteCustomer);

export default router;
