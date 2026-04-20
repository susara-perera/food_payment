require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./app");

const PORT = process.env.PORT || 8084;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/payment-service";

// Connect to MongoDB and start server
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`Payment Service running on port ${PORT}`);
      console.log(`API Docs: http://localhost:${PORT}/api-docs`);
      console.log(`Health Check: http://localhost:${PORT}/health`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });
