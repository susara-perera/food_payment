const axios = require("axios");

const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL || "https://user-identity-service.onrender.com";

/**
 * Fetches a user's public profile from the User Identity Service.
 * Endpoint: GET /api/users/:id
 *
 * @param {string} userId - The user's ID
 * @returns {Promise<object>} User data object
 * @throws {object} { status, message } on failure
 */
const getUserById = async (userId) => {
  try {
    const response = await axios.get(`${USER_SERVICE_URL}/api/users/${userId}`, {
      timeout: 5000, // 5-second timeout
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Support both direct data and nested { data: { user } } shapes
    const payload = response.data;
    return payload?.data?.user || payload?.data || payload?.user || payload;
  } catch (error) {
    if (error.response) {
      // The user service responded with a non-2xx status
      const status = error.response.status;
      if (status === 404) {
        throw { status: 404, message: `User not found: ${userId}` };
      }
      throw {
        status: 502,
        message: `User Identity Service error: ${error.response.data?.message || error.message}`,
      };
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw { status: 503, message: "User Identity Service timed out" };
    }

    throw { status: 503, message: `Cannot reach User Identity Service: ${error.message}` };
  }
};

/**
 * Validates that a user exists in the User Identity Service.
 * Returns the user object on success, or throws on failure.
 *
 * @param {string} userId
 * @returns {Promise<object>} User data
 */
const validateUser = async (userId) => {
  return getUserById(userId);
};

module.exports = { getUserById, validateUser };
