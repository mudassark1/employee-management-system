import { Router } from "express";
import { z } from "zod";
import LeaveRequest from "../models/LeaveRequest.js";
import { authenticate, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
const leaveInput = z.object({
  type: z.enum(["Annual leave", "Sick leave", "Personal leave", "Unpaid leave"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().trim().min(3).max(1000)
});

router.use(authenticate);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = {};
    if (req.user.role === "employee") {
      if (!req.user.employee) return res.json({ leaves: [] });
      query.employee = req.user.employee._id;
    }
    const leaves = await LeaveRequest.find(query)
      .populate("employee", "employeeId firstName lastName department")
      .populate("reviewedBy", "name")
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ leaves });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = leaveInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues.map((issue) => issue.message).join(" ") });
    }
    if (parsed.data.endDate < parsed.data.startDate) {
      return res.status(400).json({ message: "The end date must be on or after the start date." });
    }
    const employeeId = req.user.role === "employee" ? req.user.employee?._id : req.body.employeeId;
    if (!employeeId) return res.status(400).json({ message: "Link or select an employee profile first." });
    const leave = await LeaveRequest.create({ ...parsed.data, employee: employeeId });
    res.status(201).json({ leave });
  })
);

router.patch(
  "/:id/status",
  allowRoles("admin", "hr"),
  asyncHandler(async (req, res) => {
    const status = req.body.status;
    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be Approved or Rejected." });
    }
    const leave = await LeaveRequest.findByIdAndUpdate(
      req.params.id,
      { status, reviewedBy: req.user._id, reviewedAt: new Date() },
      { new: true, runValidators: true }
    ).populate("employee", "employeeId firstName lastName department");
    if (!leave) return res.status(404).json({ message: "Leave request not found." });
    res.json({ leave });
  })
);

export default router;
