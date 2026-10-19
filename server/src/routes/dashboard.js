import { Router } from "express";
import { supabase } from "../config/db.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { fromRow } from "../utils/records.js";

const router = Router();
router.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const employeeId = req.user.role === "employee" ? req.user.employee?._id : null;
    const today = new Date().toISOString().slice(0, 10);
    let employeesQuery = supabase.from("employees").select("id", { count: "exact", head: true });
    let activeEmployeesQuery = supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "Active");
    let pendingLeavesQuery = supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "Pending");
    let todayAttendanceQuery = supabase.from("attendance").select("id", { count: "exact", head: true }).eq("date", today);
    let recentLeavesQuery = supabase.from("leave_requests")
      .select("*, employee:employees(id,employee_id,first_name,last_name,department)")
      .order("created_at", { ascending: false })
      .limit(5);

    if (req.user.role === "employee") {
      if (employeeId) {
        employeesQuery = employeesQuery.eq("id", employeeId);
        activeEmployeesQuery = activeEmployeesQuery.eq("id", employeeId);
        pendingLeavesQuery = pendingLeavesQuery.eq("employee_id", employeeId);
        todayAttendanceQuery = todayAttendanceQuery.eq("employee_id", employeeId);
        recentLeavesQuery = recentLeavesQuery.eq("employee_id", employeeId);
      } else {
        return res.json({
          stats: { totalEmployees: 0, activeEmployees: 0, pendingLeaves: 0, todayAttendance: 0 },
          recentLeaves: []
        });
      }
    }

    const [employeesResult, activeResult, pendingResult, attendanceResult, leavesResult] = await Promise.all([
      employeesQuery,
      activeEmployeesQuery,
      pendingLeavesQuery,
      todayAttendanceQuery,
      recentLeavesQuery
    ]);
    for (const result of [employeesResult, activeResult, pendingResult, attendanceResult, leavesResult]) {
      if (result.error) throw result.error;
    }
    res.json({
      stats: {
        totalEmployees: employeesResult.count || 0,
        activeEmployees: activeResult.count || 0,
        pendingLeaves: pendingResult.count || 0,
        todayAttendance: attendanceResult.count || 0
      },
      recentLeaves: fromRow(leavesResult.data)
    });
  })
);

export default router;
