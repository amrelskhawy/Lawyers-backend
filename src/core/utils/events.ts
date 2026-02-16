import { EventEmitter } from 'events';

class EventBus extends EventEmitter { }

export const eventBus = new EventBus();

export const EVENTS = {
    DATA_CHANGED: 'DATA_CHANGED',
};
