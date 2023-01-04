import { MongooseError } from "mongoose";
import { IEditCustomerPayload } from "./../types/index.d";
import bcrypt from "bcrypt";
import User from "../models/user";
import Company from "../models/company";
import { ICustomerPayload } from "../types";
import authUser from "../middleware/authUser";
import { setCookie, deleteFields, checkActions } from "../utils";
import express, { NextFunction, Request, Response } from "express";

// Initialize router
const router = express.Router();

// Register customer
router.post(
  "/register-customer",
  async (req: Request, res: Response, next: NextFunction) => {
    // Destructure data from req
    const { firstName, lastName, email, password }: ICustomerPayload = req.body;

    // If a value isn't provided
    if (!firstName || !lastName || !email || !password) {
      res.status(400);
      throw new Error("Please fill all the fields");
    }

    // Get company code from customer's email
    const companyCode = email.split("@")[1].split(".")[0];

    try {
      // Check if company exist
      const company = await Company.findOne({ code: companyCode })
        .lean()
        .orFail();

      try {
        // Create salt
        const salt = await bcrypt.genSalt(10);

        try {
          // Hash password
          const hashedPassword = await bcrypt.hash(password, salt);

          try {
            // Create customer and populate the company
            const customer = await User.create({
              firstName,
              lastName,
              email,
              status: "ACTIVE",
              role: "CUSTOMER",
              company: company._id,
              password: hashedPassword,
            });

            try {
              // Populate company
              const customerWithCompany = await customer.populate(
                "company",
                "-__v -updatedAt"
              );

              // If customer is created successfully
              if (customerWithCompany) {
                // Convert customer document to object
                const customer = customerWithCompany.toObject();

                // Generate jwt token and set
                // cookie to the response header
                setCookie(res, customer._id);

                // Delete fields
                deleteFields(customer, ["createdAt", "password"]);

                // Send the data with response
                res.status(201).json(customer);
              }
            } catch (err) {
              // If company isn't populated successfully
              throw err;
            }
          } catch (err) {
            // If user isn't created successfully
            throw err;
          }
        } catch (err) {
          // If password has isn't create successfully
          throw err;
        }
      } catch (err) {
        // If salt isn't create successfully
        throw err;
      }
    } catch (err) {
      // // If company doesn't exist
      throw err;
    }
  }
);

// Get all customers
router.get("", authUser, async (req: Request, res: Response) => {
  // If there is a user
  if (req.user) {
    // Destructure data from req
    const { role } = req.user;

    // If role is admin
    if (role === "ADMIN") {
      try {
        // Get all customers
        const customers = await User.find({ role: "CUSTOMER" })
          .select("-__v -updatedAt -password -role")
          .populate("company", "address name")
          .orFail();

        // Send the customers data with response
        res.status(200).json(customers);
      } catch (err) {
        // If customers aren't fetched successfully
        throw err;
      }
    } else {
      // If role isn't admin
      res.status(401);
      throw new Error("Not authorized");
    }
  } else {
    // If there is no user
    res.status(401);
    throw new Error("Not authorized");
  }
});

// Edit customer details
router.patch(
  "/:customerId/update-customer-details",
  authUser,
  async (req: Request, res: Response) => {
    // Destructure data from req
    const { customerId } = req.params;
    const { firstName, lastName, email }: IEditCustomerPayload = req.body;

    // If all the fields aren't provided
    if (!customerId || !firstName || !lastName || !email) {
      res.status(400);
      throw new Error("Please provide all the fields");
    }

    // If there is a user
    if (req.user) {
      // Destructure data from req
      const { role } = req.user;

      // If role is admin
      if (role === "ADMIN") {
        try {
          // Get all customers
          const updatedCustomer = await User.findOneAndUpdate(
            { _id: customerId },
            {
              firstName,
              lastName,
              email,
            },
            { returnDocument: "after" }
          )
            .lean()
            .orFail();

          // Send the updated customer data with response
          res.status(200).json(updatedCustomer);
        } catch (err) {
          // If customer isn't updated successfully
          throw err;
        }
      } else {
        // If role isn't admin
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

// Change customer status
router.patch(
  "/:customerId/change-customer-status",
  authUser,
  async (req: Request, res: Response) => {
    // Destructure data from request
    const { action } = req.body;
    const { customerId } = req.params;

    // If all the fields aren't provided
    if (!customerId || !action) {
      res.status(400);
      throw new Error("Please provide all the fields");
    }

    // Check actions validity
    checkActions(undefined, action, res);

    // If there is a user
    if (req.user) {
      // Destructure data from req
      const { role } = req.user;

      // If role is admin
      if (role === "ADMIN") {
        try {
          // Get all customers
          const updatedCustomer = await User.findOneAndUpdate(
            { _id: customerId },
            {
              status: action === "Archive" ? "ARCHIVED" : "ACTIVE",
            },
            { returnDocument: "after" }
          )
            .select("-__v -password -updatedAt -role")
            .populate("company", "name address")
            .lean()
            .orFail();

          // Send the updated customer data with response
          res.status(201).json(updatedCustomer);
        } catch (err) {
          // If customer isn't updated successfully
          throw err;
        }
      } else {
        // If role isn't admin
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

export default router;
