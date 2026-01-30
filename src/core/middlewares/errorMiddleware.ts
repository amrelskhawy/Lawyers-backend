import { Request, Response, NextFunction } from "express";

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
        return next(err);
    }

    const statusCode =
        res.statusCode && res.statusCode >= 400 ? res.statusCode : 500;
    res.status(statusCode);

    if (process.env.NODE_ENV !== "production") {
        console.log(err);
    }

    res.json({
        message: err.message,
        stack: process.env.NODE_ENV === "production" ? null : err.stack,
    });
};
