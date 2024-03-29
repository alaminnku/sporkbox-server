import bcrypt from 'bcrypt';
import User from '../models/user';
import { Router } from 'express';
import { upload } from './../config/multer';
import Restaurant from '../models/restaurant';
import authUser from '../middleware/authUser';
import { deleteImage, uploadImage } from '../config/s3';
import { Address, GenericUser, RestaurantSchema } from '../types';
import { setCookie, deleteFields, checkActions, resizeImage } from '../utils';

// Types
interface VendorPayload extends GenericUser, Address {
  password?: string;
  logo?: string;
  restaurantName: string;
}

interface VendorStatusPayload {
  action: string;
}

// Initialize router
const router = Router();

// Register a vendor and a restaurant
router.post('/register-vendor', upload, async (req, res) => {
  // Destructure data from req
  const {
    zip,
    city,
    state,
    email,
    lastName,
    password,
    firstName,
    addressLine1,
    addressLine2,
    restaurantName,
  }: VendorPayload = req.body;

  // If a value isn't provided
  if (
    !zip ||
    !city ||
    !email ||
    !state ||
    !password ||
    !lastName ||
    !firstName ||
    !addressLine1 ||
    !restaurantName
  ) {
    // Log error
    console.log('Please fill all the fields');

    res.status(400);
    throw new Error('Please fill all the fields');
  }

  // If no logo is provided
  if (!req.file) {
    // Log error
    console.log('Please provide a logo');

    res.status(400);
    throw new Error('Please provide a logo');
  }

  try {
    // Check if vendor exists
    const vendorExists = await User.findOne({ email }).lean();

    // Throw error if vendor already exists
    if (vendorExists) {
      // Log error
      console.log('Vendor already exists');

      res.status(400);
      throw new Error('Vendor already exists');
    }

    // Destructure file data
    const { buffer, mimetype } = req.file;

    // Resize the logo
    const modifiedBuffer = await resizeImage(res, buffer, 800, 500);

    // Upload logo and get the URL
    const logoURL = await uploadImage(res, modifiedBuffer, mimetype);

    try {
      // Create the restaurant
      const restaurant = await Restaurant.create({
        name: restaurantName,
        logo: logoURL,
        address: {
          city,
          state,
          zip,
          addressLine1,
          addressLine2,
        },
      });

      // If restaurant is created successfully
      if (restaurant) {
        try {
          // Create salt
          const salt = await bcrypt.genSalt(10);

          try {
            // Hash password
            const hashedPassword = await bcrypt.hash(password, salt);

            try {
              // Create vendor
              const response = await User.create({
                firstName,
                lastName,
                email,
                role: 'VENDOR',
                status: 'ARCHIVED',
                password: hashedPassword,
                restaurant: restaurant.id,
              });

              try {
                // Populate restaurant
                const vendorWithRestaurant = await response.populate(
                  'restaurant',
                  '-__v -createdAt -updatedAt'
                );

                // If vendor is created successfully
                if (vendorWithRestaurant) {
                  // Create vendor object
                  const vendor = vendorWithRestaurant.toObject();

                  // Generate jwt token and set
                  // cookie to the response header
                  setCookie(res, vendor._id);

                  // Delete fields
                  deleteFields(vendor, ['createdAt', 'password']);

                  // Send the vendor with response
                  res.status(200).json(vendor);
                }
              } catch (err) {
                // If failed to populate restaurant
                console.log(err);

                throw err;
              }
            } catch (err) {
              // If vendor isn't created
              console.log(err);

              throw err;
            }
          } catch (err) {
            // If password hashing isn't  successful
            console.log(err);

            throw err;
          }
        } catch (err) {
          // If salt isn't created
          console.log(err);

          throw err;
        }
      }
    } catch (err) {
      // If restaurant isn't created
      console.log(err);

      throw err;
    }
  } catch (err) {
    // If vendor isn't found
    console.log(err);

    throw err;
  }
});

