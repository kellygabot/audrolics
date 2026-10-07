import { Schema, model } from "mongoose";
const loginAttemptSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  windowStart: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});
loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const LoginAttempt = model("LoginAttempt", loginAttemptSchema);
