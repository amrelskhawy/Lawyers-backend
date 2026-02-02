import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.js";

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
        return next(err);
    }

    let statusCode = err.statusCode || 500;
    let message = err.message || "Something went wrong";
    let errorKey = err.errorKey || "SERVER_ERROR";

    // Handle generic Error objects that might bubble up
    if (!(err instanceof AppError) && statusCode === 500) {
        message = "Something went wrong";
        errorKey = "SERVER_ERROR";
    }

    // specific JWT error handling fallback if not caught in auth middleware
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid token';
        errorKey = 'AUTH_INVALID_TOKEN';
    }
    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token expired';
        errorKey = 'AUTH_INVALID_TOKEN';
    }

    res.status(statusCode).json({
        success: false,
        errorKey,
        message,
        // Only include stack trace in development
        stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    });

    // Optional: Log 500 errors for internal tracking
    if (statusCode === 500) {
        console.error("UNKNOWN ERROR:", err);
    }
};