// Add a vendor and a restaurant
router.post('/add-vendor', authUser, upload, async (req, res) => {
  if (req.user) {
    // Destructure data from req
    const { role } = req.user;

    if (role === 'ADMIN') {
      // Destructure data from req
      const {
        zip,
        city,
        state,
        email,
        password,
        lastName,
        firstName,
        addressLine1,
        addressLine2,
        restaurantName,
      }: VendorPayload = req.body;

      // If a value isn't provided
      if (
        !zip ||
        !city ||
        !state ||
        !email ||
        !lastName ||
        !password ||
        !firstName ||
        !addressLine1 ||
        !restaurantName
      ) {
        // Log error
        console.log('Please provide all the fields');

        res.status(400);
        throw new Error('Please fill all the fields');
      }

      // If a logo isn't provided
      if (!req.file) {
        // Log error
        console.log('Please provide a logo');

        res.status(400);
        throw new Error('Please provide a logo');
      }

      try {
        // Check if vendor exists
        const vendorExists = await User.findOne({ email }).lean();

        // Throw error if vendor already exists
        if (vendorExists) {
          // Log error
          console.log('Vendor already exists');

          res.status(400);
          throw new Error('Vendor already exists');
        }

        // Destructure file data
        const { buffer, mimetype } = req.file;

        // Resize the logo
        const modifiedBuffer = await resizeImage(res, buffer, 800, 500);

        // Upload logo and get the URL
        const logoURL = await uploadImage(res, modifiedBuffer, mimetype);

        try {
          // Create the restaurant
          const restaurant = await Restaurant.create({
            name: restaurantName,
            logo: logoURL,
            address: {
              city,
              state,
              zip,
              addressLine1,
              addressLine2,
            },
          });

          // If restaurant is created successfully
          if (restaurant) {
            try {
              // Create salt
              const salt = await bcrypt.genSalt(10);

              try {
                // Hash password
                const hashedPassword = await bcrypt.hash(password, salt);

                try {
                  // Create vendor and populate the restaurant
                  const response = await User.create({
                    firstName,
                    lastName,
                    email,
                    role: 'VENDOR',
                    status: 'ARCHIVED',
                    password: hashedPassword,
                    restaurant: restaurant.id,
                  });

                  try {
                    // Populate restaurant
                    const vendorWithRestaurant = await response.populate(
                      'restaurant',
                      '-__v -updatedAt'
                    );

                    // If vendor is created successfully
                    if (vendorWithRestaurant) {
                      // Convert document to object
                      const vendor = vendorWithRestaurant.toObject();

                      // Delete fields
                      deleteFields(vendor, ['createdAt', 'password']);

                      // Return the vendor
                      res.status(200).json(vendor);
                    }
                  } catch (err) {
                    // If restaurant isn't populated
                    console.log(err);

                    throw err;
                  }
                } catch (err) {
                  // If vendor isn't created
                  console.log(err);

                  throw err;
                }
              } catch (err) {
                // If password hashing isn't successful
                console.log(err);

                throw err;
              }
            } catch (err) {
              // If slat isn't created
              console.log(err);

              throw err;
            }
          }
        } catch (err) {
          // If restaurant isn't created
          console.log(err);

          throw err;
        }
      } catch (err) {
        // If vendor isn't found
        console.log(err);

        throw err;
      }
    } else {
      // If role isn't admin
      console.log('Not authorized');

      res.status(403);
      throw new Error('Not authorized');
    }
  }
});

// Get all the vendors
router.get('/:limit', authUser, async (req, res) => {
  // Get the role from req
  const { limit } = req.params;

  // Check if there is an user
  if (req.user) {
    // Destructure data from req
    const { role } = req.user;

    if (role === 'ADMIN') {
      try {
        // Fetch 20 latest vendors with restaurant data
        const vendors = await User.find({ role: 'VENDOR' })
          .limit(+limit)
          .select('-__v -password -shifts -companies -createdAt -updatedAt')
          .sort({ createdAt: -1 })
          .populate<{ restaurant: RestaurantSchema }>(
            'restaurant',
            '-__v -updatedAt'
          );

        // Sort restaurant items
        vendors.forEach((vendor) =>
          vendor.restaurant.items.sort((a, b) => a.index - b.index)
        );

        // Return the vendors
        res.status(200).json(vendors);
      } catch (err) {
        // If vendors aren't fetched successfully
        console.log(err);

        throw err;
      }
    } else {
      // If role isn't admin
      console.log('Not authorized');

      res.status(403);
      throw new Error('Not authorized');
    }
  }
});

