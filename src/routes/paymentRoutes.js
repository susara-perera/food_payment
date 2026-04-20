const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");

// ── Inter-service: auto-create payment from Order + User services ─────────
// POST /api/payments/order/:orderId/user/:userId
//   Fetches order amount from Order Service, validates user from User Identity
//   Service, then creates a Stripe PaymentIntent automatically
router.post("/order/:orderId/user/:userId", paymentController.createPaymentFromOrder);

// POST /api/payments - Create a new payment (manual — caller supplies amount)
router.post("/", paymentController.createPayment);

// GET /api/payments - Get all payments (with optional filters)
router.get("/", paymentController.getAllPayments);

// ── User Identity Service integration routes (must be before /:id) ──────────

// GET /api/payments/user/:userId/profile
//   Proxies GET https://user-identity-service.onrender.com/api/users/:id
router.get("/user/:userId/profile", paymentController.getUserProfile);

// GET /api/payments/user/:userId
//   Returns all payments for this user enriched with their profile data
router.get("/user/:userId", paymentController.getPaymentsByUser);

// GET /api/payments/order/:orderId - Get payment by Order ID (before /:id)
router.get("/order/:orderId", paymentController.getPaymentByOrderId);

// ── Individual payment routes ───────────────────────────────────────────────

// POST /api/payments/:id/confirm - Confirm payment with payment method
router.post("/:id/confirm", paymentController.confirmPayment);

// POST /api/payments/:id/refund - Process a refund
router.post("/:id/refund", paymentController.refundPayment);

// GET /api/payments/:id/details - Get payment enriched with order + user details
router.get("/:id/details", paymentController.getPaymentWithDetails);

// GET /api/payments/:id/invoice - Generate invoice
router.get("/:id/invoice", paymentController.generateInvoice);

// GET /api/payments/:id - Get payment by ID
router.get("/:id", paymentController.getPaymentById);

module.exports = router;
