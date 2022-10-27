import { IUserSchema } from "../types";
import { Schema, model } from "mongoose";

const userSchema = new Schema<IUserSchema>(
  {
    name: {
      type: String,
      required: [true, "Please add a name"],
    },
    email: {
      type: String,
      unique: true,
      lowercase: true,
      required: [true, "Please add an email"],
    },
    role: {
      type: String,
      enum: ["ADMIN", "VENDOR", "CUSTOMER"],
      required: [true, "Please provide a role"],
    },
    password: {
      type: String,
      required: [true, "Please add a password"],
    },
    status: {
      type: String,
      enum: ["APPROVED", "PENDING"],
    },
    company: {
      type: Schema.Types.ObjectId,
      ref: "Company",
    },
    restaurant: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
    },
  },
  {
    timestamps: true,
  }
);

export default model("User", userSchema);
