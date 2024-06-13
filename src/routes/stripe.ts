import Stripe from 'stripe';
import { Router } from 'express';
import Order from '../models/order';
import { stripe } from '../config/stripe';
import auth from '../middleware/auth';
import DiscountCode from '../models/discountCode';
import { unAuthorized } from '../lib/messages';
import { updateRestaurantStatus } from '../lib/utils';

const router = Router();

// Event webhook
router.post('/webhook', async (req, res) => {
  const parsedBody = JSON.parse(req.body);
  const parsedMetadataDetails = JSON.parse(
    parsedBody.data.object.metadata.details
  );
  const isSporkBox = parsedMetadataDetails.company === 'sporkbox';
  const pendingOrderId = parsedMetadataDetails.pendingOrderId;
  const discountCodeId = parsedMetadataDetails.discountCodeId;
  const discountAmount = parsedMetadataDetails.discountAmount;
  const restaurants = parsedMetadataDetails.restaurants;
  const activeOrders = parsedMetadataDetails.activeOrders;
  const signature = req.headers['stripe-signature'] as string;

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );

    if (event.type === 'checkout.session.completed' && isSporkBox) {
      const session = event.data.object as Stripe.Checkout.Session;
      await Order.updateMany(
        { pendingOrderId, status: 'PENDING' },
        {
          $set: {
            status: 'PROCESSING',
            payment: {
              intent: session.payment_intent,
              amount: (session.amount_total as number) / 100,
            },
          },
          $unset: {
            pendingOrderId,
          },
        }
      );

      // Update total redeem amount
      +discountAmount > 0 &&
        (await DiscountCode.updateOne(
          { _id: discountCodeId },
          {
            $inc: {
              totalRedeem: 1,
            },
          }
        ));
      await updateRestaurantStatus(activeOrders, restaurants);
      res.status(201).json('Orders status updated');
    } else if (event.type === 'checkout.session.expired' && isSporkBox) {
      await Order.deleteMany({ pendingOrderId, status: 'PENDING' });
      res.status(201).json('Orders deleted');
    }
  } catch (err) {
    console.log('Stripe event verification failed');
    throw err;
  }
});

// Get session details
router.get('/session/:sessionId', auth, async (req, res) => {
  if (!req.user || req.user.role !== 'CUSTOMER') {
    console.log(unAuthorized);
    res.status(403);
    throw new Error(unAuthorized);
  }

  const { sessionId } = req.params;
  try {
    const response = await stripe.checkout.sessions.retrieve(sessionId);
    res.status(200).json(response.amount_total);
  } catch (err) {
    console.log(err);
    throw err;
  }
});

export default router;
