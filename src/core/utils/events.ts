import { EventEmitter } from "events";

export enum SystemEvents {
    DATA_CHANGED = "DATA_CHANGED",
    SERVICE_CREATED = "SERVICE_CREATED",
    SERVICE_UPDATED = "SERVICE_UPDATED",
    SERVICE_DELETED = "SERVICE_DELETED",
    WORKDAY_UPDATED = "WORKDAY_UPDATED",
    HOLIDAY_CREATED = "HOLIDAY_CREATED",
    HOLIDAY_UPDATED = "HOLIDAY_UPDATED",
    HOLIDAY_DELETED = "HOLIDAY_DELETED",
}

class AppEventEmitter extends EventEmitter {
    private static instance: AppEventEmitter;

    private constructor() {
        super();
        this.setMaxListeners(20); // Increase if needed
    }

    public static getInstance(): AppEventEmitter {
        if (!AppEventEmitter.instance) {
            AppEventEmitter.instance = new AppEventEmitter();
        }
        return AppEventEmitter.instance;
    }

    /**
     * Emit a data change event to trigger context updates
     */
    public emitDataChange(eventType: SystemEvents, data?: any): void {
        this.emit(SystemEvents.DATA_CHANGED, { eventType, data, timestamp: new Date() });
        this.emit(eventType, data);
    }
}

export const appEvents = AppEventEmitter.getInstance();
