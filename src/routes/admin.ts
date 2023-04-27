import bcrypt from "bcrypt";
import User from "../models/user";
import { deleteFields } from "../utils";
import authUser from "../middleware/authUser";
import express, { Request, Response } from "express";

// Initialize router
const router = express.Router();

// Add admin
router.post("/add-admin", authUser, async (req: Request, res: Response) => {
  if (req.user) {
    // Destructure data from req
    const { role } = req.user;

    if (role === "ADMIN") {
      // Destructure data from req
      const { firstName, lastName, email, password } = req.body;

      // If all the fields aren't provided
      if (!firstName || !lastName || !email || !password) {
        res.status(400);
        throw new Error("Please provide all the fields");
      }

      try {
        // Create salt
        const salt = await bcrypt.genSalt(10);

        try {
          // Hash password
          const hashedPassword = await bcrypt.hash(password, salt);

          try {
            // Create admin
            const response = await User.create({
              firstName,
              lastName,
              email,
              status: "ACTIVE",
              role: "ADMIN",
              password: hashedPassword,
            });

            // Convert customer document to object
            const admin = response.toObject();

            // Delete fields
            deleteFields(admin, ["createdAt", "password"]);

            // Send the data with response
            res.status(201).json(admin);
          } catch (err) {
            // If admin isn't created
            console.log(err);

            throw err;
          }
        } catch (err) {
          // If password hash isn't created
          console.log(err);

          throw err;
        }
      } catch (err) {
        // If salt isn't created
        console.log(err);

        throw err;
      }
    } else {
      // If role isn't admin
      res.status(403);
      throw new Error("Not authorized");
    }
  }
});

export default router;
