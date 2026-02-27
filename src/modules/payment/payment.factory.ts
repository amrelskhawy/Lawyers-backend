import { IPaymentProvider, PaymentProvider } from "./payment.interface.js";
import { StripeProvider } from "./providers/stripe/stripe.provider.js";
import { TamaraProvider } from "./providers/tamara/tamara.provider.js";
import { TabbyProvider } from "./providers/tabby/tabby.provider.js";
import { AppResponse } from "../../../core/utils/AppResponse.js";

/**
 * PaymentFactory — Factory Pattern
 *
 * Responsible for instantiating the correct payment provider.
 * Uses singleton instances to avoid recreating providers on every request.
 *
 * Adding a new provider = add one case here. Nothing else changes.
 */
export class PaymentFactory {
    private static instances = new Map<PaymentProvider, IPaymentProvider>();

    static getProvider(provider: PaymentProvider): IPaymentProvider {
        // Return cached instance if exists (singleton per provider)
        if (this.instances.has(provider)) {
            return this.instances.get(provider)!;
        }

        let instance: IPaymentProvider;

        switch (provider) {
            case "STRIPE":
                instance = new StripeProvider();
                break;
            case "TAMARA":
                instance = new TamaraProvider();
                break;
            case "TABBY":
                instance = new TabbyProvider();
                break;
            default:
                throw new AppResponse(false, "UNSUPPORTED_PAYMENT_PROVIDER", null, 400);
        }

        this.instances.set(provider, instance);
        return instance;
    }

    /**
     * Resolve provider from a string (e.g. from request body or DB).
     * Throws a clean error if the provider string is invalid.
     */
    static resolveProvider(providerStr: string): PaymentProvider {
        const valid: PaymentProvider[] = ["STRIPE", "TAMARA", "TABBY"];
        const upper = providerStr?.toUpperCase() as PaymentProvider;

        if (!valid.includes(upper)) {
            throw new AppResponse(
                false,
                `INVALID_PAYMENT_PROVIDER. Must be one of: ${valid.join(", ")}`,
                null,
                400
            );
        }

        return upper;
    }
}