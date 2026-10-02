const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [60, "Name must be 60 characters or fewer"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      maxlength: [160, "Email must be 160 characters or fewer"],
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address"],
      // Uniqueness enforced by the index below (case-insensitive via lowercase).
    },
    // bcrypt hash only. Plain-text passwords are never stored or returned.
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });

// Safe public shape — passwordHash is select:false AND stripped here.
userSchema.methods.toClient = function toClient() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
