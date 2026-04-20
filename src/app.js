const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");

const paymentRoutes = require("./routes/paymentRoutes");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// --------------- Security Middleware ---------------
app.use(helmet()); // Set security HTTP headers
app.use(cors()); // Enable CORS for Order Service communication

// --------------- Request Parsing ---------------
app.use(express.json({ limit: "10kb" })); // Body parser with size limit
app.use(express.urlencoded({ extended: true }));

// --------------- Logging ---------------
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// --------------- Swagger Documentation ---------------
try {
  const swaggerDocument = YAML.load(path.join(__dirname, "..", "swagger.yaml"));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (err) {
  console.warn("Swagger document not found, skipping API docs setup");
}

// --------------- Health Check ---------------
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    service: "payment-service",
    timestamp: new Date().toISOString(),
  });
});

// --------------- API Routes ---------------
app.use("/api/payments", paymentRoutes);

// --------------- 404 Handler ---------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// --------------- Error Handler ---------------
app.use(errorHandler);

module.exports = app;
