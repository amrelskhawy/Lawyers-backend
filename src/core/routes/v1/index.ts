import { Router } from "express";
import authRoutes from "../../../modules/auth/auth.routes.js";
import adminRoutes from "../../../modules/users/admin.routes.js";
import moderatorRoutes from "../../../modules/moderators/moderators.routes.js";
import servicesRoutes from "../../../modules/services/services.routes.js";
import bookingRoutes from "../../../modules/bookings/bookings.routes.js";
import holidayRoutes from "../../../modules/holidays/holidays.routes.js";
import publicRoutes from "../../../modules/public/public.routes.js";
import workdaysRoutes from "../../../modules/workdays/workdays.routes.js";
import chatbotRoutes from "../../../modules/chatbot/chatbot.routes.js";
import paymentRoutes from "../../../modules/payment/payment.routes.js";
import customersRoutes from "../../../modules/customers/customers.routes.js";
import organizersRoutes from "../../../modules/organizers/organizers.routes.js";
import casesRoutes from "../../../modules/cases/cases.routes.js";
import sessionReportsRoutes from "../../../modules/session-reports/session-reports.routes.js";
import fieldVisitReportsRoutes from "../../../modules/field-visit-reports/field-visit-reports.routes.js";
import lawyerFeesContractsRoutes, {
    lawyerFeesContractSigningPublicRouter,
} from "../../../modules/lawyer-fees-contracts/lawyer-fees-contracts.routes.js";
import activityLogsRoutes from "../../../modules/activity-logs/activity-logs.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/moderators", moderatorRoutes);
router.use("/services", servicesRoutes);
router.use("/bookings", bookingRoutes);
router.use("/holidays", holidayRoutes);
router.use("/workdays", workdaysRoutes);
router.use("/public", publicRoutes);
router.use("/chat", chatbotRoutes);
router.use("/payment", paymentRoutes);
router.use("/customers", customersRoutes);
router.use("/organizers", organizersRoutes);
router.use("/cases", casesRoutes);
router.use("/session-reports", sessionReportsRoutes);
router.use("/field-visit-reports", fieldVisitReportsRoutes);
router.use("/lawyer-fees-contracts", lawyerFeesContractsRoutes);
router.use("/public/sign-contract", lawyerFeesContractSigningPublicRouter);
router.use("/activity-logs", activityLogsRoutes);

export default router;
