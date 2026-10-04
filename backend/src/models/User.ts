import { Schema, model, type Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
  deletedAt: Date | null;
  failedLogins: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["USER", "ADMIN"], default: "USER", required: true },
  status: { type: String, enum: ["ACTIVE", "SUSPENDED"], default: "ACTIVE", required: true },
  deletedAt: { type: Date, default: null },
  failedLogins: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
}, { timestamps: true });

userSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: "ADMIN" } });

export const User = model<IUser>("User", userSchema);
