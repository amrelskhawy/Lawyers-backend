import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { BookingService } from "./bookings.service.js";
import { AvailabilityEngine } from "./availability.engine.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AppError } from "../../core/utils/AppError.js";

const bookingService = new BookingService();
const availabilityEngine = new AvailabilityEngine();

export const createBooking = asyncHandler(async (req: Request, res: Response) => {
    // Validation handled by middleware
    const booking = await bookingService.createBooking(req.body);
    res.status(201).json(new AppResponse(true, "BOOKING_CREATED_SUCCESS", booking));
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

    res.status(200).json(new AppResponse(true, "AVAILABLE_SLOTS_RETRIEVED", slots));
});

export const getMonthlyAvailabilityDays = asyncHandler(async (req: Request, res: Response) => {
    const { month, year } = req.query;

    if (!month || !year) {
        throw new AppError("Month and year are required", 400, "MONTH_YEAR_REQUIRED");
    }

    const m = parseInt(month as string);
    const y = parseInt(year as string);

    if (isNaN(m) || isNaN(y) || m < 1 || m > 12) {
        throw new AppError("Invalid month or year", 400, "INVALID_DATE_PARAMS");
    }

    const availability = await availabilityEngine.getMonthlyAvailability(y, m);
    res.status(200).json(new AppResponse(true, "MONTHLY_AVAILABILITY_RETRIEVED", availability));
});

export const getDetailedDaySlots = asyncHandler(async (req: Request, res: Response) => {
    const { date, serviceDuration } = req.query;

    if (!date) {
        throw new AppError("Date is required", 400, "AVAILABILITY_DATE_REQUIRED");
    }

    const dateObj = new Date(date as string);
    if (isNaN(dateObj.getTime())) {
        throw new AppError("Invalid date format", 400, "AVAILABILITY_DATE_INVALID");
    }

    const duration = serviceDuration ? parseInt(serviceDuration as string) : 60;

    const slots = await availabilityEngine.getDetailedDailySlots(dateObj, duration);

    res.status(200).json(new AppResponse(true, "DETAILED_DAY_SLOTS_RETRIEVED", slots));
});

export const getBookingMetadata = asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        throw new AppError("Start date and end date are required", 400, "DATE_RANGE_REQUIRED");
    }

    const metadata = await bookingService.getBookingMetadata(startDate as string, endDate as string);
    res.status(200).json(new AppResponse(true, "BOOKING_METADATA_RETRIEVED", metadata));
});

export const getAllBookings = asyncHandler(async (req: Request, res: Response) => {
    const bookings = await bookingService.getAllBookings();
    res.status(200).json(new AppResponse(true, "ALL_BOOKINGS_RETRIEVED", bookings));
});

export const confirmBooking = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const booking = await bookingService.confirmBooking(id);
    res.status(200).json(new AppResponse(true, "BOOKING_CONFIRMED", booking));
});

export const completeBooking = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const booking = await bookingService.completeBooking(id);
    res.status(200).json(new AppResponse(true, "BOOKING_COMPLETED", booking));
});

export const cancelBooking = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const booking = await bookingService.cancelBooking(id);
    res.status(200).json(new AppResponse(true, "BOOKING_CANCELLED", booking));
});