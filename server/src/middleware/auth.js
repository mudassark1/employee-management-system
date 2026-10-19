import jwt from "jsonwebtoken";
import { supabase } from "../config/db.js";
import { fromRow, throwIfError } from "../utils/records.js";

export async function authenticate(req, res, next) {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) return res.status(401).json({ message: "Please sign in to continue." });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userRow = throwIfError(await supabase.from("users").select("*").eq("id", payload.sub).maybeSingle());
    const user = userRow && fromRow(userRow);
    if (!user) return res.status(401).json({ message: "Your account is no longer available." });
    user.employee = fromRow(throwIfError(
      await supabase.from("employees").select("*").eq("user_id", user._id).maybeSingle()
    ));
    if ((payload.sv ?? 0) !== user.sessionVersion) {
      return res.status(401).json({ message: "Your password has changed. Please sign in again." });
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Your session has expired. Please sign in again." });
    }
    next(error);
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action." });
    }
    next();
  };
}
