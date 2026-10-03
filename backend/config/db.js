const mongoose = require("mongoose");

let cachedPromise = null;

const connectDB = async () => {
  // Reuse the existing connection on serverless warm starts.
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  if (!cachedPromise) {
    cachedPromise = mongoose
      .connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
      .then(() => {
        console.log("MongoDB connected successfully!");
        return mongoose.connection;
      })
      .catch((error) => {
        cachedPromise = null;
        console.error("MongoDB connection failed:", error.message);
        throw error;
      });
  }

  return cachedPromise;
};

module.exports = connectDB;
