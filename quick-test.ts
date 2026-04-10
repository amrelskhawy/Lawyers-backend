// quick-test.ts
import { whapiService } from './src/core/services/whapi/whapi.service.js';

async function test() {
    try {
        const res = await whapiService.sendText("201203035328", "Test from Lawyers-Backend!");
        console.log("Success!", res);
    } catch (err) {
        console.error("Failed!", err);
    }
}
test();