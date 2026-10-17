import "dotenv/config";
import { connectDatabase } from "../config/db.js";
import User from "../models/User.js";

try {
  await connectDatabase();
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!name || !email || !password || password.length < 8) {
    throw new Error("Set ADMIN_NAME, ADMIN_EMAIL, and an ADMIN_PASSWORD of at least 8 characters in server/.env.");
  }
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`An account already exists for ${email}; no changes made.`);
  } else {
    await User.create({ name, email, password, role: "admin" });
    console.log(`Administrator created for ${email}.`);
  }
  process.exitCode = 0;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  const mongoose = await import("mongoose");
  await mongoose.default.disconnect();
}
