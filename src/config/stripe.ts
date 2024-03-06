import Stripe from 'stripe';
import dotenv from 'dotenv';

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
  payableOrders: StripePayableOrders[]
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
