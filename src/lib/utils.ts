import sharp from 'sharp';
import crypto from 'crypto';
import cron from 'cron';
import jwt from 'jsonwebtoken';
import User from '../models/user';
import mail from '@sendgrid/mail';
import { Types } from 'mongoose';
import Order from '../models/order';
import Restaurant from '../models/restaurant';
import {
  ActiveOrder,
  Addons,
  DateTotal,
  GenericUser,
  UserCompany,
} from '../types';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import {
  thursdayOrderReminderTemplate,
  fridayOrderReminderTemplate,
} from './emailTemplates';
import { invalidShift } from './messages';

type SortScheduledRestaurant = {
  schedule: {
    date: Date;
  };
};

type OrderReminderTemplate = (customer: GenericUser) => {
  to: string;
  from: string;
  subject: string;
  html: string;
};

export const setCookie = (res: Response, _id: Types.ObjectId): void => {
  const jwtToken = jwt.sign({ _id }, process.env.JWT_SECRET as string, {
    expiresIn: '7d',
  });

  res.cookie('token', jwtToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    secure: process.env.NODE_ENV !== 'development',
  });
};

export const deleteFields = (data: object, moreFields?: string[]): void => {
  let fields = ['__v', 'updatedAt'];
  if (moreFields) {
    fields = [...fields, ...moreFields];
  }
  fields.forEach((field) => delete data[field as keyof object]);
};

export const toUSNumber = (number: number) => +number.toLocaleString('en-US');

export const dateToMS = (date: Date | string): number =>
  new Date(date).getTime();

export const sortByDate = (
  a: SortScheduledRestaurant,
  b: SortScheduledRestaurant
): number => dateToMS(a.schedule.date) - dateToMS(b.schedule.date);

export const now = Date.now();

export async function getUpcomingRestaurants(
  companies: UserCompany[],
  getActiveSchedules?: boolean
) {
  const activeCompany = companies.find(
    (company) => company.status === 'ACTIVE'
  );

  if (!activeCompany) {
    console.log('No enrolled shift found');
    throw new Error('No enrolled shift found');
  }

  try {
    const scheduledRestaurants = await Restaurant.find({
      schedules: {
        $elemMatch: {
          date: { $gte: now },
          'company._id': activeCompany._id,
          ...(getActiveSchedules && { status: 'ACTIVE' }),
        },
      },
    })
      .select('-__v -updatedAt -createdAt -address')
      .lean();

    const upcomingRestaurants = [];
    for (const scheduledRestaurant of scheduledRestaurants) {
      const items = scheduledRestaurant.items
        .filter((item) => item.status === 'ACTIVE')
        .sort((a, b) => a.index - b.index)
        .map((item) => ({
          ...item,
          reviews: item.reviews.sort(
            (a, b) => dateToMS(b.createdAt) - dateToMS(a.createdAt)
          ),
        }));

      const { schedules, ...rest } = scheduledRestaurant;
      for (const schedule of schedules) {
        if (
          dateToMS(schedule.date) >= now &&
          (getActiveSchedules ? schedule.status === 'ACTIVE' : true) &&
          activeCompany._id.toString() === schedule.company._id.toString()
        ) {
          const upcomingRestaurant = {
            ...rest,
            items,
            company: {
              _id: schedule.company._id,
              shift: schedule.company.shift,
            },
            schedule: {
              date: schedule.date,
              status: schedule.status,
            },
          };
          upcomingRestaurants.push(upcomingRestaurant);
        }
      }
    }
    return upcomingRestaurants.sort(sortByDate);
  } catch (err) {
    console.log(err);
    throw err;
  }
}

export function checkActions(
  actions = ['Archive', 'Activate'],
  action: string,
  res: Response
) {
  if (!actions.includes(action)) {
    console.log('Please provide valid action');
    res.status(400);
    throw new Error('Please provide valid action');
  }
}

export function checkShift(res: Response, shift: string) {
  if (!['day', 'night'].includes(shift)) {
    console.log(invalidShift);
    res.status(400);
    throw new Error(invalidShift);
  }
}

export async function resizeImage(
  res: Response,
  buffer: Buffer,
  width: number,
  height: number
) {
  try {
    return await sharp(buffer)
      .resize({
        width,
        height,
        fit: 'contain',
        background: { r: 255, g: 255, b: 255 },
      })
      .toBuffer();
  } catch (err) {
    console.log('Failed to resize image');
    res.status(500);
    throw new Error('Failed to resize image');
  }
}

export const dateToText = (date: Date | string | number): string =>
  new Date(date).toUTCString().split(' ').slice(0, 3).join(' ');

export const generateRandomString = () =>
  crypto.randomBytes(16).toString('hex');

export const splitAddons = (addons: string) =>
  addons
    .split(',')
    .map((ingredient) => ingredient.trim())
    .map((ingredient) =>
      ingredient.split('-').map((ingredient) => ingredient.trim())
    );

export const isCorrectAddonsFormat = (parsedAddons: Addons) =>
  splitAddons(parsedAddons.addons).every(
    (ingredient) =>
      ingredient.length === 2 &&
      ingredient[1] !== '' &&
      +ingredient[1] >= 0 &&
      splitAddons(parsedAddons.addons).length >= parsedAddons.addable
  );

