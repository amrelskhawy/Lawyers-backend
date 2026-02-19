import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { BookingService } from "./bookings.service.js";
import { AvailabilityEngine } from "./availability.engine.js";
import { AppResponse } from "../../core/utils/AppResponse.js";


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
        throw new AppResponse(false, "AVAILABILITY_DATE_REQUIRED", null, 400);
    }

    const dateObj = new Date(date as string);
    if (isNaN(dateObj.getTime())) {
        throw new AppResponse(false, "AVAILABILITY_DATE_INVALID", null, 400);
    }

    const duration = serviceDuration ? parseInt(serviceDuration as string) : 60;

    const slots = await availabilityEngine.getAvailableSlots(dateObj, duration);

    res.status(200).json(new AppResponse(true, "AVAILABLE_SLOTS_RETRIEVED", slots));
});

export const getMonthlyAvailabilityDays = asyncHandler(async (req: Request, res: Response) => {
    const { month, year } = req.query;

    if (!month || !year) {
        throw new AppResponse(false, "MONTH_YEAR_REQUIRED", null, 400);
    }

    const m = parseInt(month as string);
    const y = parseInt(year as string);

    if (isNaN(m) || isNaN(y) || m < 1 || m > 12) {
        throw new AppResponse(false, "INVALID_DATE_PARAMS", null, 400);
    }

    const availability = await availabilityEngine.getMonthlyAvailability(y, m);
    res.status(200).json(new AppResponse(true, "MONTHLY_AVAILABILITY_RETRIEVED", availability));
});

export const getDetailedDaySlots = asyncHandler(async (req: Request, res: Response) => {
    const { date, serviceDuration } = req.query;

    if (!date) {
        throw new AppResponse(false, "AVAILABILITY_DATE_REQUIRED", null, 400);
    }

    const dateObj = new Date(date as string);
    if (isNaN(dateObj.getTime())) {
        throw new AppResponse(false, "AVAILABILITY_DATE_INVALID", null, 400);
    }

    const duration = serviceDuration ? parseInt(serviceDuration as string) : 60;

    const slots = await availabilityEngine.getDetailedDailySlots(dateObj, duration);

    res.status(200).json(new AppResponse(true, "DETAILED_DAY_SLOTS_RETRIEVED", slots));
});

export const getBookingMetadata = asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        throw new AppResponse(false, "DATE_RANGE_REQUIRED", null, 400);
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