const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  calculationsUsed: { type: Number, default: 0 },
  subscriptionActive: { type: Boolean, default: false },
  subscriptionExpires: { type: Date }
});

module.exports = mongoose.model("User", userSchema);
