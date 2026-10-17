import { Router } from "express";
import Attendance from "../models/Attendance.js";
import { authenticate, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(authenticate);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = {};
    if (req.user.role === "employee") {
      if (!req.user.employee) return res.json({ attendance: [] });
      query.employee = req.user.employee._id;
    }
    if (req.query.from || req.query.to) {
      query.date = {};
      if (req.query.from) query.date.$gte = String(req.query.from);
      if (req.query.to) query.date.$lte = String(req.query.to);
    }
    const attendance = await Attendance.find(query)
      .populate("employee", "employeeId firstName lastName department position")
      .sort({ date: -1, checkIn: -1 })
      .limit(200);
    res.json({ attendance });
  })
);

router.post(
  "/check-in",
  asyncHandler(async (req, res) => {
    const employeeId = req.user.role === "employee" ? req.user.employee?._id : req.body.employeeId;
    if (!employeeId) return res.status(400).json({ message: "Link an employee profile or select an employee first." });
    if (req.user.role !== "employee" && !["admin", "hr"].includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to record attendance." });
    }
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const existing = await Attendance.findOne({ employee: employeeId, date });
    if (existing) return res.status(409).json({ message: "Attendance has already been recorded for today." });
    const attendance = await Attendance.create({
      employee: employeeId,
      date,
      checkIn: now,
      note: req.body.note || ""
    });
    res.status(201).json({ attendance });
  })
);

router.patch(
  "/:id/check-out",
  asyncHandler(async (req, res) => {
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) return res.status(404).json({ message: "Attendance record not found." });
    if (req.user.role === "employee" && attendance.employee.toString() !== req.user.employee?._id.toString()) {
      return res.status(403).json({ message: "You can only check out your own attendance." });
    }
    if (attendance.checkOut) return res.status(409).json({ message: "This attendance record is already checked out." });
    attendance.checkOut = new Date();
    await attendance.save();
    res.json({ attendance });
  })
);

router.post(
  "/",
  allowRoles("admin", "hr"),
  asyncHandler(async (req, res) => {
    const { employeeId, date, checkIn, checkOut, note } = req.body;
    if (!employeeId || !date || !checkIn) {
      return res.status(400).json({ message: "Employee, date, and check-in time are required." });
    }
    const attendance = await Attendance.create({
      employee: employeeId,
      date,
      checkIn: new Date(checkIn),
      checkOut: checkOut ? new Date(checkOut) : null,
      note: note || ""
    });
    res.status(201).json({ attendance });
  })
);

export default router;
