import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDatabase, supabase } from "../config/db.js";
import { throwIfError } from "../utils/records.js";

try {
  await connectDatabase();
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!name || !email || !password || password.length < 8) {
    throw new Error("Set ADMIN_NAME, ADMIN_EMAIL, and an ADMIN_PASSWORD of at least 8 characters in server/.env.");
  }
  const existing = throwIfError(await supabase.from("users").select("id").eq("email", email).maybeSingle());
  if (existing) {
    console.log(`An account already exists for ${email}; no changes made.`);
  } else {
    throwIfError(await supabase.from("users").insert({
      name,
      email,
      password_hash: await bcrypt.hash(password, 12),
      role: "admin"
    }));
    console.log(`Administrator created for ${email}.`);
  }
  process.exitCode = 0;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
