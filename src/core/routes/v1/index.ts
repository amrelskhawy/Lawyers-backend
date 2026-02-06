import { Router } from "express";
import authRoutes from "../../../modules/auth/auth.routes.js";
import adminRoutes from "../../../modules/users/admin.routes.js";
import moderatorRoutes from "../../../modules/moderators/moderators.routes.js";
import servicesRoutes from "../../../modules/services/services.routes.js";
import bookingRoutes from "../../../modules/bookings/bookings.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/moderators", moderatorRoutes);
router.use("/services", servicesRoutes);
router.use("/bookings", bookingRoutes);

export default router;
