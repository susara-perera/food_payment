const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: [true, "Order ID is required"],
      index: true,
    },
    userId: {
      type: String,
      required: [true, "User ID is required"],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, "Payment amount is required"],
      min: [0.5, "Minimum payment amount is $0.50"],
    },
    currency: {
      type: String,
      required: true,
      default: "usd",
      enum: ["usd", "eur", "gbp", "lkr"],
      lowercase: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "succeeded", "failed", "refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["card", "bank_transfer"],
      default: "card",
    },
    stripePaymentIntentId: {
      type: String,
      default: null,
    },
    stripeClientSecret: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      default: "",
    },
    refundId: {
      type: String,
      default: null,
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Snapshot of user details fetched from User Identity Service at payment creation time
    userDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // Snapshot of order details fetched from Order Service at payment creation time
    orderDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Payment", paymentSchema);
