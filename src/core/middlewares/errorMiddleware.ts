import { Request, Response, NextFunction } from "express";
import { AppResponse } from "../utils/AppResponse.js";

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
        return next(err);
    }

    let statusCode = err.statusCode || 500;
    let message = err.message || "Something went wrong";
    let data = err.data || null;

    // If it's an AppResponse instance (check by structure to be safe with different instances)
    if (err instanceof AppResponse || (err.success !== undefined && err.message && err.statusCode)) {
        statusCode = err.statusCode || 500;
        message = err.message;
        data = err.data;
    }
    // Specific JWT error handling
    else if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'AUTH_INVALID_TOKEN';
    }
    else if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'AUTH_INVALID_TOKEN';
    }
    // Generic Error handling
    else if (statusCode === 500) {
        message = "SERVER_ERROR";
    }

    // Ensure status code is valid
    if (typeof statusCode !== 'number' || statusCode < 100 || statusCode >= 600) {
        statusCode = 500;
    }

    res.status(statusCode).json({
        success: false,
        message,
        data
    });

    if (statusCode === 500) {
        console.error("UNKNOWN ERROR:", err);
    }
};
