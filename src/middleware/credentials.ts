import { allowedOrigins } from "../utils";
import { NextFunction, Request, Response } from "express";

// Access control function
export default async function handler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Get the origin from headers
  const origin = req.headers.origin;

  // Check if the origin in allowed origins
  if (allowedOrigins.includes(origin as string)) {
    res.header("Access-Control-Allow-Credentials", "true");
  }

  // Call the next middleware
  next();
}
