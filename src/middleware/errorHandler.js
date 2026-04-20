/**
 * Centralized error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // If the error has a status code set by our service layer
  if (err.status) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
    });
  }

  // Handle Mongoose validation errors
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: "Validation Error",
      errors: messages,
    });
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format",
    });
  }

  // Handle Stripe errors
  if (err.type && err.type.startsWith("Stripe")) {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message,
      type: err.type,
    });
  }

  // Default server error
  console.error("Unhandled Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
};

module.exports = errorHandler;
