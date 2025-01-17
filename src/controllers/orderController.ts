import { NextFunction, Request, Response } from "express";
import { TryCatch } from "../midlewares/error.js";
import { newOrderRequestBody } from "../types/types.js";
import { Order } from "../models/order.js";
import { invalidateCache, reduceStock } from "../utils/features.js";
import ErrorHandler from "../utils/utility-class.js";
import { myCache } from "../app.js";

export const newOrder = TryCatch(
  async (
    req: Request<{}, {}, newOrderRequestBody>,
    res: Response,
    next: NextFunction
  ) => {
    const {
      shippingInfo,
      orderItems,
      user,
      subTotal,
      tax,
      discount,
      total,
      shippingCharges,
    } = req.body;
    if (!shippingInfo || !orderItems || !user || !subTotal || !tax || !total)
      return next(new ErrorHandler("Please Enter All Fields", 400));

    const order = await Order.create({
      shippingInfo,
      orderItems,
      user,
      subTotal,
      discount,
      tax,
      shippingCharges,
      total,
    });

    await reduceStock(orderItems);
    await invalidateCache({
      product: true,
      order: true,
      admin: true,
      userId: user,
      productId: order.orderItems.map((i) => String(i.productId)),
    });
    return res.status(200).json({
      success: true,
      message: "order placed successfully",
    });
  }
);
export const myOrders = TryCatch(async (req, res, next) => {
  const { id: user } = req.query;
  let orders = [];

  if (myCache.has(`my-order-${user}`))
    orders = JSON.parse(myCache.get(`my-order-${user}`) as string);
  else {
    orders = await Order.find({ user });
    myCache.set(`my-order-${user}`, JSON.stringify(orders));
  }
  return res.status(200).json({
    success: true,
    orders,
  });
});
export const allOrders = TryCatch(async (req, res, next) => {
  const { id: user } = req.query;
  const key = `all-orders`;
  let orders = [];

  if (myCache.has(key)) orders = JSON.parse(myCache.get(key) as string);
  else {
    orders = await Order.find({ user }).populate("user", "name");
    myCache.set(key, JSON.stringify(orders));
  }
  return res.status(200).json({
    success: true,
    orders,
  });
});
export const getSingleOrder = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  const key = `order-${id}`;
  let order;

  if (myCache.has(key)) order = JSON.parse(myCache.get(key) as string);
  else {
    order = await Order.findById(id).populate("user", "name");

    if (!order) return next(new ErrorHandler("order not found", 404));
    myCache.set(key, JSON.stringify(order));
  }
  return res.status(200).json({
    success: true,
    order,
  });
});
export const processOrder = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  const order = await Order.findById(id);

  if (!order) return next(new ErrorHandler("order not found!!", 404));
  switch (order.status) {
    case "Processing":
      order.status = "Shipped";
      break;
    case "Shipped":
      order.status = "Delivered";
      break;

    default:
      order.status = "Delivered";
      break;
  }
  await order.save();
  await invalidateCache({
    product: false,
    order: true,
    admin: true,
    userId: order.user,
    orderId: String(order._id),
  });
  return res.status(201).json({
    success: true,
    message: "Order processed Successfully",
  });
});
export const deleteOrder = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  const order = await Order.findById(id);

  if (!order) return next(new ErrorHandler("order not found!!", 404));

  await order.deleteOne();

  await invalidateCache({
    product: false,
    order: true,
    admin: true,
    userId: order.user,
    orderId: String(order._id),
  });
  return res.status(201).json({
    success: true,
    message: "Order deleted Successfully",
  });
});
