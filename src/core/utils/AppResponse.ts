export class AppResponse<T = any> {
    public statusCode: number;

    /**
     * @param success Indicates if the action was successful
     * @param message Description of the action status
     * @param data Optional payload containing the response data or errors
     * @param statusCode HTTP status code (default 200)
     */
    constructor(
        public success: boolean,
        public message: string,
        public data: T | null = null,
        statusCode: number
    ) {
        this.statusCode = statusCode;
    }
}
