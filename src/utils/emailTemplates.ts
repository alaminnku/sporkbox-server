import { OrderForEmail, GenericUser } from '@types';

export function orderDeliveryTemplate(order: OrderForEmail) {
  return {
    to: order.customer.email,
    from: process.env.SENDER_EMAIL as string,
    subject: `Your Meal Has Been Delivered! 🍽️`,
    html: `
        <p>
        Hi ${order.customer.firstName} ${order.customer.lastName}, your Sporkbox order of ${order.item.name} from ${order.restaurant.name} has been delivered! Please be sure to take the meal that is labeled with your name.
        </p>

        <p>Enjoy! 😋 </p>

        <p>- The Spork Bytes Team</p>
        `,
  };
}

export function orderArchiveTemplate(order: OrderForEmail) {
  return {
    to: order.customer.email,
    from: process.env.SENDER_EMAIL as string,
    subject: `Order Status Update`,
    html: `
        <p>Hi ${order.customer.firstName} ${order.customer.lastName}, your Sporkbox order of ${order.item.name} from ${order.restaurant.name} is cancelled. You can reorder for this date now.</p>
        `,
  };
}

export function orderCancelTemplate(order: OrderForEmail) {
  return {
    to: order.customer.email,
    from: process.env.SENDER_EMAIL as string,
    subject: `Order Status Update`,
    html: `
        <p>Hi ${order.customer.firstName} ${order.customer.lastName}, your Sporkbox order of ${order.item.name} from ${order.restaurant.name} is cancelled. </p>
        `,
  };
}

export function passwordResetTemplate(user: GenericUser, link: string) {
  return {
    to: user.email,
    from: process.env.SENDER_EMAIL as string,
    subject: `Sporkbox Password Reset`,
    html: `
        <p>Hi ${user.firstName} ${user.lastName}, please reset your password here: ${link}. Please ignore if you haven't requested this change.</p>
        `,
  };
}

export function passwordResetConfirmationTemplate(user: GenericUser) {
  return {
    to: user.email,
    from: process.env.SENDER_EMAIL as string,
    subject: `Sporkbox Password Reset`,
    html: `
        <p>Hi ${user.firstName} ${user.lastName}, your Sporkbox password reset is successful.</p>
        `,
  };
}

export function thursdayOrderReminderTemplate(user: GenericUser) {
  return {
    to: user.email,
    from: process.env.SENDER_EMAIL as string,
    subject: `Have you placed your order for lunch next week?`,
    html: `
        <p>Hey there!</p>

        <p>
          <strong>
            Have you placed your order for lunch next week?
          </strong>
        </p>

        <p>Make your meal selections at www.sporkbox.app</p>

        <p>You must complete your selections by <strong>NOON Friday</strong> to lock in your order!</p>

        <p>Thanks!</p>

        <p>- The Spork Bytes Team</p>
        `,
  };
}
export function fridayOrderReminderTemplate(user: GenericUser) {
  return {
    to: user.email,
    from: process.env.SENDER_EMAIL as string,
    subject: `Have you placed your order for lunch next week?`,
    html: `
        <p>Hey there!</p>

        <p>
          <strong>
            Have you placed your order for lunch next week?
          </strong>
        </p>

        <p>Make your meal selections at www.sporkbox.app</p>

        <p>You must complete your selections by <strong>NOON TODAY</strong> to lock in your order!</p>

        <p>Thanks!</p>

        <p>- The Spork Bytes Team</p>
        `,
  };
}
