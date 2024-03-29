import sharp from 'sharp';
import crypto from 'crypto';
import cron from 'cron';
import jwt from 'jsonwebtoken';
import User from '../models/user';
import mail from '@sendgrid/mail';
import { Types } from 'mongoose';
import Order from '../models/order';
import Restaurant from '../models/restaurant';
import { Addons, DateTotal, GenericUser, UserCompany } from '../types';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import {
  thursdayOrderReminderTemplate,
  fridayOrderReminderTemplate,
} from './emailTemplates';

// Types
type SortScheduledRestaurant = {
  date: Date;
};

type OrderReminderTemplate = (customer: GenericUser) => {
  to: string;
  from: string;
  subject: string;
  html: string;
};

// Generate token and set cookie to header
export const setCookie = (res: Response, _id: Types.ObjectId): void => {
  // Generate token
  const jwtToken = jwt.sign({ _id }, process.env.JWT_SECRET as string, {
    expiresIn: '7d',
  });

  // Set cookie to header
  res.cookie('token', jwtToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    secure: process.env.NODE_ENV !== 'development',
  });
};

// Delete unnecessary fields
export const deleteFields = (data: object, moreFields?: string[]): void => {
  // Default fields
  let fields = ['__v', 'updatedAt'];

  // If more fields are provided
  if (moreFields) {
    fields = [...fields, ...moreFields];
  }

  // Delete the fields
  fields.forEach((field) => delete data[field as keyof object]);
};

// Convert number
export const toUSNumber = (number: number) => +number.toLocaleString('en-US');

// Convert date to slug
export const dateToMS = (date: Date | string): number =>
  new Date(date).getTime();

// Sort by date
export const sortByDate = (
  a: SortScheduledRestaurant,
  b: SortScheduledRestaurant
): number => dateToMS(a.date) - dateToMS(b.date);

// Timestamp of current moment
export const now = Date.now();

// Get upcoming restaurant
export async function getUpcomingRestaurants(companies: UserCompany[]) {
  // Get the active company
  const activeCompany = companies.find(
    (company) => company.status === 'ACTIVE'
  );

  if (activeCompany) {
    try {
      // Get the scheduled restaurants
      const response = await Restaurant.find({
        schedules: {
          $elemMatch: {
            date: { $gte: now },
            status: 'ACTIVE',
            'company._id': activeCompany._id,
          },
        },
      })
        .select('-__v -updatedAt -createdAt -address')
        .lean();

      // Create upcoming week restaurants, then flat and sort
      const upcomingRestaurants = response
        .map((upcomingWeekRestaurant) => ({
          ...upcomingWeekRestaurant,
          items: upcomingWeekRestaurant.items
            .filter((item) => item.status === 'ACTIVE')
            .sort((a, b) => a.index - b.index),
          schedules: upcomingWeekRestaurant.schedules.filter(
            (schedule) =>
              schedule.status === 'ACTIVE' &&
              dateToMS(schedule.date) >= now &&
              activeCompany._id.toString() === schedule.company._id.toString()
          ),
        }))
        .map((upcomingWeekRestaurant) =>
          upcomingWeekRestaurant.schedules.map((schedule) => {
            // Destructure scheduled restaurant
            const { schedules, ...rest } = upcomingWeekRestaurant;

            // Create new restaurant object
            return {
              ...rest,
              date: schedule.date,
              company: {
                _id: schedule.company._id,
                shift: schedule.company.shift,
              },
              scheduledAt: schedule.createdAt,
            };
          })
        )
        .flat(2)
        .sort(sortByDate);

      // Return the scheduled restaurants with response
      return upcomingRestaurants;
    } catch (err) {
      // If scheduled restaurants aren't fetched successfully
      console.log(err);

      throw err;
    }
  } else {
    // Log error
    console.log('No enrolled shift found');

    // If no active company is found
    throw new Error('No enrolled shift found');
  }
}

// Check actions function
export function checkActions(
  actions = ['Archive', 'Activate'],
  action: string,
  res: Response
) {
  if (!actions.includes(action)) {
    // Log error
    console.log('Please provide correct action');

    res.status(400);
    throw new Error('Please provide correct action');
  }
}

// Check shifts function
export function checkShift(res: Response, shift: string) {
  if (!['day', 'night'].includes(shift)) {
    // Log error
    console.log('Please provide a valid shift');

    res.status(400);
    throw new Error('Please provide a valid shift');
  }
}

// Resize image
export async function resizeImage(
  res: Response,
  buffer: Buffer,
  width: number,
  height: number
) {
  try {
    // Return the resized buffer
    return await sharp(buffer)
      .resize({
        width,
        height,
        fit: 'contain',
        background: { r: 255, g: 255, b: 255 },
      })
      .toBuffer();
  } catch (err) {
    // If image resize fails
    console.log('Failed to resize image');

    res.status(500);
    throw new Error('Failed to resize image');
  }
}

// Convert date to string
export const dateToText = (date: Date | string | number): string =>
  new Date(date).toUTCString().split(' ').slice(0, 3).join(' ');

// Generate unique string
export const generateRandomString = () =>
  crypto.randomBytes(16).toString('hex');

// Split and trim addons
export const splitAddons = (addons: string) =>
  addons
    .split(',')
    .map((ingredient) => ingredient.trim())
    .map((ingredient) =>
      ingredient.split('-').map((ingredient) => ingredient.trim())
    );

