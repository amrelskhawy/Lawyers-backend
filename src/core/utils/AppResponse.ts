export class AppResponse<T = any> {
    /**
     * @param success Indicates if the action was successful
     * @param message Description of the action status
     * @param data Optional payload containing the response data
     */
    constructor(
        public success: boolean,
        public message: string,
        public data?: T
    ) { }
}
