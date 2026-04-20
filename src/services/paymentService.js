const stripe = require("stripe");
const Payment = require("../models/Payment");
const { validateUser, getUserById } = require("./userService");
const { validateOrder, getOrderById } = require("./orderService");

// Initialize Stripe with the secret key
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

class PaymentService {
  /**
   * Create a Stripe PaymentIntent and store the payment record.
   * Validates the userId against the User Identity Service before proceeding.
   */
  async createPayment({ orderId, userId, amount, currency, paymentMethod, description, metadata }) {
    // Validate minimum amount (Stripe requires at least 50 cents)
    if (amount < 0.5) {
      throw { status: 400, message: "Minimum payment amount is $0.50" };
    }

    // ── Inter-service call: verify user exists in User Identity Service ──
    let userDetails = null;
    try {
      userDetails = await validateUser(userId);
    } catch (err) {
      // Propagate 404 (user not found) as a hard failure;
      // treat network/timeout issues as soft warnings so payments still work
      if (err.status === 404) throw err;
      console.warn(`[PaymentService] Could not reach User Identity Service: ${err.message}`);
    }

    // Convert amount to cents for Stripe (Stripe uses smallest currency unit)
    const amountInCents = Math.round(amount * 100);

    // Create a Stripe PaymentIntent
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: amountInCents,
      currency: currency || "usd",
      payment_method_types: ["card"],
      description: description || `Payment for Order ${orderId}`,
      metadata: {
        orderId,
        userId,
        ...metadata,
      },
    });

    // Save payment record in database (include user details snapshot)
    const payment = new Payment({
      orderId,
      userId,
      amount,
      currency: currency || "usd",
      status: "processing",
      paymentMethod: paymentMethod || "card",
      stripePaymentIntentId: paymentIntent.id,
      stripeClientSecret: paymentIntent.client_secret,
      description: description || `Payment for Order ${orderId}`,
      metadata,
      userDetails, // cached snapshot from User Identity Service
    });

    await payment.save();

    return {
      paymentId: payment._id,
      stripePaymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
    };
  }

  /**
   * Confirm a payment using a Stripe payment method (e.g., test card token)
   */
  async confirmPayment(paymentId, paymentMethodId) {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      throw { status: 404, message: "Payment not found" };
    }

    if (payment.status === "succeeded") {
      throw { status: 400, message: "Payment has already been completed" };
    }

    // Confirm the PaymentIntent with Stripe
    const paymentIntent = await stripeClient.paymentIntents.confirm(
      payment.stripePaymentIntentId,
      {
        payment_method: paymentMethodId,
      }
    );

    // Update payment status based on Stripe response
    payment.status = paymentIntent.status === "succeeded" ? "succeeded" : "failed";
    await payment.save();

    return {
      paymentId: payment._id,
      orderId: payment.orderId,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      stripeStatus: paymentIntent.status,
    };
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(paymentId) {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      throw { status: 404, message: "Payment not found" };
    }
    return payment;
  }

  /**
   * Get payment by order ID
   */
  async getPaymentByOrderId(orderId) {
    const payment = await Payment.findOne({ orderId });
    if (!payment) {
      throw { status: 404, message: "Payment not found for this order" };
    }
    return payment;
  }

  /**
   * Get all payments with optional filters
   */
  async getAllPayments({ status, userId, page = 1, limit = 10 }) {
    const filter = {};
    if (status) filter.status = status;
    if (userId) filter.userId = userId;

    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Payment.countDocuments(filter),
    ]);

    return {
      payments,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Process a refund
   */
  async refundPayment(paymentId, amount) {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      throw { status: 404, message: "Payment not found" };
    }

    if (payment.status !== "succeeded") {
      throw { status: 400, message: "Only succeeded payments can be refunded" };
    }

    const refundAmount = amount || payment.amount;
    if (refundAmount > payment.amount) {
      throw { status: 400, message: "Refund amount cannot exceed payment amount" };
    }

    // Create refund via Stripe
    const refund = await stripeClient.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: Math.round(refundAmount * 100), // convert to cents
    });

    // Update payment record
    payment.status = "refunded";
    payment.refundId = refund.id;
    payment.refundAmount = refundAmount;
    await payment.save();

    return {
      paymentId: payment._id,
      orderId: payment.orderId,
      refundId: refund.id,
      refundAmount,
      status: payment.status,
    };
  }

  /**
   * Generate an invoice object for a payment
   */
  async generateInvoice(paymentId) {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      throw { status: 404, message: "Payment not found" };
    }

    const invoice = {
      invoiceNumber: `INV-${payment._id.toString().slice(-8).toUpperCase()}`,
      paymentId: payment._id,
      orderId: payment.orderId,
      userId: payment.userId,
      amount: payment.amount,
      currency: payment.currency.toUpperCase(),
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      description: payment.description,
      issuedAt: payment.createdAt,
      paidAt: payment.status === "succeeded" ? payment.updatedAt : null,
      refundAmount: payment.refundAmount,
    };

    return invoice;
  }

  /**
   * Auto-create a payment by fetching order details from the Order Service
   * and validating the user from the User Identity Service.
   *
   * Flow:
   *   1. GET https://order-service-production-5615.up.railway.app/orders/:orderId
   *      → extract total amount, validate order is payable
   *   2. GET https://user-identity-service.onrender.com/api/users/:userId
   *      → validate user exists, capture profile snapshot
   *   3. Create Stripe PaymentIntent with the fetched amount
   *   4. Persist payment record in MongoDB
   *
   * @param {string} orderId   - Order ID from the Order Service
   * @param {string} userId    - User ID from the User Identity Service
   * @param {string} [currency]      - ISO 4217 currency code (default: "usd")
   * @param {string} [paymentMethod] - Payment method type (default: "card")
   * @param {object} [metadata]      - Extra metadata to attach to the payment
   * @returns {Promise<object>} Created payment details + Stripe client secret
   */
  async createPaymentFromOrder({ orderId, userId, currency, paymentMethod, metadata }) {
    // ── Step 1: Validate order & get amount from Order Service ──────────────
    let order, amount;
    try {
      ({ order, amount } = await validateOrder(orderId));
    } catch (err) {
      throw err;
    }

    // ── Step 2: Validate user from User Identity Service ────────────────────
    let userDetails = null;
    try {
      userDetails = await validateUser(userId);
    } catch (err) {
      if (err.status === 404) throw err;
      console.warn(`[PaymentService] Could not reach User Identity Service: ${err.message}`);
    }

    // Ensure the userId on the order matches (if order carries a userId field)
    if (order.userId && order.userId.toString() !== userId.toString()) {
      throw {
        status: 403,
        message: `User ${userId} is not the owner of order ${orderId}`,
      };
    }

    // ── Step 3: Create Stripe PaymentIntent ─────────────────────────────────
    const amountInCents = Math.round(amount * 100);
    const resolvedCurrency = currency || order.currency || "usd";

    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: amountInCents,
      currency: resolvedCurrency,
      payment_method_types: ["card"],
      description: `Payment for Order ${orderId}`,
      metadata: {
        orderId,
        userId,
        ...metadata,
      },
    });

    // ── Step 4: Persist payment record ──────────────────────────────────────
    const payment = new Payment({
      orderId,
      userId,
      amount,
      currency: resolvedCurrency,
      status: "processing",
      paymentMethod: paymentMethod || "card",
      stripePaymentIntentId: paymentIntent.id,
      stripeClientSecret: paymentIntent.client_secret,
      description: `Payment for Order ${orderId}`,
      metadata,
      userDetails,       // snapshot from User Identity Service
      orderDetails: order, // snapshot from Order Service
    });

    await payment.save();

    return {
      paymentId: payment._id,
      orderId,
      userId,
      amount,
      currency: resolvedCurrency,
      stripePaymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      status: payment.status,
      order,
      user: userDetails,
    };
  }

  /**
   * Get a payment enriched with live data from Order Service and
   * User Identity Service.
   *
   * @param {string} paymentId
   * @returns {Promise<object>} Payment + order + user details
   */
  async getPaymentWithDetails(paymentId) {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      throw { status: 404, message: "Payment not found" };
    }

    // Fetch order and user in parallel; degrade gracefully if either is down
    const [order, user] = await Promise.all([
      getOrderById(payment.orderId).catch((err) => {
        console.warn(`[PaymentService] Could not enrich with order: ${err.message}`);
        return payment.orderDetails || null;
      }),
      getUserById(payment.userId).catch((err) => {
        console.warn(`[PaymentService] Could not enrich with user: ${err.message}`);
        return payment.userDetails || null;
      }),
    ]);

    return {
      payment,
      order,
      user,
    };
  }

  /**
   * Fetch a user's profile directly from the User Identity Service.
   * Endpoint resolved: GET https://user-identity-service.onrender.com/api/users/:id
   *
   * @param {string} userId
   * @returns {Promise<object>} User profile
   */
  async getUserDetails(userId) {
    return getUserById(userId);
  }

  /**
   * Get all payments for a specific user, enriched with their profile from
   * the User Identity Service.
   *
   * @param {string} userId
   * @param {{ page?: number, limit?: number }} options
   */
  async getPaymentsByUser(userId, { page = 1, limit = 10 } = {}) {
    const skip = (page - 1) * limit;

    const [payments, total, user] = await Promise.all([
      Payment.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Payment.countDocuments({ userId }),
      getUserById(userId).catch((err) => {
        // Don't fail the whole request if user service is unreachable
        console.warn(`[PaymentService] Could not fetch user for enrichment: ${err.message}`);
        return null;
      }),
    ]);

    return {
      user,
      payments,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    };
  }
}

module.exports = new PaymentService();