// Check addable ingredients format
export const isCorrectAddonsFormat = (parsedAddons: Addons) =>
  splitAddons(parsedAddons.addons).every(
    (ingredient) =>
      ingredient.length === 2 &&
      ingredient[1] !== '' &&
      +ingredient[1] >= 0 &&
      splitAddons(parsedAddons.addons).length >= parsedAddons.addable
  );

// Format addable ingredients
export const formatAddons = (parsedAddons: Addons) => ({
  addons: splitAddons(parsedAddons.addons)
    .map((ingredient) => ingredient.join(' - '))
    .join(', '),
  addable: parsedAddons.addable || splitAddons(parsedAddons.addons).length,
});

// Get future date
export function getFutureDate(dayToAdd: number) {
  // Today
  const today = new Date();

  // Sunday's date of current week
  const sunday = today.getUTCDate() - today.getUTCDay();

  // Get future date in MS
  const futureDate = today.setUTCDate(sunday + dayToAdd);

  // Return future date without hours in MS
  return new Date(futureDate).setUTCHours(0, 0, 0, 0);
}

// Get dates in MS
const nextWeekMonday = getFutureDate(8);
const followingWeekSunday = getFutureDate(14);

// Remind to order
export async function sendOrderReminderEmails(
  orderReminderTemplate: OrderReminderTemplate
) {
  try {
    // Get all active customers
    const customers = await User.find({
      role: 'CUSTOMER',
      status: 'ACTIVE',
      'subscribedTo.orderReminder': true,
    })
      .select('companies email')
      .lean();

    // Get all upcoming restaurants
    const response = await Restaurant.find({
      schedules: {
        $elemMatch: {
          status: 'ACTIVE',
          date: { $gte: now },
        },
      },
    })
      .select('schedules')
      .lean();

    // Create upcoming week restaurants, then flat and sort
    const upcomingRestaurants = response
      .map((upcomingWeekRestaurant) => ({
        schedules: upcomingWeekRestaurant.schedules.filter(
          (schedule) =>
            schedule.status === 'ACTIVE' && dateToMS(schedule.date) >= now
        ),
      }))
      .map((upcomingWeekRestaurant) =>
        upcomingWeekRestaurant.schedules.map((schedule) => {
          // Destructure upcoming restaurant
          const { schedules, ...rest } = upcomingWeekRestaurant;

          // Create new restaurant object
          return {
            ...rest,
            company: {
              _id: schedule.company._id,
            },
          };
        })
      )
      .flat(2);

    // Get orders from next week Monday to following week Sunday
    const upcomingOrders = await Order.find({
      'delivery.date': { $gte: nextWeekMonday, $lt: followingWeekSunday },
    })
      .select('customer')
      .lean();

    // Get customers with no upcomingO
    const customersWithNoOrder = customers.filter(
      (customer) =>
        // Return customer with no upcoming orders
        !upcomingOrders.some(
          (upcomingOrder) =>
            upcomingOrder.customer._id.toString() === customer._id.toString()
        ) &&
        // Return customer who has restaurants scheduled to order
        upcomingRestaurants.some((upcomingRestaurant) =>
          customer.companies?.some(
            (company) =>
              company._id.toString() ===
              upcomingRestaurant.company._id.toString()
          )
        )
    );

    // Send reminder email
    await Promise.all(
      customersWithNoOrder.map(
        async (customer) => await mail.send(orderReminderTemplate(customer))
      )
    );

    // Log confirmation
    console.log(
      `Order reminder sent to ${customersWithNoOrder.length} customers`
    );
  } catch (err) {
    // Log error
    console.log(err);
  }
}

// Send the reminder at Thursday 2 PM
new cron.CronJob(
  '0 0 14 * * Thu',
  () => {
    sendOrderReminderEmails(thursdayOrderReminderTemplate);
  },
  null,
  true,
  'America/Los_Angeles'
);

// Send the reminder at Friday 8 AM
new cron.CronJob(
  '0 0 8 * * Fri',
  () => {
    sendOrderReminderEmails(fridayOrderReminderTemplate);
  },
  null,
  true,
  'America/Los_Angeles'
);

// Skip middleware for specific routes/paths
export function unless(path: string, middleware: RequestHandler) {
  return function (req: Request, res: Response, next: NextFunction) {
    if (path === req.path) {
      return next();
    } else {
      return middleware(req, res, next);
    }
  };
}

// Sort addons
export const sortIngredients = (a: string, b: string) =>
  a.toLowerCase().localeCompare(b.toLowerCase());

// Get total for each date
export function getDateTotal(details: DateTotal[]) {
  return details.reduce((acc, curr) => {
    if (!acc.some((detail) => detail.date === curr.date)) {
      return [...acc, curr];
    } else {
      return acc.map((detail) => {
        if (detail.date === curr.date) {
          return {
            ...detail,
            total: detail.total + curr.total,
          };
        } else {
          return detail;
        }
      });
    }
  }, [] as DateTotal[]);
}

// Create addons
export const createAddons = (addons: string[]) =>
  addons.map((addon) => addon.split('-')[0].trim());

// Get addons price
export const getAddonsPrice = (serverAddons: string, clientAddons: string[]) =>
  serverAddons
    ? splitAddons(serverAddons)
        .filter((addon) => clientAddons.includes(addon[0]))
        .reduce((acc, curr) => acc + +curr[1], 0)
    : 0;

// Email subscriptions
export const subscriptions = {
  orderReminder: true,
};
