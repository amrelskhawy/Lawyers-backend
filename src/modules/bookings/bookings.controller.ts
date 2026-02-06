import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { BookingService } from "./bookings.service.js";
import { AvailabilityEngine } from "./availability.engine.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AppError } from "../../core/utils/AppError.js";

const bookingService = new BookingService();
const availabilityEngine = new AvailabilityEngine();

export const createBooking = asyncHandler(async (req: Request, res: Response) => {
    const { serviceId, date, startTime, clientEmail } = req.body;

    if (!serviceId || !date || !startTime || !clientEmail) {
        throw new AppError("Missing required booking details", 400, "BOOKING_DETAILS_MISSING");
    }

    const booking = await bookingService.createBooking({ serviceId, date, startTime, clientEmail });
    res.status(201).json(new AppResponse(true, "Booking created successfully", booking));
});

export const getAvailability = asyncHandler(async (req: Request, res: Response) => {
    const { date, serviceDuration } = req.query;

    if (!date) {
        throw new AppError("Date is required", 400, "AVAILABILITY_DATE_REQUIRED");
    }

    const dateObj = new Date(date as string);
    if (isNaN(dateObj.getTime())) {
        throw new AppError("Invalid date format", 400, "AVAILABILITY_DATE_INVALID");
    }

    const duration = serviceDuration ? parseInt(serviceDuration as string) : 60;
    const slots = await availabilityEngine.getAvailableSlots(dateObj, duration);

    res.status(200).json(new AppResponse(true, "Available slots retrieved", slots));
});

export const getAllBookings = asyncHandler(async (req: Request, res: Response) => {
    const bookings = await bookingService.getAllBookings();
    res.status(200).json(new AppResponse(true, "All bookings retrieved", bookings));
});

export const confirmBooking = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const booking = await bookingService.confirmBooking(id);
    res.status(200).json(new AppResponse(true, "Booking confirmed", booking));
});

export const completeBooking = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const booking = await bookingService.completeBooking(id);
    res.status(200).json(new AppResponse(true, "Booking completed", booking));
});

export const cancelBooking = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const booking = await bookingService.cancelBooking(id);
    res.status(200).json(new AppResponse(true, "Booking cancelled", booking));
});
