import Stripe from 'stripe';
import dotenv from 'dotenv';
import { ActiveOrder, StatusUpdateRestaurant } from '../types';

interface StripePayableOrders {
  date: string;
  items: string[];
  amount: number;
}

dotenv.config();

export const stripe = new Stripe(process.env.STRIPE_KEY as string, {
  apiVersion: '2022-11-15',
});

export async function stripeCheckout(
  customerEmail: string,
  pendingOrderId: string,
  discountCodeId: string,
  discountAmount: number,
  payableOrders: StripePayableOrders[],
  restaurants: StatusUpdateRestaurant[],
  activeOrders: ActiveOrder[]
) {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: payableOrders.map((payableOrder) => {
        return {
          price_data: {
            currency: 'usd',
            product_data: {
              name: payableOrder.date,
              description: payableOrder.items.join(', '),
            },
            unit_amount: Math.round(Math.abs(payableOrder.amount) * 100),
          },
          quantity: 1,
        };
      }),
      metadata: {
        details: JSON.stringify({
          restaurants,
          activeOrders,
          pendingOrderId,
          discountCodeId,
          discountAmount,
          company: 'sporkbox',
        }),
      },
      customer_email: customerEmail,
      success_url: `${process.env.CLIENT_URL}/success?session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/dashboard`,
    });

    return session;
  } catch (err) {
    console.log(err);
    throw err;
  }
}

export async function stripeRefund(amount: number, paymentIntent: string) {
  try {
    await stripe.refunds.create({
      payment_intent: paymentIntent,
      amount: Math.round(amount * 100),
    });
  } catch (err) {
    console.log(err);
    throw err;
  }
}

export async function stripeRefundAmount(paymentIntent: string) {
  let total: number = 0;
  try {
    const refunds = await stripe.refunds.list({
      payment_intent: paymentIntent,
    });
    for (const refund of refunds.data) {
      if (refund.status === 'succeeded') {
        total += refund.amount;
      }
    }
  } catch (err) {
    console.log(err);
    throw err;
  }
  return total / 100;
}
