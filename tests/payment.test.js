const request = require("supertest");
const app = require("../src/app");

// Mock the Payment model
jest.mock("../src/models/Payment");
const Payment = require("../src/models/Payment");

// Mock axios — prevents real HTTP calls to the User Identity Service
jest.mock("axios");
const axios = require("axios");

// Default: user lookup succeeds
const mockUser = {
  _id: "user_001",
  name: "Susara Perera",
  email: "susara@example.com",
  role: "customer",
};

// Default: order lookup succeeds
const mockOrder = {
  _id: "order_001",
  userId: "user_001",
  status: "pending",
  totalAmount: 25.99,
  items: [{ name: "Burger", price: 25.99, qty: 1 }],
  createdAt: new Date().toISOString(),
};

// Route requests to the correct mock based on URL
axios.get = jest.fn().mockImplementation((url) => {
  if (url && url.includes("/orders/")) {
    return Promise.resolve({ data: mockOrder });
  }
  return Promise.resolve({ data: mockUser });
});

// Mock Stripe
jest.mock("stripe", () => {
  return jest.fn(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: "pi_test_123456",
        client_secret: "pi_test_123456_secret_abc",
        status: "requires_payment_method",
      }),
      confirm: jest.fn().mockResolvedValue({
        id: "pi_test_123456",
        status: "succeeded",
      }),
    },
    refunds: {
      create: jest.fn().mockResolvedValue({
        id: "re_test_789",
        status: "succeeded",
      }),
    },
  }));
});

// Helper to create a mock payment document
const mockPayment = (overrides = {}) => ({
  _id: "665f1a2b3c4d5e6f7a8b9c0d",
  orderId: "order_001",
  userId: "user_001",
  amount: 25.99,
  currency: "usd",
  status: "processing",
  paymentMethod: "card",
  stripePaymentIntentId: "pi_test_123456",
  stripeClientSecret: "pi_test_123456_secret_abc",
  description: "Payment for Order order_001",
  refundId: null,
  refundAmount: 0,
  metadata: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  // Restore default axios mock after each test (handles both user + order)
  axios.get = jest.fn().mockImplementation((url) => {
    if (url && url.includes("/orders/")) {
      return Promise.resolve({ data: mockOrder });
    }
    return Promise.resolve({ data: mockUser });
  });
});

// ==================== HEALTH CHECK ====================
describe("Health Check", () => {
  it("GET /health should return status UP", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("UP");
    expect(res.body.service).toBe("payment-service");
  });
});

// ==================== POST /api/payments ====================
describe("POST /api/payments", () => {
  it("should create a new payment successfully", async () => {
    const mock = mockPayment();
    Payment.mockImplementation(() => ({
      ...mock,
      save: jest.fn().mockResolvedValue(mock),
    }));

    const res = await request(app).post("/api/payments").send({
      orderId: "order_001",
      userId: "user_001",
      amount: 25.99,
      currency: "usd",
      description: "Test payment",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stripePaymentIntentId).toBe("pi_test_123456");
    expect(res.body.data.amount).toBe(25.99);
    expect(res.body.data.status).toBe("processing");
  });

  it("should return 400 if orderId is missing", async () => {
    const res = await request(app).post("/api/payments").send({
      userId: "user_001",
      amount: 25.99,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 if userId is missing", async () => {
    const res = await request(app).post("/api/payments").send({
      orderId: "order_001",
      amount: 25.99,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 if amount is missing", async () => {
    const res = await request(app).post("/api/payments").send({
      orderId: "order_001",
      userId: "user_001",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return 404 if userId does not exist in User Identity Service", async () => {
    const err = new Error("Not Found");
    err.response = { status: 404, data: { message: "User not found" } };
    axios.get = jest.fn().mockRejectedValue(err);

    const res = await request(app).post("/api/payments").send({
      orderId: "order_001",
      userId: "unknown_user",
      amount: 25.99,
    });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ==================== GET /api/payments ====================
describe("GET /api/payments", () => {
  it("should return all payments with pagination", async () => {
    const payments = [mockPayment(), mockPayment({ orderId: "order_002" })];

    Payment.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(payments),
        }),
      }),
    });
    Payment.countDocuments = jest.fn().mockResolvedValue(2);

    const res = await request(app).get("/api/payments");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination.total).toBe(2);
  });

  it("should filter by status", async () => {
    const payments = [mockPayment({ status: "succeeded" })];

    Payment.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(payments),
        }),
      }),
    });
    Payment.countDocuments = jest.fn().mockResolvedValue(1);

    const res = await request(app).get("/api/payments?status=succeeded");

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it("should filter by userId", async () => {
    const payments = [mockPayment()];

    Payment.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(payments),
        }),
      }),
    });
    Payment.countDocuments = jest.fn().mockResolvedValue(1);

    const res = await request(app).get("/api/payments?userId=user_001");

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });
});

