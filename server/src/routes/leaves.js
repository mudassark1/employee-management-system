import { Router } from "express";
import { z } from "zod";
import { supabase } from "../config/db.js";
import { authenticate, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { fromRow, throwIfError } from "../utils/records.js";

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
    let query = supabase.from("leave_requests")
      .select("*, employee:employees(id,employee_id,first_name,last_name,department), reviewer:users!leave_requests_reviewed_by_fkey(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (req.user.role === "employee") {
      if (!req.user.employee) return res.json({ leaves: [] });
      query = query.eq("employee_id", req.user.employee._id);
    }
    const leaves = fromRow(throwIfError(await query)).map((leave) => {
      leave.reviewedBy = leave.reviewer;
      delete leave.reviewer;
      return leave;
    });
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
    const leave = fromRow(throwIfError(await supabase.from("leave_requests").insert({
      employee_id: employeeId,
      type: parsed.data.type,
      start_date: parsed.data.startDate.toISOString().slice(0, 10),
      end_date: parsed.data.endDate.toISOString().slice(0, 10),
      reason: parsed.data.reason
    }).select("*").single()));
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
    const leave = fromRow(throwIfError(await supabase.from("leave_requests").update({
      status,
      reviewed_by: req.user._id,
      reviewed_at: new Date().toISOString()
    }).eq("id", req.params.id)
      .select("*, employee:employees(id,employee_id,first_name,last_name,department)")
      .maybeSingle()));
    if (!leave) return res.status(404).json({ message: "Leave request not found." });
    res.json({ leave });
  })
);

export default router;