export const formatAddons = (parsedAddons: Addons) => ({
  addons: splitAddons(parsedAddons.addons)
    .map((ingredient) => ingredient.join(' - '))
    .join(', '),
  addable: parsedAddons.addable || splitAddons(parsedAddons.addons).length,
});

export function getFutureDate(dayToAdd: number) {
  const today = new Date();
  const sunday = today.getUTCDate() - today.getUTCDay();
  const futureDate = today.setUTCDate(sunday + dayToAdd);
  return new Date(futureDate).setUTCHours(0, 0, 0, 0);
}

const nextWeekMonday = getFutureDate(8);
const followingWeekSunday = getFutureDate(14);

export async function sendOrderReminderEmails(
  orderReminderTemplate: OrderReminderTemplate
) {
  try {
    const customers = await User.find({
      role: 'CUSTOMER',
      status: 'ACTIVE',
      'subscribedTo.orderReminder': true,
    })
      .select('companies email')
      .lean();

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

    const upcomingRestaurants = response
      .map((upcomingWeekRestaurant) => ({
        schedules: upcomingWeekRestaurant.schedules.filter(
          (schedule) =>
            schedule.status === 'ACTIVE' && dateToMS(schedule.date) >= now
        ),
      }))
      .map((upcomingWeekRestaurant) =>
        upcomingWeekRestaurant.schedules.map((schedule) => {
          const { schedules, ...rest } = upcomingWeekRestaurant;
          return {
            ...rest,
            company: {
              _id: schedule.company._id,
            },
          };
        })
      )
      .flat(2);

    const upcomingOrders = await Order.find({
      'delivery.date': { $gte: nextWeekMonday, $lt: followingWeekSunday },
    })
      .select('customer')
      .lean();

    const customersWithNoOrder = customers.filter(
      (customer) =>
        !upcomingOrders.some(
          (upcomingOrder) =>
            upcomingOrder.customer._id.toString() === customer._id.toString()
        ) &&
        upcomingRestaurants.some((upcomingRestaurant) =>
          customer.companies?.some(
            (company) =>
              company._id.toString() ===
              upcomingRestaurant.company._id.toString()
          )
        )
    );

    await Promise.all(
      customersWithNoOrder.map(
        async (customer) => await mail.send(orderReminderTemplate(customer))
      )
    );

    console.log(
      `Order reminder sent to ${customersWithNoOrder.length} customers`
    );
  } catch (err) {
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

export const sortIngredients = (a: string, b: string) =>
  a.toLowerCase().localeCompare(b.toLowerCase());

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

export const createAddons = (addons: string[]) =>
  addons.map((addon) => addon.split('-')[0].trim());

export const getAddonsPrice = (serverAddons: string, clientAddons: string[]) =>
  serverAddons
    ? splitAddons(serverAddons)
        .filter((addon) => clientAddons.includes(addon[0]))
        .reduce((acc, curr) => acc + +curr[1], 0)
    : 0;

export const subscriptions = {
  orderReminder: true,
};

export async function getActiveOrders(
  companyIds: string[],
  restaurantIds: string[],
  deliveryDates: Date[]
): Promise<ActiveOrder[]> {
  try {
    const activeOrders = await Order.find({
      status: 'PROCESSING',
      'company._id': { $in: companyIds },
      'delivery.date': { $in: deliveryDates },
      'restaurant._id': { $in: restaurantIds },
    })
      .select('company._id delivery.date restaurant._id item.quantity')
      .lean();
    return activeOrders;
  } catch (err) {
    console.log(err);
    throw err;
  }
}

export function checkOrderCapacity(
  companyId: string,
  deliveryDate: number,
  restaurantId: string,
  currQuantity: number,
  orderCapacity: number,
  activeOrders: ActiveOrder[]
) {
  let activeQuantity = 0;
  for (const activeOrder of activeOrders) {
    if (
      activeOrder.company._id.toString() === companyId &&
      dateToMS(activeOrder.delivery.date) === deliveryDate &&
      activeOrder.restaurant._id.toString() === restaurantId
    ) {
      activeQuantity += activeOrder.item.quantity;
    }
  }
  return orderCapacity + 5 >= activeQuantity + currQuantity;
}

export async function updateRestaurantStatus(
  activeOrders: ActiveOrder[],
  upcomingRestaurants: {
    _id: Types.ObjectId;
    scheduledOn: Date;
    orderCapacity: number;
    companyId: Types.ObjectId;
  }[]
) {
  for (const upcomingRestaurant of upcomingRestaurants) {
    let totalQuantity = 0;
    for (const activeOrder of activeOrders) {
      if (
        activeOrder.company._id.toString() ===
          upcomingRestaurant.companyId.toString() &&
        dateToMS(activeOrder.delivery.date) ===
          dateToMS(upcomingRestaurant.scheduledOn) &&
        activeOrder.restaurant._id.toString() ===
          upcomingRestaurant._id.toString()
      ) {
        totalQuantity += activeOrder.item.quantity;
      }
    }

    if (totalQuantity >= upcomingRestaurant.orderCapacity) {
      try {
        const restaurant = await Restaurant.findById(
          upcomingRestaurant._id
        ).orFail();
        for (const schedule of restaurant.schedules) {
          if (
            dateToMS(schedule.date) === dateToMS(upcomingRestaurant.scheduledOn)
          ) {
            schedule.status = 'INACTIVE';
          }
        }
        await restaurant.save();
      } catch (err) {
        console.log(err);
        throw err;
      }
    }
  }
}