// Update a vendor
router.patch(
  '/:vendorId/update-vendor-details',
  authUser,
  upload,
  async (req, res) => {
    if (req.user) {
      // Destructure data from req
      const { role } = req.user;

      if (role === 'ADMIN') {
        // Destructure data from req
        const { vendorId } = req.params;
        const {
          zip,
          city,
          logo,
          email,
          state,
          firstName,
          lastName,
          addressLine1,
          addressLine2,
          restaurantName,
        }: VendorPayload = req.body;

        // If a value isn't provided
        if (
          !zip ||
          !city ||
          !email ||
          !state ||
          !lastName ||
          !vendorId ||
          !firstName ||
          !addressLine1 ||
          !restaurantName
        ) {
          // Log error
          console.log('Please provide all the fields');

          res.status(400);
          throw new Error('Please fill all the fields');
        }

        // Create logo URL
        let logoURL;

        // If a new file is provided and an image already exists
        if (req.file && logo) {
          // Create name
          const name = logo.split('/')[logo.split('/').length - 1];

          // Delete image from s3
          await deleteImage(res, name);

          // Destructure file data
          const { buffer, mimetype } = req.file;

          // Resize the logo
          const modifiedBuffer = await resizeImage(res, buffer, 800, 500);

          // Upload logo and get the URL
          logoURL = await uploadImage(res, modifiedBuffer, mimetype);
        }

        try {
          // Find and update the vendor
          const updatedVendor = await User.findOneAndUpdate(
            { _id: vendorId },
            {
              email,
              lastName,
              firstName,
            },
            { returnDocument: 'after' }
          )
            .lean()
            .orFail();

          try {
            // Find and update the restaurant
            const updatedRestaurant = await Restaurant.findOneAndUpdate(
              { _id: updatedVendor.restaurant._id },
              {
                name: restaurantName,
                logo: logoURL,
                address: {
                  city,
                  state,
                  zip,
                  addressLine1,
                  addressLine2,
                },
              },
              {
                returnDocument: 'after',
              }
            )
              .lean()
              .orFail();

            // Delete fields
            deleteFields(updatedRestaurant, ['createdAt']);
            deleteFields(updatedVendor, ['createdAt', 'password']);

            // Create updated vendor with restaurant
            const updatedVendorAndRestaurant = {
              ...updatedVendor,
              restaurant: updatedRestaurant,
            };

            // Send the data with response
            res.status(201).json(updatedVendorAndRestaurant);
          } catch (err) {
            // If restaurant isn't updated successfully
            console.log(err);

            throw err;
          }
        } catch (err) {
          // If vendor isn't updated successfully
          console.log(err);

          throw err;
        }
      } else {
        // If role isn't admin
        console.log('Not authorized');

        res.status(403);
        throw new Error('Not authorized');
      }
    }
  }
);

// Change vendor status
router.patch('/:vendorId/change-vendor-status', authUser, async (req, res) => {
  if (req.user) {
    // Destructure data from req
    const { role } = req.user;

    if (role === 'ADMIN') {
      // Get the role from req
      const { vendorId } = req.params;
      const { action }: VendorStatusPayload = req.body;

      // If action or restaurant id aren't provided
      if (!vendorId || !action) {
        // Log error
        console.log('Please provide all the fields');

        res.status(400);
        throw new Error('Please provide all the fields');
      }

      // Check actions validity
      checkActions(undefined, action, res);

      try {
        // Find the vendor and update the status
        const updatedVendor = await User.findOneAndUpdate(
          { _id: vendorId },
          {
            status: action === 'Archive' ? 'ARCHIVED' : 'ACTIVE',
          },
          {
            returnDocument: 'after',
          }
        )
          .select('-__v -password -updatedAt')
          .populate('restaurant', '-__v -updatedAt')
          .lean()
          .orFail();

        // Return the updated restaurant
        res.status(200).json(updatedVendor);
      } catch (err) {
        // If vendor isn't updated successfully
        console.log(err);

        throw err;
      }
    } else {
      // If role isn't admin
      console.log('Not authorized');

      res.status(403);
      throw new Error('Not authorized');
    }
  }
});

export default router;
