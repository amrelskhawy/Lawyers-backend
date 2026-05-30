import { IPaymentProvider, PaymentProvider } from "./interfaces/payment.interface.js";
import { StripeProvider } from "./providers/stripe/stripe.provider.js";
import { TamaraProvider } from "./providers/tamara/tamara.provider.js";
import { TabbyProvider } from "./providers/tabby/tabby.provider.js";
import { PaymobProvider } from "./providers/paymob/paymob.provider.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { CustomerService } from "../customers/customers.service.js";

const customerService = new CustomerService();

export class PaymentFactory {
    private static instances = new Map<PaymentProvider, IPaymentProvider>();

    static getProvider(provider: PaymentProvider): IPaymentProvider {
        if (this.instances.has(provider)) {
            return this.instances.get(provider)!;
        }

        let instance: IPaymentProvider;

        switch (provider) {
            case "STRIPE":
                instance = new StripeProvider(customerService);
                break;
            case "TAMARA":
                instance = new TamaraProvider(customerService);
                break;
            case "TABBY":
                instance = new TabbyProvider(customerService);
                break;
            case "PAYMOB":
                instance = new PaymobProvider(customerService);
                break;
            default:
                throw new AppResponse(false, "UNSUPPORTED_PAYMENT_PROVIDER", null, 400);
        }

        this.instances.set(provider, instance);
        return instance;
    }

    static resolveProvider(providerStr: string): PaymentProvider {
        const valid: PaymentProvider[] = ["STRIPE", "TABBY", "TAMARA", "PAYMOB"];
        const upper = providerStr?.toUpperCase() as PaymentProvider;

        if (!valid.includes(upper)) {
            throw new AppResponse(
                false,
                "UNSUPPORTED_PAYMENT_PROVIDER",
                null,
                400
            );
        }

        return upper;
    }
}