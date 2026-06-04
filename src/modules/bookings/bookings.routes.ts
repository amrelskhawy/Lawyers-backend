import express from "express";
import {
    createBooking,
    getAvailability,
    getAllBookings,
    confirmBooking,
    completeBooking,
    cancelBooking,
    getBookingMetadata,
    getMonthlyAvailabilityDays,
    getDetailedDaySlots,
    createManualBooking,
    capturePayment,
} from "./bookings.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";

import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { BookingSchema, ManualBookingSchema } from "./bookings.types.js";

const router = express.Router();

router.post("/", validateRequest(BookingSchema), createBooking);
router.get("/availability", getAvailability);
router.get("/availability/days", getMonthlyAvailabilityDays);
router.get("/availability/slots", getDetailedDaySlots);
router.get("/metadata", getBookingMetadata);

// Protected Routes
router.get("/", protect, requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"), getAllBookings);
router.post("/manual", protect, requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"), validateRequest(ManualBookingSchema), logActivity("CREATE", "Booking"), createManualBooking);

router.patch("/:id/confirm", protect, requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"), logActivity("CONFIRM", "Booking"), confirmBooking);
router.patch("/:id/complete", protect, requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"), logActivity("COMPLETE", "Booking"), completeBooking);
router.patch("/:id/cancel", protect, requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"), logActivity("CANCEL", "Booking"), cancelBooking);
router.post("/:id/capture-payment", protect, requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"), capturePayment);

export default router;
