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
    createLawyerFeesContractSigningLink,
    sendLawyerFeesContractSigningLinkWhatsapp,
    verifySigningIdentity,
    submitSignedContract,
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
router.post("/:id/signing-link", protect, moderatorMiddleware, createLawyerFeesContractSigningLink);
router.post(
    "/:id/signing-link/send-whatsapp",
    protect,
    moderatorMiddleware,
    sendLawyerFeesContractSigningLinkWhatsapp,
);

export default router;

// Public (no-auth) router for the signing flow — mounted separately in v1
const publicRouter = express.Router();
publicRouter.post("/:token/verify", verifySigningIdentity);
publicRouter.post("/:token/submit", submitSignedContract);
export { publicRouter as lawyerFeesContractSigningPublicRouter };
