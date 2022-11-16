import { IOrderSchema } from "../types";
import { Schema, model } from "mongoose";

const orderSchema = new Schema<IOrderSchema>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      required: [true, "Please provide customer id"],
    },
    customerName: {
      type: String,
      required: [true, "Please provide customer name"],
    },
    customerEmail: {
      type: String,
      required: [true, "Please provide customer email"],
    },
    deliveryAddress: {
      type: String,
      required: [true, "Please provide delivery address"],
    },
    restaurantId: {
      type: Schema.Types.ObjectId,
      required: [true, "Please provide restaurant id"],
    },
    restaurantName: {
      type: String,
      required: [true, "Please provide restaurant name"],
    },
    companyName: {
      type: String,
      required: [true, "Please provide company name"],
    },
    deliveryDate: {
      type: Date,
      required: [true, "Please provide delivery date"],
    },
    status: {
      type: String,
      enum: ["PROCESSING", "DELIVERED"],
    },
    hasReviewed: {
      type: Boolean,
      default: false,
    },
    item: {
      _id: {
        type: Schema.Types.ObjectId,
        required: [true, "Please provide an item id"],
      },
      name: {
        type: String,
        required: [true, "Please provide the item name"],
      },
      quantity: {
        type: Number,
        required: [true, "Please provide item quantity"],
      },
      total: {
        type: Number,
        required: [true, "Please provide a total price"],
      },
    },
  },
  {
    timestamps: true,
  }
);

export default model("Order", orderSchema);