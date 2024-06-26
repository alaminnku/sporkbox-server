import { Router } from 'express';
import Order from '../models/order';
import { ItemStat, OrderStat } from '../types';
import auth from '../middleware/auth';
import { dateToMS } from '../lib/utils';
import { unAuthorized } from '../lib/messages';
import Restaurant from '../models/restaurant';

const router = Router();

async function getDeliveredOrders() {
  const newDate = new Date();
  const year = newDate.getFullYear();
  const month = `${newDate.getMonth() + 1}`.padStart(2, '0');
  const date = `${newDate.getDate()}`.padStart(2, '0');

  const from = `${year}-01-01`;
  const to = `${year}-${month}-${date}`;

  try {
    const orders = await Order.find({
      status: 'DELIVERED',
      'company._id': {
        $in: ['643dec49e88d25d4249723ef', '643e162fe88d25d424972a55'],
      },
      'delivery.date': {
        $gte: from,
        $lte: to,
      },
    })
      .lean()
      .orFail();

    return orders;
  } catch (err) {
    console.log(err);
    throw err;
  }
}

router.get('/order', auth, async (req, res) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    console.log(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }

  const orders = await getDeliveredOrders();
  const results = orders.reduce((acc, curr) => {
    if (
      !acc.some(
        (order) => order.restaurant.id === curr.restaurant._id.toString()
      )
    ) {
      return [
        ...acc,
        {
          restaurant: {
            id: curr.restaurant._id.toString(),
            name: curr.restaurant.name,
          },
          quantity: curr.item.quantity,
        },
      ];
    } else {
      return acc.map((order) => {
        if (order.restaurant.id === curr.restaurant._id.toString()) {
          return {
            ...order,
            quantity: order.quantity + curr.item.quantity,
          };
        } else {
          return order;
        }
      });
    }
  }, [] as OrderStat[]);

  res.status(200).json(results);
});

router.get('/item', auth, async (req, res) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    console.log(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }

  const orders = await getDeliveredOrders();
  const results = orders.reduce((acc, curr) => {
    if (
      !acc.some(
        (order) =>
          order.item.id === curr.item._id.toString() &&
          order.restaurant.id === curr.restaurant._id.toString()
      )
    ) {
      return [
        ...acc,
        {
          restaurant: {
            id: curr.restaurant._id.toString(),
            name: curr.restaurant.name,
          },
          item: {
            id: curr.item._id.toString(),
            name: curr.item.name,
            quantity: curr.item.quantity,
          },
        },
      ];
    } else {
      return acc.map((order) => {
        if (
          order.item.id === curr.item._id.toString() &&
          order.restaurant.id === curr.restaurant._id.toString()
        ) {
          return {
            ...order,
            item: {
              ...order.item,
              quantity: order.item.quantity + curr.item.quantity,
            },
          };
        } else {
          return order;
        }
      });
    }
  }, [] as ItemStat[]);

  res.status(200).json(results);
});

router.get('/people', auth, async (req, res) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    console.log(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }

  const orders = await getDeliveredOrders();
  const results = orders.reduce((acc, curr) => {
    const currCustomerId = curr.customer._id.toString();
    const currDeliveryDate = dateToMS(curr.delivery.date);

    if (!acc.some((el) => el.date === currDeliveryDate)) {
      return [...acc, { date: currDeliveryDate, customers: [currCustomerId] }];
    } else {
      return acc.map((el) => {
        if (el.date === currDeliveryDate) {
          return {
            ...el,
            customers: el.customers.includes(currCustomerId)
              ? el.customers
              : [...el.customers, currCustomerId],
          };
        } else {
          return el;
        }
      });
    }
  }, [] as { date: number; customers: string[] }[]);

  res.status(200).json(results);
});

router.get('/restaurant-items', auth, async (req, res) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    console.log(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }

  try {
    const restaurants = await Restaurant.find().lean().orFail();
    const items = [];
    for (const restaurant of restaurants) {
      for (const item of restaurant.items) {
        if (item.status === 'ACTIVE') {
          items.push({
            restaurant: restaurant.name,
            name: item.name,
            price: item.price,
          });
        }
      }
    }
    res.status(200).json(items);
  } catch (err) {
    console.log(err);
    throw err;
  }
});

export default router;
