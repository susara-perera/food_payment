const paymentService = require("../services/paymentService");

/**
 * @desc    Auto-create a payment by fetching order & user details via inter-service calls
 * @route   POST /api/payments/order/:orderId/user/:userId
 * @integration  Order Service     — GET /orders/:orderId
 * @integration  User Identity Svc — GET /api/users/:userId
 */
exports.createPaymentFromOrder = async (req, res, next) => {
  try {
    const { orderId, userId } = req.params;
    const { currency, paymentMethod, metadata } = req.body;

    const result = await paymentService.createPaymentFromOrder({
      orderId,
      userId,
      currency,
      paymentMethod,
      metadata,
    });

    res.status(201).json({
      success: true,
      message: "Payment created successfully from order",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a payment enriched with live order & user details
 * @route   GET /api/payments/:id/details
 * @integration  Order Service     — GET /orders/:orderId
 * @integration  User Identity Svc — GET /api/users/:userId
 */
exports.getPaymentWithDetails = async (req, res, next) => {
  try {
    const result = await paymentService.getPaymentWithDetails(req.params.id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Process a new payment (manual — caller supplies amount)
 * @route   POST /api/payments
 */
exports.createPayment = async (req, res, next) => {
  try {
    const { orderId, userId, amount, currency, paymentMethod, description, metadata } = req.body;

    if (!orderId || !userId || !amount) {
      return res.status(400).json({
        success: false,
        message: "orderId, userId, and amount are required",
      });
    }

    const result = await paymentService.createPayment({
      orderId,
      userId,
      amount,
      currency,
      paymentMethod,
      description,
      metadata,
    });

    res.status(201).json({
      success: true,
      message: "Payment created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Confirm a payment with a payment method
 * @route   POST /api/payments/:id/confirm
 */
exports.confirmPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { paymentMethodId } = req.body;

    if (!paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: "paymentMethodId is required",
      });
    }

    const result = await paymentService.confirmPayment(id, paymentMethodId);

    res.status(200).json({
      success: true,
      message: `Payment ${result.status}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get payment by ID
 * @route   GET /api/payments/:id
 */
exports.getPaymentById = async (req, res, next) => {
  try {
    const payment = await paymentService.getPaymentById(req.params.id);

    res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get payment by order ID
 * @route   GET /api/payments/order/:orderId
 */
exports.getPaymentByOrderId = async (req, res, next) => {
  try {
    const payment = await paymentService.getPaymentByOrderId(req.params.orderId);

    res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all payments with filters
 * @route   GET /api/payments
 */
exports.getAllPayments = async (req, res, next) => {
  try {
    const { status, userId, page, limit } = req.query;
    const result = await paymentService.getAllPayments({ status, userId, page, limit });

    res.status(200).json({
      success: true,
      data: result.payments,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Process a refund
 * @route   POST /api/payments/:id/refund
 */
exports.refundPayment = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const result = await paymentService.refundPayment(req.params.id, amount);

    res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Generate invoice for a payment
 * @route   GET /api/payments/:id/invoice
 */
exports.generateInvoice = async (req, res, next) => {
  try {
    const invoice = await paymentService.generateInvoice(req.params.id);

    res.status(200).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user profile from User Identity Service
 * @route   GET /api/payments/user/:userId/profile
 * @integration  User Identity Service — GET /api/users/:id
 */
exports.getUserProfile = async (req, res, next) => {
  try {
    const user = await paymentService.getUserDetails(req.params.userId);

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all payments for a user, with their profile from User Identity Service
 * @route   GET /api/payments/user/:userId
 * @integration  User Identity Service — GET /api/users/:id
 */
exports.getPaymentsByUser = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await paymentService.getPaymentsByUser(req.params.userId, { page, limit });

    res.status(200).json({
      success: true,
      data: {
        user: result.user,
        payments: result.payments,
      },
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};
