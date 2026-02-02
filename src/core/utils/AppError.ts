export class AppError extends Error {
    public readonly statusCode: number;
    public readonly errorKey: string;
    public readonly isOperational: boolean;

    constructor(message: string, statusCode: number, errorKey: string) {
        super(message);
        this.statusCode = statusCode;
        this.errorKey = errorKey;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}
