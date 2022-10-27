import { IFavorite } from "../types";
import Favorite from "../models/favorite";
import authUser from "../middleware/authUser";
import express, { Request, Response } from "express";

// Initialize router
const router = express.Router();

// Add a favorite
router.post("/add", authUser, async (req: Request, res: Response) => {
  // Destructure data from req
  const { restaurantId, itemId } = req.body;

  // If all the fields aren't provided
  if (!restaurantId || !itemId) {
    res.status(400);
    throw new Error("Please provide all the fields");
  }

  // Check if there is an user
  if (req.user) {
    // Destructure data from req
    const { role, _id } = req.user;

    // If role is customer
    if (role === "CUSTOMER") {
      // Add favorite to db and populate the restaurant
      const response = await (
        await Favorite.create({
          customerId: _id,
          itemId: itemId,
          restaurant: restaurantId,
        })
      ).populate<{ restaurant: IFavorite }>("restaurant", "_id name items");

      // If favorite is created successfully
      if (response) {
        // Find the item
        const item = response.restaurant.items.find(
          (item) => String(item._id) === String(response.itemId)
        );

        // If item is found successfully
        if (item) {
          // Create favorite
          const favorite = {
            _id: response._id,
            itemId: item._id,
            itemName: item.name,
            customerId: response.customerId,
            restaurantId: response.restaurant._id,
            restaurantName: response.restaurant.name,
          };

          // Send data with response
          res.status(201).json(favorite);
        } else {
          // If item isn't found
          res.status(500);
          throw new Error("Something went wrong");
        }
      } else {
        // If favorite isn't created successfully
        res.status(500);
        throw new Error("Something went wrong");
      }
    } else {
      // If role isn't customer
      res.status(401);
      throw new Error("Not authorized");
    }
  } else {
    // If there is no user
    res.status(401);
    throw new Error("Not authorized");
  }
});

// Remove a favorite
router.delete(
  "/:favoriteId/remove",
  authUser,
  async (req: Request, res: Response) => {
    // Destructure data from req
    const { favoriteId } = req.params;

    // Check if there is an user
    if (req.user) {
      // Destructure data from req
      const { role } = req.user;

      // If role is customer
      if (role === "CUSTOMER") {
        // Delete the favorite
        const removedFavorite = await Favorite.findByIdAndDelete({
          _id: favoriteId,
        });

        // If favorite is deleted successfully
        if (removedFavorite) {
          // Send data with response
          res.status(200).json({ message: "Favorite removed" });
        } else {
          // If favorite isn't deleted successfully
          res.status(500);
          throw new Error("Something went wrong");
        }
      } else {
        // If role isn't customer
        res.status(401);
        throw new Error("Not authorized");
      }
    } else {
      // If there is no user
      res.status(401);
      throw new Error("Not authorized");
    }
  }
);

// Get all favorite
router.get("/me", authUser, async (req: Request, res: Response) => {
  // Check if there is an user
  if (req.user) {
    // Destructure data from req
    const { role, _id } = req.user;

    // If role is customer
    if (role === "CUSTOMER") {
      // Find the favorites
      const response = await Favorite.find({
        customerId: _id,
      }).populate<{ restaurant: IFavorite }>("restaurant", "_id name items");

      // If favorites are found successfully
      if (response) {
        // Create favorites
        const favorites = response.map((favorite) => {
          // Get the item
          const item = favorite.restaurant.items.find(
            (item) => String(item._id) === String(favorite.itemId)
          );

          // If there is an item
          if (item) {
            return {
              _id: favorite._id,
              itemId: item._id,
              itemName: item.name,
              customerId: favorite.customerId,
              restaurantId: favorite.restaurant._id,
              restaurantName: favorite.restaurant.name,
            };
          }
        });

        // Send the data with response
        res.status(200).json(favorites);
      } else {
        // If favorites aren't found successfully
        res.status(500);
        throw new Error("Something went wrong");
      }
    } else {
      // If role isn't customer
      res.status(401);
      throw new Error("Not authorized");
    }
  } else {
    // If there is no user
    res.status(401);
    throw new Error("Not authorized");
  }
});

export default router;
