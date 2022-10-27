import { Schema, model } from "mongoose";

interface IRestaurantSchema {
  name: string;
  address: string;
  schedules: Date[];
  items: {
    name: string;
    tags: string;
    price: number;
    description: string;
  }[];
}

const restaurantSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Please provide a name"],
    },
    address: {
      type: String,
      required: [true, "Please provide an email"],
    },
    schedules: [
      {
        type: Date,
      },
    ],
    items: [
      {
        name: {
          type: String,
          required: [true, "Please provide item name"],
        },
        tags: {
          type: String,
          required: [true, "Please provide item tags"],
        },
        price: {
          type: Number,
          required: [true, "Please provide item price"],
        },
        description: {
          type: String,
          required: [true, "Please provide item description"],
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export default model("Restaurant", restaurantSchema);
