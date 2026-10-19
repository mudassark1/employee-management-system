import { Router } from "express";
import { supabase } from "../config/db.js";
import { authenticate, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { fromRow, throwIfError } from "../utils/records.js";

const router = Router();
router.use(authenticate);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    let query = supabase.from("attendance")
      .select("*, employee:employees(id,employee_id,first_name,last_name,department,position)")
      .order("date", { ascending: false })
      .order("check_in", { ascending: false })
      .limit(200);
    if (req.user.role === "employee") {
      if (!req.user.employee) return res.json({ attendance: [] });
      query = query.eq("employee_id", req.user.employee._id);
    }
    if (req.query.from) query = query.gte("date", String(req.query.from));
    if (req.query.to) query = query.lte("date", String(req.query.to));
    const attendance = fromRow(throwIfError(await query));
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
    const existing = throwIfError(await supabase.from("attendance").select("id")
      .eq("employee_id", employeeId).eq("date", date).maybeSingle());
    if (existing) return res.status(409).json({ message: "Attendance has already been recorded for today." });
    const attendance = fromRow(throwIfError(await supabase.from("attendance").insert({
      employee_id: employeeId,
      date,
      check_in: now.toISOString(),
      note: req.body.note || ""
    }).select("*").single()));
    res.status(201).json({ attendance });
  })
);

router.patch(
  "/:id/check-out",
  asyncHandler(async (req, res) => {
    const row = throwIfError(await supabase.from("attendance").select("*")
      .eq("id", req.params.id).maybeSingle());
    if (!row) return res.status(404).json({ message: "Attendance record not found." });
    if (req.user.role === "employee" && row.employee_id !== req.user.employee?._id) {
      return res.status(403).json({ message: "You can only check out your own attendance." });
    }
    if (row.check_out) return res.status(409).json({ message: "This attendance record is already checked out." });
    const attendance = fromRow(throwIfError(await supabase.from("attendance").update({
      check_out: new Date().toISOString()
    }).eq("id", req.params.id).is("check_out", null)
      .select("*").maybeSingle()));
    if (!attendance) return res.status(409).json({ message: "This attendance record is already checked out." });
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
    const dateValue = new Date(`${date}T00:00:00.000Z`);
    const checkInValue = new Date(checkIn);
    const checkOutValue = checkOut ? new Date(checkOut) : null;
    if (
      Number.isNaN(dateValue.getTime()) ||
      dateValue.toISOString().slice(0, 10) !== date ||
      Number.isNaN(checkInValue.getTime()) ||
      (checkOutValue && Number.isNaN(checkOutValue.getTime()))
    ) {
      return res.status(400).json({ message: "Enter a valid attendance date and time." });
    }
    const attendance = fromRow(throwIfError(await supabase.from("attendance").insert({
      employee_id: employeeId,
      date,
      check_in: checkInValue.toISOString(),
      check_out: checkOutValue ? checkOutValue.toISOString() : null,
      note: note || ""
    }).select("*").single()));
    res.status(201).json({ attendance });
  })
);

export default router;
