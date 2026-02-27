/**
 * @swagger
 * tags:
 *   name: Stripe
 *   description: >
 *     Payment flow using Stripe manual capture.
 *     Funds are frozen (authorised) on the customer's card when a booking is
 *     created and only moved to our account when an admin confirms the booking.
 *     Cancelling before capture simply lifts the hold — no charge, no refund.
 */

/**
 * @swagger
 * /stripe/create-payment-intent:
 *   post:
 *     summary: Create a payment intent (freeze funds)
 *     description: >
 *       Creates a Stripe PaymentIntent with `capture_method: manual`.
 *       The customer's card is authorised and the funds are **frozen** (held)
 *       but **not charged**. Call this immediately after creating a booking and
 *       use the returned `clientSecret` to confirm card details on the frontend
 *       via Stripe.js or React Stripe Elements.
 *     tags: [Stripe]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookingId
 *             properties:
 *               bookingId:
 *                 type: string
 *                 example: "clx1abc123def456"
 *                 description: The ID of the booking to associate with this payment intent.
 *     responses:
 *       200:
 *         description: PaymentIntent created. Use `clientSecret` on the frontend to collect card details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: PAYMENT_INTENT_CREATED
 *                 data:
 *                   type: object
 *                   properties:
 *                     clientSecret:
 *                       type: string
 *                       example: "pi_3PxXXXXXXXXX_secret_XXXXXXXXXXXXXXXX"
 *                     paymentIntentId:
 *                       type: string
 *                       example: "pi_3PxXXXXXXXXX"
 *       400:
 *         description: Missing bookingId or booking is not in PENDING state.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Booking not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /stripe/confirm-payment/{bookingId}:
 *   post:
 *     summary: Capture payment (admin confirms booking)
 *     description: >
 *       Captures the previously frozen funds for the given booking.
 *       This transfers the money from the customer's card into our Stripe
 *       account balance and marks the booking as **CONFIRMED**.
 *
 *       **Who calls this?** The admin/moderator — triggered when they click
 *       "Confirm Booking" in the dashboard (or via the bookings confirm endpoint).
 *     tags: [Stripe]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the booking whose payment should be captured.
 *         example: "clx1abc123def456"
 *     responses:
 *       200:
 *         description: Funds captured. Money is now in our account.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: PAYMENT_CAPTURED
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentIntentId:
 *                       type: string
 *                       example: "pi_3PxXXXXXXXXX"
 *                     stripeStatus:
 *                       type: string
 *                       example: "succeeded"
 *       400:
 *         description: No PaymentIntent on the booking or booking not in PENDING state.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized — missing or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — moderator or admin role required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Booking not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /stripe/cancel-payment/{bookingId}:
 *   post:
 *     summary: Cancel payment (release frozen hold — no charge, no refund)
 *     description: >
 *       Cancels the Stripe PaymentIntent for the given booking **before** it has
 *       been captured.
 *
 *       **What happens:**
 *       - The authorization hold on the customer's card is released automatically
 *         by Stripe (within 5–7 business days depending on the card issuer).
 *       - The customer is **not charged**.
 *       - **No refund is issued** because no funds were ever moved.
 *       - The booking status is set to **CANCELLED**.
 *
 *       ⚠️ If funds were already captured (booking is CONFIRMED), you cannot
 *       cancel — you must issue a refund instead. This endpoint will return
 *       `STRIPE_ALREADY_CAPTURED_USE_REFUND` in that case.
 *     tags: [Stripe]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the booking to cancel.
 *         example: "clx1abc123def456"
 *     responses:
 *       200:
 *         description: Payment cancelled. Hold on customer's card is released.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: PAYMENT_CANCELLED_HOLD_RELEASED
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentIntentId:
 *                       type: string
 *                       example: "pi_3PxXXXXXXXXX"
 *                     stripeStatus:
 *                       type: string
 *                       example: "canceled"
 *       400:
 *         description: >
 *           Possible reasons:
 *           - `STRIPE_NO_PAYMENT_INTENT`: No PaymentIntent linked to this booking.
 *           - `BOOKING_ALREADY_CANCELLED`: Booking was already cancelled.
 *           - `STRIPE_ALREADY_CAPTURED_USE_REFUND`: Funds already captured, use refund flow.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — moderator or admin role required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Booking not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /stripe/webhook:
 *   post:
 *     summary: Stripe webhook receiver
 *     description: >
 *       Receives and verifies signed events from Stripe. Used as a safety net
 *       to keep our database in sync with Stripe's state.
 *
 *       **Handled events:**
 *       | Event | Action |
 *       |---|---|
 *       | `payment_intent.succeeded` | Marks booking paymentStatus = CAPTURED |
 *       | `payment_intent.canceled` | Marks booking paymentStatus = CANCELLED |
 *       | `payment_intent.amount_capturable_updated` | Marks booking paymentStatus = AUTHORIZED |
 *
 *       ⚠️ **Setup requirement:** This endpoint must receive the **raw request body**
 *       (not JSON-parsed) for signature verification. Configure your Stripe Dashboard
 *       webhook to point to `POST /stripe/webhook`.
 *     tags: [Stripe]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Raw Stripe event payload (verified via `stripe-signature` header).
 *     parameters:
 *       - in: header
 *         name: stripe-signature
 *         required: true
 *         schema:
 *           type: string
 *         description: Stripe webhook signature for payload verification.
 *     responses:
 *       200:
 *         description: Event received and processed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid Stripe signature.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: BOOKING_NOT_FOUND
 *         data:
 *           nullable: true
 *           example: null
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

export { };