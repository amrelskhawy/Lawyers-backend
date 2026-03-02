import { IPaymentProvider, PaymentProvider } from "./interfaces/payment.interface.js";
import { StripeProvider } from "./providers/stripe/stripe.provider.js";
import { TabbyProvider } from "./providers/tabby/tabby.provider.js";

/**
 * PaymentFactory
 *
 * Singleton registry for all payment providers.
 * Adding a new provider = one new case here + one new provider file.
 * Nothing else in the system needs to change.
 */
export class PaymentFactory {
    private static instances: Map<PaymentProvider, IPaymentProvider> = new Map();

    static getProvider(provider: PaymentProvider): IPaymentProvider {
        if (!this.instances.has(provider)) {
            switch (provider) {
                case "STRIPE":
                    this.instances.set(provider, new StripeProvider());
                    break;
                case "TABBY":
                    this.instances.set(provider, new TabbyProvider());
                    break;
                default:
                    throw new Error(`Unknown payment provider: ${provider}`);
            }
        }
        return this.instances.get(provider)!;
    }

    /**
     * Resolves a raw string from the request body to a typed PaymentProvider.
     * Throws if unsupported.
     */
    static resolveProvider(raw: string): PaymentProvider {
        const upper = raw?.toUpperCase();
        if (upper === "STRIPE" || upper === "TABBY") {
            return upper as PaymentProvider;
        }
        throw new Error(`UNSUPPORTED_PROVIDER: ${raw}`);
    }
}