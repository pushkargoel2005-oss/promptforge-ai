const app = require("../server");
const connectDB = require("../config/db");

let dbConnection;

module.exports = async (req, res) => {
  try {
    if (!process.env.MONGODB_URI) {
      return res.status(500).json({
        message: "Database configuration is missing.",
      });
    }

    if (!dbConnection) {
      dbConnection = connectDB().catch((error) => {
        dbConnection = null;
        throw error;
      });
    }

    await dbConnection;
    return app(req, res);
  } catch (error) {
    console.error("Backend request failed:", error.message);
    return res.status(500).json({
      message: "Backend initialization failed.",
    });
  }
};
