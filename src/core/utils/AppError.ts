export class AppError extends Error {
    public readonly statusCode: number;
    public readonly errorKey: string;
    public readonly isOperational: boolean;
    public readonly errors?: any[];

    constructor(message: string, statusCode: number, errorKey: string, errors?: any[]) {
        super(message);
        this.statusCode = statusCode;
        this.errorKey = errorKey;
        this.isOperational = true;
        this.errors = errors;

        Error.captureStackTrace(this, this.constructor);
    }
}
