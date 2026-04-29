import express from "express";
import {
    listLawyerFeesContracts,
    listLawyerFeesContractsByCase,
    listLawyerFeesContractsByCustomer,
    getLawyerFeesContract,
    createLawyerFeesContract,
    updateLawyerFeesContract,
    deleteLawyerFeesContract,
    generateLawyerFeesContractPdf,
} from "./lawyer-fees-contracts.controller.js";
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";
import {
    validateCreateLawyerFeesContract,
    validateUpdateLawyerFeesContract,
} from "./lawyer-fees-contracts.validator.js";

const router = express.Router();

router.get("/",                       protect, moderatorMiddleware, listLawyerFeesContracts);
router.get("/by-case/:caseId",        protect, moderatorMiddleware, listLawyerFeesContractsByCase);
router.get("/by-customer/:customerId", protect, moderatorMiddleware, listLawyerFeesContractsByCustomer);
router.get("/:id",                    protect, moderatorMiddleware, getLawyerFeesContract);

router.post("/",       protect, moderatorMiddleware, validateCreateLawyerFeesContract, createLawyerFeesContract);
router.patch("/:id",   protect, moderatorMiddleware, validateUpdateLawyerFeesContract, updateLawyerFeesContract);
router.delete("/:id",  protect, moderatorMiddleware, deleteLawyerFeesContract);

router.post("/:id/generate-pdf", protect, moderatorMiddleware, generateLawyerFeesContractPdf);

export default router;
