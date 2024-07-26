import { Types } from 'mongoose';
import { subscriptions } from './lib/utils';

declare global {
  namespace Express {
    export interface Request {
      user?: UserSchema;
    }
  }
}

export interface GenericUser {
  email: string;
  firstName: string;
  lastName: string;
}

export interface Address {
  city: string;
  state: string;
  zip: string;
  addressLine1: string;
  addressLine2?: string;
}

export interface CompanyDetails {
  name: string;
  shift: string;
  website: string;
  code: string;
  shiftBudget: number;
}

export interface OrderCustomer extends GenericUser {
  _id: Types.ObjectId;
}

export interface OrderRestaurant {
  _id: Types.ObjectId;
  name: string;
}

export interface GenericItem {
  name: string;
  tags: string;
  image: string;
  description: string;
}

export interface OrderItem extends GenericItem {
  _id: Types.ObjectId;
  total: number;
  quantity: number;
  optionalAddons?: string;
  requiredAddons?: string;
  removedIngredients?: string;
}

export interface ItemSchema extends GenericItem {
  _id: Types.ObjectId;
  index: number;
  price: number;
  status: string;
  optionalAddons: Addons;
  requiredAddons: Addons;
  averageRating?: number;
  removableIngredients?: string;
  reviews: Types.DocumentArray<ReviewSchema>;
  soldOutStat?: Types.DocumentArray<SoldOutStatSchema>;
}

export interface OrderCompany {
  _id: Types.ObjectId;
  name: string;
  code: string;
  shift: string;
}

export interface OrderForEmail {
  _id: string;
  item: {
    name: string;
  };
  customer: GenericUser;
  restaurant: {
    name: string;
  };
}

export interface ReviewSchema {
  customer: Types.ObjectId;
  rating: number;
  comment: string;
  createdAt: Date;
}

export interface SoldOutStatSchema {
  date: Date;
  company: Types.ObjectId;
}

export interface Addons {
  addons: string;
  addable: number;
}

export interface SchedulesSchema {
  date: Date;
  status: string;
  createdAt: string;
  company: OrderCompany;
  deactivatedByAdmin?: boolean;
}

export interface RestaurantSchema {
  name: string;
  logo: string;
  address: Address;
  isFeatured: boolean;
  orderCapacity: number;
  items: Types.DocumentArray<ItemSchema>;
  schedules: Types.DocumentArray<SchedulesSchema>;
}

export interface UserSchema extends GenericUser {
  _id: Types.ObjectId;
  email: string;
  password: string;
  status: string;
  shifts: string[];
  companies: UserCompany[];
  restaurant: Types.ObjectId;
  subscribedTo: typeof subscriptions;
  role: 'ADMIN' | 'VENDOR' | 'CUSTOMER';
}

export interface FavRestaurantItem extends GenericItem {
  _id: Types.ObjectId;
  index: number;
  price: number;
  reviews: ReviewSchema[];
}

export interface OrdersPayload {
  orderItems: {
    itemId: string;
    quantity: number;
    companyId: string;
    restaurantId: string;
    deliveryDate: number;
    optionalAddons: string[];
    requiredAddons: string[];
    removedIngredients: string[];
  }[];
  discountCodeId: string;
}

export interface UserCompany extends CompanyDetails {
  _id: Types.ObjectId;
  address: Address;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface StatusChangePayload {
  action: string;
}

export type DiscountCodeSchema = {
  code: string;
  value: number;
  totalRedeem: number;
  redeemability: 'once' | 'unlimited';
};

export interface DateTotal {
  shift: string;
  date: number;
  total: number;
  companyId: string;
}

interface Restaurant {
  id: string;
  name: string;
}

export interface OrderStat {
  restaurant: Restaurant;
  quantity: number;
}

export interface ItemStat {
  restaurant: Restaurant;
  item: {
    id: string;
    name: string;
    quantity: number;
  };
}

export interface CompanySchema extends CompanyDetails {
  _id: Types.ObjectId;
  createdAt: Date;
  address: Address;
  status: 'ACTIVE' | 'ARCHIVED';
}

export type UpcomingDataMap = {
  [date: string]: {
    [company: string]: {
      [restaurant: string]: {
        orderCapacity: number;
        item: {
          [id: string]: {
            optionalAddons: {
              addons: string;
              addable: number;
            };
            requiredAddons: {
              addons: string;
              addable: number;
            };
            removableIngredients?: string;
          };
        };
      };
    };
  };
};

export type Discount = {
  _id: Types.ObjectId;
  code: string;
  value: number;
  distributed?: number;
};

export type InitialOrder = {
  customer: {
    _id: Types.ObjectId;
    firstName: string;
    lastName: string;
    email: string;
  };
  restaurant: {
    _id: Types.ObjectId;
    name: string;
  };
  company: {
    _id: Types.ObjectId;
    name: string;
    code: string;
    shift: string;
  };
  delivery: {
    date: number;
    address: {
      city: string;
      state: string;
      zip: string;
      addressLine1: string;
      addressLine2?: string;
    };
  };
  discount?: Discount;
  status: 'PENDING' | 'PROCESSING';
  item: {
    _id: Types.ObjectId;
    name: string;
    tags: string;
    description: string;
    quantity: number;
    image: string;
    optionalAddons: string;
    requiredAddons: string;
    removedIngredients: string;
    total: number;
  };
  pendingOrderId?: string;
  payment?: { distributed?: number };
};
