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
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import {
    validateCreateLawyerFeesContract,
    validateUpdateLawyerFeesContract,
} from "./lawyer-fees-contracts.validator.js";

const router = express.Router();

router.get("/",                        protect, requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"), listLawyerFeesContracts);
router.get("/by-case/:caseId",         protect, requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"), listLawyerFeesContractsByCase);
router.get("/by-customer/:customerId", protect, requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"), listLawyerFeesContractsByCustomer);
router.get("/:id",                     protect, requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"), getLawyerFeesContract);

router.post("/",       protect, requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"), validateCreateLawyerFeesContract, logActivity("CREATE", "LawyerFeesContract"), createLawyerFeesContract);
router.patch("/:id",   protect, requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"), validateUpdateLawyerFeesContract, logActivity("UPDATE", "LawyerFeesContract"), updateLawyerFeesContract);
router.delete("/:id",  protect, requireRole("ADMIN", "MODERATOR"), logActivity("DELETE", "LawyerFeesContract"), deleteLawyerFeesContract);

router.post("/:id/generate-pdf", protect, requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"), logActivity("GENERATE_PDF", "LawyerFeesContract"), generateLawyerFeesContractPdf);
router.post("/:id/signing-link", protect, requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"), logActivity("CREATE_SIGNING_LINK", "LawyerFeesContract"), createLawyerFeesContractSigningLink);
router.post(
    "/:id/signing-link/send-whatsapp",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"),
    logActivity("SEND_SIGNING_LINK", "LawyerFeesContract"),
    sendLawyerFeesContractSigningLinkWhatsapp,
);

export default router;

// Public (no-auth) router for the signing flow — mounted separately in v1
const publicRouter = express.Router();
publicRouter.post("/:token/verify", verifySigningIdentity);
publicRouter.post("/:token/submit", submitSignedContract);
export { publicRouter as lawyerFeesContractSigningPublicRouter };
