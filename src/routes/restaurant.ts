import Order from '../models/order';
import Company from '../models/company';
import Restaurant from '../models/restaurant';
import auth from '../middleware/auth';
import { Router } from 'express';
import {
  now,
  sortByDate,
  resizeImage,
  deleteFields,
  checkActions,
  formatAddons,
  dateToMS,
  isCorrectAddonsFormat,
  getUpcomingRestaurants,
  docToObj,
} from '../lib/utils';
import { upload } from '../config/multer';
import { deleteImage, uploadImage } from '../config/s3';
import { Addons, RestaurantSchema } from '../types';
import mail from '@sendgrid/mail';
import { orderCancel } from '../lib/emails';
import {
  invalidOptionalAddOnsFormat,
  invalidRequiredAddOnsFormat,
  requiredAction,
  requiredFields,
  unAuthorized,
} from '../lib/messages';
import User from '../models/user';

interface ItemsIndexPayload {
  reorderedItems: {
    _id: string;
    index: number;
  }[];
}

const router = Router();

// Get customer's upcoming restaurants
router.get('/upcoming-restaurants', auth, async (req, res) => {
  if (!req.user || req.user.role !== 'CUSTOMER') {
    console.error(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }

  const { companies } = req.user;
  if (!companies || !companies.length) {
    console.error(unAuthorized);
    res.status(400);
    throw new Error(unAuthorized);
  }

  try {
    const upcomingRestaurants = await getUpcomingRestaurants(res, companies);
    res.status(200).json(upcomingRestaurants);
  } catch (err) {
    console.error(err);
    throw err;
  }
});

// Get users's upcoming restaurants
router.get('/upcoming-restaurants/:userId', auth, async (req, res) => {
  if (
    !req.user ||
    (req.user.role !== 'ADMIN' &&
      (req.user.role !== 'CUSTOMER' || !req.user.isCompanyAdmin))
  ) {
    console.error(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }

  const user = await User.findById(req.params.userId)
    .select('companies')
    .lean()
    .orFail();

  if (!user.companies || !user.companies.length) {
    console.error(unAuthorized);
    res.status(400);
    throw new Error(unAuthorized);
  }

  try {
    const upcomingRestaurants = await getUpcomingRestaurants(
      res,
      user.companies
    );

    res.status(200).json(upcomingRestaurants);
  } catch (err) {
    console.error(err);
    throw err;
  }
});

// Get all scheduled restaurants
router.get('/scheduled-restaurants', auth, async (req, res) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    console.error(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }

  try {
    const restaurants = await Restaurant.find({
      'schedules.date': {
        $gte: now,
      },
    }).select('-__v -updatedAt -createdAt -address -items -logo');

    const scheduledRestaurants = [];
    for (const restaurant of restaurants) {
      const { schedules, ...rest } = restaurant.toObject();
      for (const schedule of schedules) {
        if (dateToMS(schedule.date) >= now) {
          const scheduledRestaurant = {
            ...rest,
            company: schedule.company,
            schedule: {
              _id: schedule._id,
              date: schedule.date,
              status: schedule.status,
            },
          };
          scheduledRestaurants.push(scheduledRestaurant);
        }
      }
    }
    scheduledRestaurants.sort(sortByDate);
    res.status(200).json(scheduledRestaurants);
  } catch (err) {
    console.error(err);
    throw err;
  }
});

// Get all scheduled restaurants by company
router.get('/:companyCode/scheduled-restaurants', auth, async (req, res) => {
  if (
    !req.user ||
    req.user.role !== 'CUSTOMER' ||
    !req.user.isCompanyAdmin ||
    req.user.companies[0].code !== req.params.companyCode
  ) {
    console.error(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }

  const { companyCode } = req.params;
  try {
    const restaurants = await Restaurant.find({
      'schedules.company.code': companyCode,
      'schedules.date': { $gte: now },
    }).select('-__v -updatedAt -createdAt -address -items -logo');

    const scheduledRestaurants = [];
    for (const restaurant of restaurants) {
      const { schedules, ...rest } = restaurant.toObject();
      for (const schedule of schedules) {
        if (
          dateToMS(schedule.date) >= now &&
          schedule.company.code === companyCode
        ) {
          const scheduledRestaurant = {
            ...rest,
            company: schedule.company,
            schedule: {
              _id: schedule._id,
              date: schedule.date,
              status: schedule.status,
            },
          };
          scheduledRestaurants.push(scheduledRestaurant);
        }
      }
    }
    scheduledRestaurants.sort(sortByDate);

    res.status(200).json(scheduledRestaurants);
  } catch (err) {
    console.error(err);
    throw err;
  }
});

// Schedule restaurants
router.post('/schedule-restaurants', auth, async (req, res) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    console.error(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }
  const { date, companyId, restaurantIds } = req.body;
  if (!date || !companyId || !restaurantIds.length) {
    console.error(requiredFields);
    res.status(400);
    throw new Error(requiredFields);
  }
  if (dateToMS(date) < now) {
    console.error("Cant' schedule on the provided date");
    res.status(400);
    throw new Error("Cant' schedule on the provided date");
  }

  try {
    // Remove past dates from the restaurants
    await Restaurant.updateMany(
      {
        _id: {
          $in: restaurantIds,
        },
      },
      {
        $pull: {
          schedules: {
            date: { $lt: now },
          },
        },
      }
    );

    const restaurants = await Restaurant.find({ _id: { $in: restaurantIds } })
      .select('name schedules')
      .orFail();

    // Sort the restaurants by the index of the restaurantIds
    const restaurantMap: Record<string, RestaurantSchema> = {};
    for (const restaurant of restaurants) {
      restaurantMap[restaurant._id.toString()] = restaurant;
    }
    const sortedRestaurants = restaurantIds.map(
      (id: string) => restaurantMap[id]
    );

    for (const restaurant of sortedRestaurants) {
      for (const schedule of restaurant.schedules) {
        if (
          dateToMS(schedule.date) === dateToMS(date) &&
          companyId === schedule.company._id.toString()
        ) {
          console.error(
            `${restaurant.name} is already scheduled on the provided date`
          );
          res.status(400);
          throw new Error(
            `${restaurant.name} is already scheduled on the provided date`
          );
        }
      }
    }

    const company = await Company.findById(companyId).orFail();
    const scheduleCompany = {
      _id: company._id,
      name: company.name,
      code: company.code,
      shift: company.shift,
    };
    const schedule = {
      date,
      status: 'ACTIVE',
      company: scheduleCompany,
    };

    const scheduledRestaurants = [];
    for (const restaurant of sortedRestaurants) {
      const updatedRestaurant = await Restaurant.findByIdAndUpdate(
        restaurant.id,
        {
          $push: {
            schedules: schedule,
          },
        },
        { returnDocument: 'after' }
      )
        .select('-__v -updatedAt -createdAt -address -items -logo')
        .orFail();

      const addedSchedule =
        updatedRestaurant.schedules[updatedRestaurant.schedules.length - 1];
      const { schedules, ...rest } = updatedRestaurant.toObject();

      const scheduledRestaurant = {
        ...rest,
        company: scheduleCompany,
        schedule: {
          _id: addedSchedule._id,
          date,
          status: 'ACTIVE',
        },
      };
      deleteFields(scheduledRestaurant);
      scheduledRestaurants.push(scheduledRestaurant);
    }
    res.status(201).json(scheduledRestaurants);
  } catch (err) {
    console.error(err);
    throw err;
  }
});

// Change schedule statues
router.patch(
  '/:restaurantId/:date/:companyCode/change-schedule-status',
  auth,
  async (req, res) => {
    if (
      !req.user ||
      !(req.user.role === 'ADMIN' || req.user.role === 'VENDOR')
    ) {
      console.error(unAuthorized);
      res.status(403);
      throw new Error(unAuthorized);
    }
    const { action } = req.body;
    const { restaurantId, date, companyCode } = req.params;
    if (!action) {
      console.error(requiredAction);
      res.status(400);
      throw new Error(requiredAction);
    }
    checkActions(['Activate', 'Deactivate'], action, res);

    try {
      const restaurant = await Restaurant.findOne({
        _id: restaurantId,
        'schedules.date': +date,
        'schedules.company.code': companyCode,
      })
        .select('-__v -updatedAt -createdAt -address -items')
        .orFail();

      const schedules = restaurant.schedules.filter(
        (schedule) =>
          dateToMS(schedule.date) === +date &&
          schedule.company.code === companyCode
      );
      if (!schedules.length) {
        console.error('No schedule found');
        res.status(400);
        throw new Error('No schedule found');
      }

      const areDeactivatedByAdmin = schedules.some(
        (schedule) => schedule.deactivatedByAdmin
      );
      if (
        req.user.role === 'VENDOR' &&
        areDeactivatedByAdmin &&
        action === 'Activate'
      ) {
        console.error('Restaurant is deactivated by admin');
        res.status(400);
        throw new Error('Restaurant is deactivated by admin');
      }

      for (const schedule of schedules) {
        if (req.user.role === 'ADMIN') {
          if (action === 'Deactivate') {
            schedule.status = 'INACTIVE';
            schedule.deactivatedByAdmin = true;
          }
          if (action === 'Activate') {
            schedule.status = 'ACTIVE';
            schedule.deactivatedByAdmin = false;
          }
        }
        if (req.user.role === 'VENDOR')
          schedule.status = action === 'Deactivate' ? 'INACTIVE' : 'ACTIVE';
      }
      await restaurant.save();

      const allSchedules = restaurant.schedules.map((schedule) => ({
        _id: schedule._id,
        status: schedule.status,
        date: schedule.date,
        company: {
          code: schedule.company.code,
          shift: schedule.company.shift,
        },
      }));
      res.status(201).json(allSchedules);
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
);

// Remove a schedule
router.patch(
  '/:restaurantId/:scheduleId/remove-schedule',
  auth,
  async (req, res) => {
    if (!req.user || req.user.role !== 'ADMIN') {
      console.error(unAuthorized);
      res.status(403);
      throw new Error(unAuthorized);
    }

    const { restaurantId, scheduleId } = req.params;
    try {
      // Find the restaurant and remove the schedule
      const updatedRestaurant = await Restaurant.findOneAndUpdate(
        { _id: restaurantId },
        {
          $pull: {
            schedules: { _id: scheduleId },
          },
        }
      )
        .select('-__v -updatedAt -createdAt -address -items')
        .lean()
        .orFail();

      const removedSchedule = updatedRestaurant.schedules.find(
        (schedule) => schedule._id?.toString() === scheduleId
      );
      if (!removedSchedule) {
        console.error('Please provide a valid schedule');
        res.status(400);
        throw new Error('Please provide a valid schedule');
      }

      const orders = await Order.find({
        status: 'PROCESSING',
        'delivery.date': removedSchedule.date,
        'restaurant._id': updatedRestaurant._id,
        'company._id': removedSchedule.company._id,
      });
      await Promise.all(
        orders.map(
          async (order) => await mail.send(orderCancel(docToObj(order)))
        )
      );
      await Order.updateMany(
        {
          status: 'PROCESSING',
          'restaurant._id': updatedRestaurant._id,
          'delivery.date': removedSchedule.date,
          'company._id': removedSchedule.company._id,
        },
        {
          $set: { status: 'ARCHIVED' },
        }
      );
      res.status(201).json('Schedule and orders removed successfully');
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
);

// Cerate an item
router.post('/:restaurantId/add-item', auth, upload, async (req, res) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    console.error(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }
  const { restaurantId } = req.params;
  const {
    name,
    tags,
    price,
    index,
    description,
    optionalAddons,
    requiredAddons,
    removableIngredients,
  } = req.body;
  if (
    !name ||
    !tags ||
    !price ||
    !index ||
    !description ||
    !optionalAddons ||
    !requiredAddons
  ) {
    console.error(requiredFields);
    res.status(400);
    throw new Error(requiredFields);
  }

  const parsedOptionalAddons: Addons = JSON.parse(optionalAddons);
  const parsedRequiredAddons: Addons = JSON.parse(requiredAddons);

  if (
    parsedOptionalAddons.addons &&
    !isCorrectAddonsFormat(parsedOptionalAddons)
  ) {
    console.error(invalidOptionalAddOnsFormat);
    res.status(400);
    throw new Error(invalidOptionalAddOnsFormat);
  }
  if (
    parsedRequiredAddons.addons &&
    !isCorrectAddonsFormat(parsedRequiredAddons)
  ) {
    console.error(invalidRequiredAddOnsFormat);
    res.status(400);
    throw new Error(invalidRequiredAddOnsFormat);
  }

  let imageUrl;
  if (req.file) {
    const { buffer, mimetype } = req.file;
    const modifiedBuffer = await resizeImage(res, buffer, 800, 500);
    imageUrl = await uploadImage(res, modifiedBuffer, mimetype);
  }

  const formattedOptionalAddons =
    parsedOptionalAddons.addons && formatAddons(parsedOptionalAddons);
  const formattedRequiredAddons =
    parsedRequiredAddons.addons && formatAddons(parsedRequiredAddons);

  try {
    const updatedRestaurant = await Restaurant.findOneAndUpdate(
      { _id: restaurantId },
      {
        $push: {
          items: {
            name,
            tags,
            price,
            index,
            description,
            image: imageUrl,
            status: 'ACTIVE',
            removableIngredients,
            optionalAddons: formattedOptionalAddons || parsedOptionalAddons,
            requiredAddons: formattedRequiredAddons || parsedRequiredAddons,
          },
        },
      },
      {
        returnDocument: 'after',
      }
    )
      .select('-__v -updatedAt')
      .lean()
      .orFail();

    res.status(201).json(updatedRestaurant);
  } catch (err) {
    console.error(err);
    throw err;
  }
});

// Edit an item
router.patch(
  '/:restaurantId/:itemId/update-item-details',
  auth,
  upload,
  async (req, res) => {
    if (!req.user || req.user.role !== 'ADMIN') {
      console.error(unAuthorized);
      res.status(403);
      throw new Error(unAuthorized);
    }

    const { restaurantId, itemId } = req.params;
    const {
      name,
      tags,
      price,
      image,
      description,
      optionalAddons,
      requiredAddons,
      removableIngredients,
    } = req.body;
    if (
      !name ||
      !tags ||
      !price ||
      !description ||
      !optionalAddons ||
      !requiredAddons
    ) {
      console.error(requiredFields);
      res.status(400);
      throw new Error(requiredFields);
    }

    const parsedOptionalAddons: Addons = JSON.parse(optionalAddons);
    const parsedRequiredAddons: Addons = JSON.parse(requiredAddons);

    if (
      parsedOptionalAddons.addons &&
      !isCorrectAddonsFormat(parsedOptionalAddons)
    ) {
      console.error(invalidOptionalAddOnsFormat);
      res.status(400);
      throw new Error(invalidOptionalAddOnsFormat);
    }
    if (
      parsedRequiredAddons.addons &&
      !isCorrectAddonsFormat(parsedRequiredAddons)
    ) {
      console.error(invalidRequiredAddOnsFormat);
      res.status(400);
      throw new Error(invalidRequiredAddOnsFormat);
    }

    if (req.file && image) {
      const name = image.split('/')[image.split('/').length - 1];
      await deleteImage(res, name);
    }

    let imageUrl = image;
    if (req.file) {
      const { buffer, mimetype } = req.file;
      const modifiedBuffer = await resizeImage(res, buffer, 800, 500);
      imageUrl = await uploadImage(res, modifiedBuffer, mimetype);
    }

    const formattedOptionalAddons =
      parsedOptionalAddons.addons && formatAddons(parsedOptionalAddons);
    const formattedRequiredAddons =
      parsedRequiredAddons.addons && formatAddons(parsedRequiredAddons);

    try {
      if (!imageUrl) {
        const updatedRestaurant = await Restaurant.findOneAndUpdate(
          { _id: restaurantId, 'items._id': itemId },
          {
            $set: {
              'items.$.name': name,
              'items.$.tags': tags,
              'items.$.price': price,
              'items.$.description': description,
              'items.$.optionalAddons':
                formattedOptionalAddons || parsedOptionalAddons,
              'items.$.requiredAddons':
                formattedRequiredAddons || parsedRequiredAddons,
              'items.$.removableIngredients': removableIngredients,
            },
            $unset: {
              'items.$.image': null,
            },
          },
          {
            returnDocument: 'after',
          }
        )
          .lean()
          .orFail();

        deleteFields(updatedRestaurant, ['createdAt']);
        res.status(201).json(updatedRestaurant);
      } else if (imageUrl) {
        const updatedRestaurant = await Restaurant.findOneAndUpdate(
          { _id: restaurantId, 'items._id': itemId },
          {
            $set: {
              'items.$.name': name,
              'items.$.tags': tags,
              'items.$.price': price,
              'items.$.image': imageUrl,
              'items.$.description': description,
              'items.$.optionalAddons':
                formattedOptionalAddons || parsedOptionalAddons,
              'items.$.requiredAddons':
                formattedRequiredAddons || parsedRequiredAddons,
              'items.$.removableIngredients': removableIngredients,
            },
          },
          {
            returnDocument: 'after',
          }
        )
          .lean()
          .orFail();

        deleteFields(updatedRestaurant, ['createdAt']);
        res.status(201).json(updatedRestaurant);
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
);

// Change item status
router.patch(
  '/:restaurantId/:itemId/change-item-status',
  auth,
  async (req, res) => {
    if (!req.user || req.user.role !== 'ADMIN') {
      console.error(unAuthorized);
      res.status(403);
      throw new Error(unAuthorized);
    }

    const { restaurantId, itemId } = req.params;
    const { action } = req.body;
    if (!action) {
      console.error(requiredAction);
      res.status(400);
      throw new Error(requiredAction);
    }
    checkActions(undefined, action, res);

    try {
      const updatedRestaurant = await Restaurant.findOneAndUpdate(
        { _id: restaurantId, 'items._id': itemId },
        {
          $set: {
            'items.$.status': action === 'Archive' ? 'ARCHIVED' : 'ACTIVE',
          },
        },
        {
          returnDocument: 'after',
        }
      )
        .select('-__v -updatedAt')
        .lean()
        .orFail();
      res.status(200).json(updatedRestaurant);
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
);

// Review item
router.post('/:restaurantId/:itemId/add-a-review', auth, async (req, res) => {
  if (!req.user || req.user.role !== 'CUSTOMER') {
    console.error(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }

  const { restaurantId, itemId } = req.params;
  const { rating, comment, orderId } = req.body;
  if (!rating || !comment || !orderId) {
    console.error(requiredFields);
    res.status(400);
    throw new Error(requiredFields);
  }

  const { _id } = req.user;
  try {
    const order = await Order.findOneAndUpdate(
      {
        _id: orderId,
        isReviewed: false,
        status: 'DELIVERED',
        'customer._id': _id,
      },
      { $set: { isReviewed: true } },
      {
        returnDocument: 'after',
      }
    ).orFail();
    const restaurant = await Restaurant.findOneAndUpdate(
      {
        _id: restaurantId,
        'items._id': itemId,
      },
      {
        $push: {
          'items.$.reviews': { customer: _id, rating, comment },
        },
      }
    ).orFail();

    // Update average rating on a random interval
    const updateFrequency = 1;
    const randomFrequency = Math.floor(Math.random() * updateFrequency) + 1;
    const item = restaurant.items.find(
      (item) => item._id.toString() === itemId
    );

    if (item && updateFrequency === randomFrequency) {
      const totalRating = item.reviews.reduce(
        (acc, curr) => acc + curr.rating,
        0
      );
      const averageRating = (
        (totalRating + rating * updateFrequency) /
        (item.reviews.length + updateFrequency)
      ).toFixed(2);

      await Restaurant.findOneAndUpdate(
        {
          _id: restaurantId,
          'items._id': itemId,
        },
        {
          $set: {
            'items.$.averageRating': +averageRating,
          },
        }
      );
    }
    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    throw err;
  }
});

// Update items index
router.patch('/:restaurantId/update-items-index', auth, async (req, res) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    console.error(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }

  const { restaurantId } = req.params;
  const { reorderedItems }: ItemsIndexPayload = req.body;

  try {
    reorderedItems.forEach(async (item) => {
      await Restaurant.updateOne(
        { _id: restaurantId, 'items._id': item._id },
        { $set: { 'items.$.index': item.index } }
      );
    });
    res.status(200).json('Items order updated');
  } catch (err) {
    console.error(err);
    throw err;
  }
});

// Get a vendor restaurant
router.get('/:id', auth, async (req, res) => {
  if (!req.user || req.user.role !== 'VENDOR') {
    console.error(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }

  const { id } = req.params;
  try {
    const restaurant = await Restaurant.findById(id)
      .select('-__v -createdAt -updatedAt -items')
      .lean()
      .orFail();
    res.status(200).json(restaurant);
  } catch (err) {
    console.error(err);
    throw err;
  }
});

// Get item stat
router.get('/items/count-and-average/:price?', auth, async (req, res) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    console.error(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }

  const { price } = req.params;
  try {
    const restaurants = await Restaurant.find().select('items').lean();

    let activeItemsTotal = 0;
    let activeItemsCount = 0;
    let itemsCount = 0;
    for (const restaurant of restaurants) {
      for (const item of restaurant.items) {
        if (item.status === 'ACTIVE') {
          activeItemsTotal += item.price;
          activeItemsCount++;
          if (price && item.price <= +price) itemsCount++;
        }
      }
    }

    res.status(200).json({
      itemsCount,
      averagePrice: activeItemsTotal / activeItemsCount,
    });
  } catch (err) {
    console.error(err);
    throw err;
  }
});

// Get review stat
router.get('/items/review-stat/:start/:end', auth, async (req, res) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    console.error(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }

  const { start, end } = req.params;
  try {
    const restaurants = await Restaurant.find({
      'items.reviews': {
        $elemMatch: { createdAt: { $gte: start, $lte: end } },
      },
    }).select('name items');

    let reviewCount = 0;
    let totalRating = 0;
    let reviews = [];

    for (const restaurant of restaurants) {
      for (const item of restaurant.items) {
        for (const review of item.reviews) {
          if (
            dateToMS(review.createdAt) >= dateToMS(start) &&
            dateToMS(review.createdAt) <= dateToMS(end)
          ) {
            reviewCount += 1;
            totalRating += review.rating;
            reviews.push({
              _id: review._id,
              date: review.createdAt,
              restaurant: restaurant.name,
              item: item.name,
              rating: review.rating,
              comment: review.comment,
            });
          }
        }
      }
    }
    reviews.sort((a, b) => dateToMS(b.date) - dateToMS(a.date));

    res.status(200).json({
      reviews,
      reviewCount,
      averageRating: totalRating / reviewCount,
    });
  } catch (err) {
    console.error(err);
    throw err;
  }
});

// Get review stat by company
router.get(
  '/items/review-stat/:companyCode/:start/:end',
  auth,
  async (req, res) => {
    if (
      !req.user ||
      req.user.role !== 'CUSTOMER' ||
      !req.user.isCompanyAdmin ||
      req.user.companies[0].code !== req.params.companyCode
    ) {
      console.error(unAuthorized);
      res.status(403);
      throw new Error(unAuthorized);
    }

    const { companyCode, start, end } = req.params;
    try {
      const users = await User.find({ 'companies.code': companyCode }).select(
        '_id companies'
      );

      let userMap: Record<string, boolean> = {};
      for (const user of users) {
        userMap[user._id.toString()] = true;
      }

      const restaurants = await Restaurant.find({
        'items.reviews': {
          $elemMatch: { createdAt: { $gte: start, $lte: end } },
        },
      }).select('name items');

      let reviewCount = 0;
      let totalRating = 0;
      let reviews = [];

      for (const restaurant of restaurants) {
        for (const item of restaurant.items) {
          for (const review of item.reviews) {
            if (
              userMap[review.customer.toString()] &&
              dateToMS(review.createdAt) >= dateToMS(start) &&
              dateToMS(review.createdAt) <= dateToMS(end)
            ) {
              reviewCount += 1;
              totalRating += review.rating;
              reviews.push({
                _id: review._id,
                date: review.createdAt,
                restaurant: restaurant.name,
                item: item.name,
                rating: review.rating,
                comment: review.comment,
              });
            }
          }
        }
      }
      reviews.sort((a, b) => dateToMS(b.date) - dateToMS(a.date));

      res.status(200).json({
        reviews,
        reviewCount,
        averageRating: totalRating / reviewCount,
      });
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
);

export default router;
