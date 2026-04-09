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
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";

import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { BookingSchema, ManualBookingSchema } from "./bookings.types.js";

const router = express.Router();

router.post("/", validateRequest(BookingSchema), createBooking);
router.get("/availability", getAvailability);
router.get("/availability/days", getMonthlyAvailabilityDays);
router.get("/availability/slots", getDetailedDaySlots);
router.get("/metadata", getBookingMetadata);

// Protected Routes
router.get("/", protect, moderatorMiddleware, getAllBookings);
router.post("/manual", protect, moderatorMiddleware, validateRequest(ManualBookingSchema), createManualBooking);

//this endpoint should be delete but if we will ignore the payment module later it work correctly!
router.patch("/:id/confirm", protect, moderatorMiddleware, confirmBooking);
router.patch("/:id/complete", protect, moderatorMiddleware, completeBooking);
router.patch("/:id/cancel", protect, moderatorMiddleware, cancelBooking);
router.post("/:id/capture-payment", protect, moderatorMiddleware, capturePayment);

export default router;
