import User from '../models/user';
import { Router } from 'express';
import Order from '../models/order';
import Company from '../models/company';
import authUser from '../middleware/authUser';
import { checkActions, checkShift, deleteFields } from '../utils';
import { Address, CompanyDetails, StatusChangePayload } from '../types';

// Types
interface CompanyPayload extends CompanyDetails, Address {}

// Initialize router
const router = Router();

// Add a company
router.post('/add-company', authUser, async (req, res) => {
  if (req.user) {
    // Destructure data from req
    const { role } = req.user;

    if (role === 'ADMIN') {
      // Destructure body data
      const {
        name,
        code,
        zip,
        city,
        state,
        shift,
        website,
        shiftBudget,
        addressLine1,
        addressLine2,
      }: CompanyPayload = req.body;

      // If all the fields aren't provided
      if (
        !name ||
        !code ||
        !city ||
        !state ||
        !zip ||
        !shift ||
        !website ||
        !shiftBudget ||
        !addressLine1
      ) {
        // Log error
        console.log('Please provide all the fields');

        res.status(400);
        throw new Error('Please provide all the fields');
      }

      // Check shift
      checkShift(res, shift);

      try {
        // Check if a company exists with the provided shift
        const companyExist = await Company.findOne({ code, shift });

        // Throw error if a company with the same shift exists
        if (companyExist) {
          // Log error
          console.log('A company with a same shift already exists');

          res.status(400);
          throw new Error('A company with a same shift already exists');
        }

        try {
          // Create a new company
          const response = await Company.create({
            name,
            code,
            shift,
            website,
            address: {
              city,
              state,
              zip,
              addressLine1,
              addressLine2,
            },
            shiftBudget,
            status: 'ACTIVE',
          });

          try {
            // Convert company document to object
            const company = response.toObject();

            // Delete fields
            deleteFields(company);

            // Destructure the company
            const { website, createdAt, ...rest } = company;

            // Add the new shift to all users
            await User.updateMany(
              { 'companies.code': code },
              {
                $push: {
                  shifts: company.shift,
                  companies: { ...rest, status: 'ARCHIVED' },
                },
              }
            );

            // Send the company with response
            res.status(200).json(company);
          } catch (err) {
            // If users aren't updated successfully
            console.log(err);

            throw err;
          }
        } catch (err) {
          // If company isn't created successfully
          console.log(err);

          throw err;
        }
      } catch (err) {
        // If company isn't fetched successfully
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

// Get all companies
router.get('/', authUser, async (req, res) => {
  if (req.user) {
    // Destructure data from req
    const { role } = req.user;

    if (role === 'ADMIN') {
      try {
        // Create a new company
        const companies = await Company.find()
          .select('-__v -updatedAt')
          .sort({ createdAt: -1 });

        // Send the companies with response
        res.status(201).json(companies);
      } catch (err) {
        // If companies aren't fetched successfully
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

// Update company details
router.patch(
  '/:companyId/update-company-details',
  authUser,
  async (req, res) => {
    if (req.user) {
      // Destructure data from req
      const { role } = req.user;

      if (role === 'ADMIN') {
        // Destructure data from req
        const { companyId } = req.params;
        const {
          name,
          city,
          zip,
          state,
          website,
          shiftBudget,
          addressLine1,
          addressLine2,
        }: CompanyPayload = req.body;

        // If all the fields aren't provided
        if (
          !zip ||
          !name ||
          !city ||
          !state ||
          !website ||
          !companyId ||
          !shiftBudget ||
          !addressLine1
        ) {
          // Log error
          console.log('Please provide all the fields');

          res.status(400);
          throw new Error('Please provide all the fields');
        }

        try {
          // Find and update the company
          const updatedCompany = await Company.findOneAndUpdate(
            { _id: companyId },
            {
              name,
              website,
              address: {
                zip,
                city,
                state,
                addressLine1,
                addressLine2,
              },
              shiftBudget,
            },
            { returnDocument: 'after' }
          )
            .lean()
            .orFail();

          try {
            // Update all users's company
            await User.updateMany(
              { 'companies._id': companyId },
              {
                $set: {
                  'companies.$.name': updatedCompany.name,
                  'companies.$.address': updatedCompany.address,
                  'companies.$.shiftBudget': updatedCompany.shiftBudget,
                },
              }
            );

            // Delete fields
            deleteFields(updatedCompany);

            // Send the updated company with response
            res.status(201).json(updatedCompany);
          } catch (err) {
            // If users aren't updated successfully
            console.log(err);

            throw err;
          }
        } catch (err) {
          // If company isn't updated successfully
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

// Change company status
router.patch(
  '/:companyId/change-company-status',
  authUser,
  async (req, res) => {
    if (req.user) {
      // Destructure data from req
      const { role } = req.user;

      if (role === 'ADMIN') {
        // Destructure data from req
        const { companyId } = req.params;
        const { action }: StatusChangePayload = req.body;

        // If all the fields aren't provided
        if (!companyId || !action) {
          // Log error
          console.log('Please provide all the fields');

          res.status(400);
          throw new Error('Please provide all the fields');
        }

        // Check actions validity
        checkActions(undefined, action, res);

        try {
          if (action === 'Archive') {
            // Get the active orders of the company
            const orders = await Order.find({
              status: 'PROCESSING',
              'company._id': companyId,
            })
              .select('_id')
              .lean();

            // Throw error if there are active orders
            if (orders.length > 0) {
              // Log error
              console.log("Can't archive a company with active orders");

              res.status(404);
              throw new Error("Can't archive a company with active orders");
            }
          }

          try {
            // Find and update company status
            const updatedCompany = await Company.findOneAndUpdate(
              { _id: companyId },
              {
                status: action === 'Archive' ? 'ARCHIVED' : 'ACTIVE',
              },
              { returnDocument: 'after' }
            )
              .select('-__v -updatedAt')
              .lean()
              .orFail();

            if (updatedCompany.status === 'ARCHIVED') {
              try {
                // Remove the shift and the company status of users
                await User.updateMany(
                  {
                    'companies._id': updatedCompany._id,
                  },
                  {
                    $pull: {
                      shifts: updatedCompany.shift,
                    },
                    $set: {
                      'companies.$.status': updatedCompany.status,
                    },
                  }
                );

                // Send data with response
                res.status(200).json(updatedCompany);
              } catch (err) {
                // If users aren't updated
                console.log(err);

                throw err;
              }
            } else if (updatedCompany.status === 'ACTIVE') {
              // Add the shift and the company from all users

              try {
                // Remove the shift and the company from all users
                await User.updateMany(
                  { 'companies.code': updatedCompany.code },
                  {
                    $push: {
                      shifts: updatedCompany.shift,
                    },
                  }
                );

                // Send data with response
                res.status(200).json(updatedCompany);
              } catch (err) {
                // If users aren't updated
                console.log(err);

                throw err;
              }
            }
          } catch (err) {
            // If company status isn't changed successfully
            console.log(err);

            throw err;
          }
        } catch (err) {
          // If orders aren't fetched successfully
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

export default router;
