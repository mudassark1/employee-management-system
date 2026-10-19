import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { z } from "zod";
import { supabase } from "../config/db.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { fromRow, throwIfError } from "../utils/records.js";

const router = Router();
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128)
});
const emailSchema = z.object({ email: z.string().trim().email().max(254) });
const resetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  password: z.string().min(8).max(128)
});
const resetEmailMessage = "If an account exists for that email, password reset instructions will be sent shortly.";

function hashResetToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function getUserWithEmployee(userRow) {
  if (!userRow) return null;
  const user = fromRow(userRow);
  user.employee = fromRow(throwIfError(
    await supabase.from("employees").select("*").eq("user_id", user._id).maybeSingle()
  ));
  return user;
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    employee: user.employee
  };
}

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter a valid email and password." });

    const userRow = throwIfError(await supabase.from("users").select("*")
      .eq("email", parsed.data.email.toLowerCase()).maybeSingle());
    const user = await getUserWithEmployee(userRow);
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return res.status(401).json({ message: "Email or password is incorrect." });
    }

    const token = jwt.sign(
      { sub: user._id, sv: user.sessionVersion },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );
    res.json({ token, user: publicUser(user) });
  })
);

router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter a valid email address." });

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, CLIENT_URL } = process.env;
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM || !CLIENT_URL) {
      return res.status(503).json({
        message: "Password reset email is not configured. Please contact your administrator."
      });
    }
    let resetUrl;
    try {
      const clientOrigin = new URL(CLIENT_URL);
      if (!["https:", "http:"].includes(clientOrigin.protocol)) throw new Error("Unsupported client URL protocol.");
      resetUrl = new URL("/", clientOrigin);
    } catch {
      return res.status(503).json({
        message: "Password reset email is not configured correctly. Please contact your administrator."
      });
    }

    const user = throwIfError(await supabase.from("users").select("id,email")
      .eq("email", parsed.data.email.toLowerCase()).maybeSingle());
    if (!user) return res.json({ message: resetEmailMessage });

    const rawToken = randomBytes(32).toString("hex");
    const hashedToken = hashResetToken(rawToken);
    throwIfError(await supabase.from("users").update({
      reset_password_token: hashedToken,
      reset_password_expires: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    }).eq("id", user.id));

    resetUrl.searchParams.set("resetToken", rawToken);
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD }
    });

    try {
      await transporter.sendMail({
        from: SMTP_FROM,
        to: user.email,
        subject: "Reset your PeopleOS password",
        text: `A password reset was requested for your PeopleOS account. This link expires in one hour:\n\n${resetUrl.href}\n\nIf you did not request this, you can ignore this email.`,
        html: `<p>A password reset was requested for your PeopleOS account.</p><p><a href="${resetUrl.href}">Choose a new password</a></p><p>This link expires in one hour. If you did not request this, you can ignore this email.</p>`
      });
    } catch (error) {
      throwIfError(await supabase.from("users").update({
        reset_password_token: null,
        reset_password_expires: null
      }).eq("id", user.id).eq("reset_password_token", hashedToken));
      error.status = 503;
      error.message = "The reset email could not be sent. Please try again later or contact your administrator.";
      throw error;
    }

    res.json({ message: resetEmailMessage });
  })
);

router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Use a valid reset link and a password with at least 8 characters." });
    }

    const hashedToken = hashResetToken(parsed.data.token);
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = throwIfError(await supabase.from("users").select("id,session_version")
      .eq("reset_password_token", hashedToken)
      .gt("reset_password_expires", new Date().toISOString())
      .maybeSingle());
    if (!user) {
      return res.status(400).json({ message: "This password reset link is invalid or has expired. Request a new one." });
    }
    const updated = throwIfError(await supabase.from("users").update({
      password_hash: passwordHash,
      session_version: user.session_version + 1,
      reset_password_token: null,
      reset_password_expires: null
    }).eq("id", user.id).eq("reset_password_token", hashedToken)
      .gt("reset_password_expires", new Date().toISOString())
      .select("id"));
    if (!updated.length) {
      return res.status(400).json({ message: "This password reset link is invalid or has expired. Request a new one." });
    }
    res.json({ message: "Your password has been reset. Sign in with your new password." });
  })
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  })
);

export default router;
