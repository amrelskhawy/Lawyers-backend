export class AppResponse<T = any> {
    public statusCode: number;
    /**
     * @param success Indicates if the action was successful
     * @param message Description of the action status
     * @param data Optional payload containing the response data or errors
     * @param statusCode HTTP status code (default: 200)
     * @param meta Optional pagination metadata for list endpoints ({ total, page, limit, totalPages })
     */
    constructor(
        public success: boolean,
        public message: string,
        public data: T | null = null,
        statusCode: number = 200,
        public meta: object | null = null
    ) {
        this.statusCode = statusCode;
    }
}
