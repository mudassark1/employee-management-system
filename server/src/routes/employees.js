import { Router } from "express";
import { z } from "zod";
import Employee from "../models/Employee.js";
import User from "../models/User.js";
import { authenticate, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

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
    const query = {};
    if (req.user.role === "employee") {
      if (!req.user.employee) return res.json({ employees: [] });
      query._id = req.user.employee._id;
    }
    const employees = await Employee.find(query).sort({ createdAt: -1 });
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
    let employee;
    if (accountPassword) {
      const user = await User.create({
        name: `${profile.firstName} ${profile.lastName}`,
        email: profile.email,
        password: accountPassword,
        role: accountRole
      });
      try {
        employee = await Employee.create({ ...profile, user: user._id });
        user.employee = employee._id;
        await user.save();
      } catch (error) {
        await User.findByIdAndDelete(user._id);
        throw error;
      }
    } else {
      employee = await Employee.create(profile);
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
    const employee = await Employee.findByIdAndUpdate(req.params.id, parsed.data, {
      new: true,
      runValidators: true
    });
    if (!employee) return res.status(404).json({ message: "Employee not found." });
    if (employee.user && (parsed.data.firstName || parsed.data.lastName || parsed.data.email)) {
      const userUpdate = {};
      if (parsed.data.firstName || parsed.data.lastName) {
        userUpdate.name = `${parsed.data.firstName || employee.firstName} ${parsed.data.lastName || employee.lastName}`;
      }
      if (parsed.data.email) userUpdate.email = parsed.data.email;
      await User.findByIdAndUpdate(employee.user, userUpdate, { runValidators: true });
    }
    res.json({ employee });
  })
);

router.delete(
  "/:id",
  allowRoles("admin", "hr"),
  asyncHandler(async (req, res) => {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ message: "Employee not found." });
    if (employee.user) await User.findByIdAndDelete(employee.user);
    res.json({ message: "Employee and linked account removed." });
  })
);

export default router;
