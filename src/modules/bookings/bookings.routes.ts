import express from "express";
import {
    createBooking,
    getAvailability,
    getAllBookings,
    confirmBooking,
    completeBooking,
    cancelBooking,
    getBookingMetadata
} from "./bookings.controller.js";
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", createBooking);
router.get("/availability", getAvailability);
router.get("/metadata", getBookingMetadata);

// Protected Routes
router.get("/", protect, moderatorMiddleware, getAllBookings);
router.patch("/:id/confirm", protect, moderatorMiddleware, confirmBooking);
router.patch("/:id/complete", protect, moderatorMiddleware, completeBooking);
router.patch("/:id/cancel", protect, moderatorMiddleware, cancelBooking);

export default router;