// ==================== GET /api/payments/:id ====================
describe("GET /api/payments/:id", () => {
  it("should return a payment by ID", async () => {
    const mock = mockPayment();
    Payment.findById = jest.fn().mockResolvedValue(mock);

    const res = await request(app).get(`/api/payments/${mock._id}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderId).toBe("order_001");
  });

  it("should return 404 if payment not found", async () => {
    Payment.findById = jest.fn().mockResolvedValue(null);

    const res = await request(app).get("/api/payments/665f1a2b3c4d5e6f7a8b9c0d");

    expect(res.status).toBe(404);
  });
});

// ==================== GET /api/payments/order/:orderId ====================
describe("GET /api/payments/order/:orderId", () => {
  it("should return payment by order ID", async () => {
    const mock = mockPayment({ orderId: "order_test_100" });
    Payment.findOne = jest.fn().mockResolvedValue(mock);

    const res = await request(app).get("/api/payments/order/order_test_100");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderId).toBe("order_test_100");
  });

  it("should return 404 if order not found", async () => {
    Payment.findOne = jest.fn().mockResolvedValue(null);

    const res = await request(app).get("/api/payments/order/nonexistent_order");

    expect(res.status).toBe(404);
  });
});

// ==================== POST /api/payments/:id/confirm ====================
describe("POST /api/payments/:id/confirm", () => {
  it("should confirm a payment", async () => {
    const mock = mockPayment({ status: "processing" });
    Payment.findById = jest.fn().mockResolvedValue(mock);

    const res = await request(app)
      .post(`/api/payments/${mock._id}/confirm`)
      .send({ paymentMethodId: "pm_card_visa" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("succeeded");
  });

  it("should return 400 if paymentMethodId is missing", async () => {
    const res = await request(app)
      .post("/api/payments/665f1a2b3c4d5e6f7a8b9c0d/confirm")
      .send({});

    expect(res.status).toBe(400);
  });

  it("should return 404 if payment not found", async () => {
    Payment.findById = jest.fn().mockResolvedValue(null);

    const res = await request(app)
      .post("/api/payments/665f1a2b3c4d5e6f7a8b9c0d/confirm")
      .send({ paymentMethodId: "pm_card_visa" });

    expect(res.status).toBe(404);
  });

  it("should return 400 if payment already succeeded", async () => {
    const mock = mockPayment({ status: "succeeded" });
    Payment.findById = jest.fn().mockResolvedValue(mock);

    const res = await request(app)
      .post(`/api/payments/${mock._id}/confirm`)
      .send({ paymentMethodId: "pm_card_visa" });

    expect(res.status).toBe(400);
  });
});

// ==================== POST /api/payments/:id/refund ====================
describe("POST /api/payments/:id/refund", () => {
  it("should refund a succeeded payment (full)", async () => {
    const mock = mockPayment({ status: "succeeded" });
    Payment.findById = jest.fn().mockResolvedValue(mock);

    const res = await request(app)
      .post(`/api/payments/${mock._id}/refund`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("refunded");
    expect(res.body.data.refundAmount).toBe(25.99);
  });

  it("should refund a partial amount", async () => {
    const mock = mockPayment({ status: "succeeded" });
    Payment.findById = jest.fn().mockResolvedValue(mock);

    const res = await request(app)
      .post(`/api/payments/${mock._id}/refund`)
      .send({ amount: 10.0 });

    expect(res.status).toBe(200);
    expect(res.body.data.refundAmount).toBe(10.0);
  });

  it("should return 400 if payment is not succeeded", async () => {
    const mock = mockPayment({ status: "pending" });
    Payment.findById = jest.fn().mockResolvedValue(mock);

    const res = await request(app)
      .post(`/api/payments/${mock._id}/refund`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("should return 400 if refund amount exceeds payment", async () => {
    const mock = mockPayment({ status: "succeeded", amount: 10.0 });
    Payment.findById = jest.fn().mockResolvedValue(mock);

    const res = await request(app)
      .post(`/api/payments/${mock._id}/refund`)
      .send({ amount: 50.0 });

    expect(res.status).toBe(400);
  });
});

// ==================== GET /api/payments/:id/invoice ====================
describe("GET /api/payments/:id/invoice", () => {
  it("should generate an invoice", async () => {
    const mock = mockPayment({ status: "succeeded" });
    Payment.findById = jest.fn().mockResolvedValue(mock);

    const res = await request(app).get(`/api/payments/${mock._id}/invoice`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.invoiceNumber).toMatch(/^INV-/);
    expect(res.body.data.orderId).toBe("order_001");
    expect(res.body.data.amount).toBe(25.99);
    expect(res.body.data.currency).toBe("USD");
  });

  it("should return 404 if payment not found", async () => {
    Payment.findById = jest.fn().mockResolvedValue(null);

    const res = await request(app).get("/api/payments/665f1a2b3c4d5e6f7a8b9c0d/invoice");

    expect(res.status).toBe(404);
  });
});

// ==================== GET /api/payments/user/:userId/profile ====================
describe("GET /api/payments/user/:userId/profile (User Identity Service integration)", () => {
  it("should return user profile from User Identity Service", async () => {
    axios.get = jest.fn().mockResolvedValue({ data: mockUser });

    const res = await request(app).get("/api/payments/user/user_001/profile");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ _id: "user_001", name: "Susara Perera" });
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/api/users/user_001"),
      expect.any(Object)
    );
  });

  it("should return 404 if user does not exist", async () => {
    const err = new Error("Not Found");
    err.response = { status: 404, data: { message: "User not found" } };
    axios.get = jest.fn().mockRejectedValue(err);

    const res = await request(app).get("/api/payments/user/nonexistent_user/profile");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("should return 503 if User Identity Service is unreachable", async () => {
    const err = new Error("connect ECONNREFUSED");
    err.code = "ECONNREFUSED";
    axios.get = jest.fn().mockRejectedValue(err);

    const res = await request(app).get("/api/payments/user/user_001/profile");

    expect(res.status).toBe(503);
  });
});

// ==================== GET /api/payments/user/:userId ====================
describe("GET /api/payments/user/:userId (payments enriched with user profile)", () => {
  it("should return payments and user profile", async () => {
    const payments = [mockPayment(), mockPayment({ orderId: "order_002" })];
    axios.get = jest.fn().mockResolvedValue({ data: mockUser });

    Payment.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(payments),
        }),
      }),
    });
    Payment.countDocuments = jest.fn().mockResolvedValue(2);

    const res = await request(app).get("/api/payments/user/user_001");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({ _id: "user_001" });
    expect(res.body.data.payments.length).toBe(2);
    expect(res.body.pagination.total).toBe(2);
  });

  it("should still return payments even if User Identity Service is down", async () => {
    const payments = [mockPayment()];
    const networkErr = new Error("ECONNREFUSED");
    networkErr.code = "ECONNREFUSED";
    axios.get = jest.fn().mockRejectedValue(networkErr);

    Payment.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(payments),
        }),
      }),
    });
    Payment.countDocuments = jest.fn().mockResolvedValue(1);

    const res = await request(app).get("/api/payments/user/user_001");

    expect(res.status).toBe(200);
    expect(res.body.data.user).toBeNull();
    expect(res.body.data.payments.length).toBe(1);
  });
});

// ==================== POST /api/payments/order/:orderId/user/:userId ====================
describe("POST /api/payments/order/:orderId/user/:userId (Order Service Integration)", () => {
  it("should auto-create a payment by fetching amount from Order Service", async () => {
    const mock = mockPayment();
    Payment.mockImplementation(() => ({
      ...mock,
      save: jest.fn().mockResolvedValue(mock),
    }));

    const res = await request(app)
      .post("/api/payments/order/order_001/user/user_001")
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderId).toBe("order_001");
    expect(res.body.data.userId).toBe("user_001");
    expect(res.body.data.amount).toBe(25.99);
    expect(res.body.data.stripePaymentIntentId).toBe("pi_test_123456");
    // Verify Order Service was called
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/orders/order_001"),
      expect.any(Object)
    );
  });

  it("should accept optional currency and paymentMethod in body", async () => {
    const mock = mockPayment({ currency: "lkr" });
    Payment.mockImplementation(() => ({
      ...mock,
      save: jest.fn().mockResolvedValue(mock),
    }));

    const res = await request(app)
      .post("/api/payments/order/order_001/user/user_001")
      .send({ currency: "lkr", paymentMethod: "card" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it("should return 404 when Order Service returns order not found", async () => {
    const err = new Error("Not Found");
    err.response = { status: 404, data: { message: "Order not found" } };
    axios.get = jest.fn().mockImplementation((url) => {
      if (url && url.includes("/orders/")) return Promise.reject(err);
      return Promise.resolve({ data: mockUser });
    });

    const res = await request(app)
      .post("/api/payments/order/nonexistent_order/user/user_001")
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("should return 404 when User Identity Service returns user not found", async () => {
    const err = new Error("Not Found");
    err.response = { status: 404, data: { message: "User not found" } };
    axios.get = jest.fn().mockImplementation((url) => {
      if (url && url.includes("/orders/")) return Promise.resolve({ data: mockOrder });
      return Promise.reject(err);
    });

    const res = await request(app)
      .post("/api/payments/order/order_001/user/unknown_user")
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("should return 503 when Order Service is unreachable", async () => {
    const err = new Error("connect ECONNREFUSED");
    err.code = "ECONNREFUSED";
    axios.get = jest.fn().mockImplementation((url) => {
      if (url && url.includes("/orders/")) return Promise.reject(err);
      return Promise.resolve({ data: mockUser });
    });

    const res = await request(app)
      .post("/api/payments/order/order_001/user/user_001")
      .send({});

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });
});

// ==================== GET /api/payments/:id/details ====================
describe("GET /api/payments/:id/details (enriched with live order & user)", () => {
  it("should return payment enriched with order and user details", async () => {
    const mock = mockPayment();
    Payment.findById = jest.fn().mockResolvedValue(mock);

    const res = await request(app).get(`/api/payments/${mock._id}/details`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.payment).toBeDefined();
    expect(res.body.data.order).toBeDefined();
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.order._id).toBe("order_001");
    expect(res.body.data.user._id).toBe("user_001");
  });

  it("should return 404 if payment not found", async () => {
    Payment.findById = jest.fn().mockResolvedValue(null);

    const res = await request(app).get("/api/payments/665f1a2b3c4d5e6f7a8b9c0d/details");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("should return payment with null order if Order Service is down (graceful degradation)", async () => {
    const mock = mockPayment();
    Payment.findById = jest.fn().mockResolvedValue(mock);

    const networkErr = new Error("ECONNREFUSED");
    networkErr.code = "ECONNREFUSED";
    axios.get = jest.fn().mockImplementation((url) => {
      if (url && url.includes("/orders/")) return Promise.reject(networkErr);
      return Promise.resolve({ data: mockUser });
    });

    const res = await request(app).get(`/api/payments/${mock._id}/details`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // order should be null or fallback snapshot
    expect(res.body.data.payment).toBeDefined();
    expect(res.body.data.user).toBeDefined();
  });
});

// ==================== 404 Route ====================
describe("404 Route", () => {
  it("should return 404 for unknown routes", async () => {
    const res = await request(app).get("/api/unknown");
    expect(res.status).toBe(404);
  });
});
