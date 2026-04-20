const axios = require("axios");

const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "https://order-service-production-5615.up.railway.app";

/**
 * Fetches a single order by ID from the Order Service.
 * Endpoint: GET /orders/:id
 *
 * @param {string} orderId - The order's ID
 * @returns {Promise<object>} Order data object
 * @throws {object} { status, message } on failure
 */
const getOrderById = async (orderId) => {
  try {
    const response = await axios.get(`${ORDER_SERVICE_URL}/orders/${orderId}`, {
      timeout: 8000,
      headers: { "Content-Type": "application/json" },
    });

    // Normalise various response shapes: { data: { order } }, { data }, { order }, or flat
    const payload = response.data;
    const order = payload?.data?.order || payload?.data || payload?.order || payload;

    // Accept both MongoDB _id and simple numeric id
    if (!order || (order._id === undefined && order.id === undefined)) {
      throw { status: 404, message: `Order not found: ${orderId}` };
    }

    return order;
  } catch (error) {
    if (error.status) throw error; // already shaped

    if (error.response) {
      const status = error.response.status;
      if (status === 404) {
        throw { status: 404, message: `Order not found: ${orderId}` };
      }
      throw {
        status: 502,
        message: `Order Service error: ${error.response.data?.message || error.message}`,
      };
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw { status: 503, message: "Order Service timed out" };
    }

    throw { status: 503, message: `Cannot reach Order Service: ${error.message}` };
  }
};

/**
 * Extracts the payable amount from an order object.
 * Checks common field names used by order services:
 *   totalAmount → totalPrice → total → price → amount
 *
 * @param {object} order
 * @returns {number} Amount in dollars
 * @throws {object} if no amount can be determined
 */
const extractOrderAmount = (order) => {
  const raw =
    order.totalAmount ??
    order.totalPrice ??
    order.total ??
    order.price ??
    order.amount;

  if (raw === undefined || raw === null) {
    throw { status: 422, message: "Order does not contain a payable amount" };
  }

  const amount = parseFloat(raw);
  if (isNaN(amount) || amount <= 0) {
    throw { status: 422, message: `Invalid order amount: ${raw}` };
  }

  return amount;
};

/**
 * Validates that an order exists and is in a payable state.
 *
 * @param {string} orderId
 * @returns {Promise<object>} { order, amount }
 */
const validateOrder = async (orderId) => {
  const order = await getOrderById(orderId);

  // Reject if the order is already paid or cancelled
  const blockedStatuses = ["paid", "completed", "cancelled", "canceled"];
  if (blockedStatuses.includes((order.status || "").toLowerCase())) {
    throw {
      status: 409,
      message: `Order ${orderId} is already ${order.status} and cannot be paid`,
    };
  }

  const amount = extractOrderAmount(order);
  return { order, amount };
};

module.exports = { getOrderById, extractOrderAmount, validateOrder };
