import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { supabase } from "../config/db.js";
import { authenticate, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { fromRow, throwIfError, toRow } from "../utils/records.js";

const router = Router();
const employeeInput = z.object({
  employeeId: z.string().trim().min(1).max(30),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().email().max(254),
  phone: z.string().trim().max(30).optional().default(""),
  department: z.string().trim().min(1).max(80),
  position: z.string().trim().min(1).max(100),
  employmentType: z.enum(["Full-time", "Part-time", "Contract", "Intern"]).default("Full-time"),
  status: z.enum(["Active", "On leave", "Inactive"]).default("Active"),
  salary: z.coerce.number().min(0).default(0),
  startDate: z.coerce.date(),
  accountPassword: z.string().min(8).max(128).optional(),
  accountRole: z.enum(["employee", "hr"]).default("employee")
});

router.use(authenticate);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    let query = supabase.from("employees").select("*").order("created_at", { ascending: false });
    if (req.user.role === "employee") {
      if (!req.user.employee) return res.json({ employees: [] });
      query = query.eq("id", req.user.employee._id);
    }
    const employees = fromRow(throwIfError(await query));
    res.json({ employees });
  })
);

router.post(
  "/",
  allowRoles("admin", "hr"),
  asyncHandler(async (req, res) => {
    const parsed = employeeInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues.map((issue) => issue.message).join(" ") });
    }
    const { accountPassword, accountRole, ...profile } = parsed.data;
    if (accountRole === "hr" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Only administrators can create HR accounts." });
    }
    if (accountRole === "hr" && !accountPassword) {
      return res.status(400).json({ message: "An HR account requires a login password." });
    }

    let userId;
    if (accountPassword) {
      const passwordHash = await bcrypt.hash(accountPassword, 12);
      const user = fromRow(throwIfError(await supabase.from("users").insert({
        name: `${profile.firstName} ${profile.lastName}`,
        email: profile.email.toLowerCase(),
        password_hash: passwordHash,
        role: accountRole
      }).select("*").single()));
      userId = user._id;
    }

    let employee;
    try {
      employee = fromRow(throwIfError(await supabase.from("employees").insert({
        ...toRow(profile),
        email: profile.email.toLowerCase(),
        employee_id: profile.employeeId.trim().toUpperCase(),
        user_id: userId || null
      }).select("*").single()));
    } catch (error) {
      if (userId) throwIfError(await supabase.from("users").delete().eq("id", userId));
      throw error;
    }
    res.status(201).json({ employee });
  })
);

router.patch(
  "/:id",
  allowRoles("admin", "hr"),
  asyncHandler(async (req, res) => {
    const parsed = employeeInput.omit({ accountPassword: true }).partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues.map((issue) => issue.message).join(" ") });
    }
    const updates = toRow(parsed.data);
    if (parsed.data.employeeId) updates.employee_id = parsed.data.employeeId.trim().toUpperCase();
    if (parsed.data.email) updates.email = parsed.data.email.toLowerCase();

    const employee = fromRow(throwIfError(await supabase.from("employees").update(updates)
      .eq("id", req.params.id).select("*").maybeSingle()));
    if (!employee) return res.status(404).json({ message: "Employee not found." });
    if (employee.user && (parsed.data.firstName || parsed.data.lastName || parsed.data.email)) {
      const userUpdate = {};
      if (parsed.data.firstName || parsed.data.lastName) {
        userUpdate.name = `${parsed.data.firstName || employee.firstName} ${parsed.data.lastName || employee.lastName}`;
      }
      if (parsed.data.email) userUpdate.email = parsed.data.email.toLowerCase();
      throwIfError(await supabase.from("users").update(userUpdate).eq("id", employee.user));
    }
    res.json({ employee });
  })
);

router.delete(
  "/:id",
  allowRoles("admin", "hr"),
  asyncHandler(async (req, res) => {
    const employee = fromRow(throwIfError(await supabase.from("employees").delete()
      .eq("id", req.params.id).select("*").maybeSingle()));
    if (!employee) return res.status(404).json({ message: "Employee not found." });
    if (employee.user) throwIfError(await supabase.from("users").delete().eq("id", employee.user));
    res.json({ message: "Employee and linked account removed." });
  })
);

export default router;
