import { Router } from "express";
import Employee from "../models/Employee.js";
import Attendance from "../models/Attendance.js";
import LeaveRequest from "../models/LeaveRequest.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const employeeFilter = req.user.role === "employee" && req.user.employee
      ? { _id: req.user.employee._id }
      : req.user.role === "employee" ? { _id: null } : {};
    const attendanceFilter = req.user.role === "employee" && req.user.employee
      ? { employee: req.user.employee._id }
      : req.user.role === "employee" ? { employee: null } : {};
    const [totalEmployees, activeEmployees, pendingLeaves, todayAttendance, recentLeaves] = await Promise.all([
      Employee.countDocuments(employeeFilter),
      Employee.countDocuments({ ...employeeFilter, status: "Active" }),
      LeaveRequest.countDocuments({
        ...(req.user.role === "employee" ? attendanceFilter : {}),
        status: "Pending"
      }),
      Attendance.countDocuments({ ...attendanceFilter, date: new Date().toISOString().slice(0, 10) }),
      LeaveRequest.find(req.user.role === "employee" ? attendanceFilter : {})
        .populate("employee", "firstName lastName employeeId department")
        .sort({ createdAt: -1 })
        .limit(5)
    ]);
    res.json({ stats: { totalEmployees, activeEmployees, pendingLeaves, todayAttendance }, recentLeaves });
  })
);

export default router;
