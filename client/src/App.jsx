import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BriefcaseBusiness,
  CalendarDays, Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Coffee,
  Download, Ellipsis, FileText, LayoutDashboard, LogOut, Menu, Plus, Search,
  Settings2, ShieldCheck, Sparkles, Users, X, XCircle
} from "lucide-react";

const api = axios.create({ baseURL: "/api" });
const today = new Date().toISOString().slice(0, 10);
const initialEmployee = {
  employeeId: "", firstName: "", lastName: "", email: "", phone: "",
  department: "Engineering", position: "", employmentType: "Full-time",
  status: "Active", salary: "", startDate: today, accountPassword: ""
};
const navItems = [
  { id: "Overview", icon: LayoutDashboard },
  { id: "Employees", icon: Users },
  { id: "Attendance", icon: Clock3 },
  { id: "Leave", icon: CalendarDays }
];

function initials(first = "", last = "") {
  return `${first[0] || ""}${last[0] || ""}`.toUpperCase() || "U";
}

function fullName(employee) {
  return `${employee?.firstName || ""} ${employee?.lastName || ""}`.trim() || "Unknown employee";
}

function dateLabel(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

function timeLabel(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function currency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function apiErrorMessage(error, fallback) {
  if (typeof error.response?.data?.message === "string") return error.response.data.message;
  if (error.response?.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (!error.response) return "Could not reach the server. Check that the API is running and try again.";
  return fallback;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("peopleos_token"));
  const [user, setUser] = useState(null);
  const [section, setSection] = useState("Overview");
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [stats, setStats] = useState({});
  const [recentLeaves, setRecentLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All employees");

  const authConfig = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const isManager = user && ["admin", "hr"].includes(user.role);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [me, people, time, leaveData, dashboard] = await Promise.all([
        api.get("/auth/me", authConfig),
        api.get("/employees", authConfig),
        api.get("/attendance", authConfig),
        api.get("/leaves", authConfig),
        api.get("/dashboard", authConfig)
      ]);
      setUser(me.data.user);
      setEmployees(people.data.employees);
      setAttendance(time.data.attendance);
      setLeaves(leaveData.data.leaves);
      setStats(dashboard.data.stats);
      setRecentLeaves(dashboard.data.recentLeaves);
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.removeItem("peopleos_token");
        setToken(null);
        setUser(null);
      } else {
        notify(error.response?.data?.message || "Could not load your workspace.");
      }
    } finally {
      setLoading(false);
    }
  }, [token, authConfig]);

  useEffect(() => {
    if (token) loadData();
    else setLoading(false);
  }, [token, loadData]);

  function notify(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3600);
  }

  async function login(event) {
    event.preventDefault();
    setLoginError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await api.post("/auth/login", {
        email: form.get("email"),
        password: form.get("password")
      });
      localStorage.setItem("peopleos_token", response.data.token);
      setToken(response.data.token);
      setUser(response.data.user);
    } catch (error) {
      setLoginError(error.response?.data?.message || "Unable to sign in. Check that the API is running.");
    }
  }

  function logout() {
    localStorage.removeItem("peopleos_token");
    setToken(null);
    setUser(null);
    setSection("Overview");
  }

  async function submitEmployee(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.salary = Number(payload.salary || 0);
    if (!payload.accountPassword) delete payload.accountPassword;
    try {
      if (selectedEmployee) await api.patch(`/employees/${selectedEmployee._id}`, payload, authConfig);
      else await api.post("/employees", payload, authConfig);
      setModal("");
      setSelectedEmployee(null);
      await loadData();
      notify(selectedEmployee ? "Employee details updated." : "Employee added to your team.");
    } catch (error) {
      notify(error.response?.data?.message || "Could not save the employee.");
    }
  }

  async function deleteEmployee(employee) {
    if (!window.confirm(`Remove ${fullName(employee)} and their linked login account?`)) return;
    try {
      await api.delete(`/employees/${employee._id}`, authConfig);
      await loadData();
      notify("Employee removed.");
    } catch (error) {
      notify(error.response?.data?.message || "Could not remove the employee.");
    }
  }

  async function checkIn(employeeId) {
    try {
      await api.post("/attendance/check-in", employeeId ? { employeeId } : {}, authConfig);
      await loadData();
      notify("Check-in recorded. Have a great day!");
    } catch (error) {
      notify(error.response?.data?.message || "Could not record check-in.");
    }
  }

  async function checkOut(recordId) {
    try {
      await api.patch(`/attendance/${recordId}/check-out`, {}, authConfig);
      await loadData();
      notify("Check-out recorded.");
    } catch (error) {
      notify(error.response?.data?.message || "Could not record check-out.");
    }
  }

  async function submitLeave(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if (isManager && payload.employeeId) {
      const employeeId = payload.employeeId;
      delete payload.employeeId;
      payload.employeeId = employeeId;
    }
    try {
      await api.post("/leaves", payload, authConfig);
      setModal("");
      await loadData();
      notify("Leave request submitted.");
    } catch (error) {
      notify(error.response?.data?.message || "Could not submit the leave request.");
    }
  }

  async function reviewLeave(leaveId, status) {
    try {
      await api.patch(`/leaves/${leaveId}/status`, { status }, authConfig);
      await loadData();
      notify(`Request ${status.toLowerCase()}.`);
    } catch (error) {
      notify(error.response?.data?.message || "Could not update the request.");
    }
  }

  const visibleEmployees = useMemo(() => employees.filter((employee) => {
    const query = search.toLowerCase();
    const matchesSearch = [fullName(employee), employee.email, employee.department, employee.position, employee.employeeId]
      .some((value) => value?.toLowerCase().includes(query));
    return matchesSearch && (filter === "All employees" || employee.status === filter);
  }), [employees, search, filter]);

  const currentAttendance = attendance.find((item) => item.date === today &&
    item.employee?._id === user?.employee?._id);

  if (!token) return <Login onLogin={login} error={loginError} />;
  if (loading && !user) return <div className="loading-screen"><div className="loader" />Loading your workspace</div>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setSection("Overview"); }}>
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span>people<span className="brand-light">OS</span></span>
        </a>
        <div className="workspace-switch">
          <div className="workspace-logo">N</div>
          <div className="workspace-copy"><strong>Northstar Studio</strong><span>Workspace</span></div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-heading">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map(({ id, icon: Icon }) => (
            <button key={id} className={`nav-link ${section === id ? "active" : ""}`} onClick={() => setSection(id)}>
              <Icon size={18} strokeWidth={1.8} /><span>{id}</span>
              {id === "Leave" && stats.pendingLeaves > 0 && isManager && <span className="nav-count">{stats.pendingLeaves}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-help">
          <div className="help-icon"><CircleHelp size={17} /></div>
          <div><strong>Need a hand?</strong><span>Visit our help center</span></div>
          <ArrowRight size={15} />
        </div>
        <div className="sidebar-profile">
          <Avatar name={user?.name} color="#e8e8fb" />
          <div className="profile-copy"><strong>{user?.name}</strong><span>{user?.role || "Team member"}</span></div>
          <button className="icon-button subtle" title="Sign out" onClick={logout}><LogOut size={16} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><Sparkles size={17} /></span> people<span className="brand-light">OS</span></div>
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-divider">/</span><strong>{section}</strong></div>
          <div className="topbar-actions">
            <div className="today-label"><CalendarDays size={15} />{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button>
            <Avatar name={user?.name} color="#e8e8fb" small />
          </div>
        </header>

        <div className="page-content">
          {section === "Overview" && <Overview
            user={user} isManager={isManager} stats={stats} employees={employees}
            attendance={attendance} leaves={recentLeaves} currentAttendance={currentAttendance}
            onCheckIn={checkIn} onCheckOut={checkOut} setSection={setSection}
            onAddEmployee={() => { setSelectedEmployee(null); setModal("employee"); }}
            onRequestLeave={() => setModal("leave")} onReview={reviewLeave}
          />}
          {section === "Employees" && <EmployeesPage
            employees={visibleEmployees} allCount={employees.length} isManager={isManager}
            search={search} setSearch={setSearch} filter={filter} setFilter={setFilter}
            onAdd={() => { setSelectedEmployee(null); setModal("employee"); }}
            onEdit={(employee) => { setSelectedEmployee(employee); setModal("employee"); }}
            onDelete={deleteEmployee}
          />}
          {section === "Attendance" && <AttendancePage
            records={attendance} employees={employees} isManager={isManager}
            currentAttendance={currentAttendance} user={user}
            onCheckIn={checkIn} onCheckOut={checkOut}
          />}
          {section === "Leave" && <LeavePage
            leaves={leaves} employees={employees} isManager={isManager}
            onRequest={() => setModal("leave")} onReview={reviewLeave}
          />}
        </div>
      </main>
      {notice && <div className="toast"><CheckCircle2 size={17} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
      {modal === "employee" && <EmployeeModal
        employee={selectedEmployee} onClose={() => { setModal(""); setSelectedEmployee(null); }}
        onSubmit={submitEmployee} isAdmin={user?.role === "admin"}
      />}
      {modal === "leave" && <LeaveModal
        employees={employees} isManager={isManager} onClose={() => setModal("")} onSubmit={submitLeave}
      />}
    </div>
  );
}

function Login({ onLogin, error }) {
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState(() =>
    new URLSearchParams(window.location.search).has("resetToken") ? "reset" : "login"
  );
  const [email, setEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function requestReset(event) {
    event.preventDefault();
    setResetMessage("");
    setResetError("");
    setSubmitting(true);
    try {
      const response = await api.post("/auth/forgot-password", { email });
      setResetMessage(response.data.message);
    } catch (requestError) {
      setResetError(apiErrorMessage(requestError, "Could not request a password reset. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setResetMessage("");
    setResetError("");
    const form = new FormData(event.currentTarget);
    const password = form.get("newPassword");
    if (password !== form.get("confirmPassword")) {
      setResetError("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const token = new URLSearchParams(window.location.search).get("resetToken");
      const response = await api.post("/auth/reset-password", { token, password });
      window.history.replaceState({}, "", window.location.pathname);
      setResetMessage(response.data.message);
      setMode("login");
    } catch (requestError) {
      setResetError(apiErrorMessage(requestError, "Could not reset your password. Please request a new link."));
    } finally {
      setSubmitting(false);
    }
  }

  function backToLogin() {
    if (mode === "reset") window.history.replaceState({}, "", window.location.pathname);
    setMode("login");
    setResetError("");
    setResetMessage("");
  }

  const formHandler = mode === "forgot" ? requestReset : mode === "reset" ? resetPassword : onLogin;
  const title = mode === "forgot"
    ? "Reset your password"
    : mode === "reset" ? "Choose a new password" : "Sign in to your workspace";

  return (
    <main className="login-screen">
      <div className="login-art">
        <div className="login-art-top"><span className="brand-mark"><Sparkles size={19} /></span><span>people<span className="brand-light">OS</span></span></div>
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
        <div className="art-content">
          <div className="art-kicker"><span /> PEOPLE, IN SYNC</div>
          <h1>Good work<br />starts with<br /><em>great people.</em></h1>
          <p>One thoughtfully organized space for the people who make your business what it is.</p>
          <div className="art-people"><Avatar name="Maya Chen" color="#d8f2e5" /><Avatar name="Noah Williams" color="#ffe8ce" /><Avatar name="Amara Okafor" color="#e9ddfb" /><span>Made for teams like yours</span></div>
        </div>
        <span className="art-footnote">A calmer way to work together.</span>
      </div>
      <div className="login-panel">
        <div className="login-mobile-brand"><span className="brand-mark"><Sparkles size={18} /></span> people<span className="brand-light">OS</span></div>
        <form className="login-form" onSubmit={formHandler}>
          <div className="form-eyebrow">{mode === "login" ? "WELCOME BACK" : "ACCOUNT RECOVERY"}</div>
          <h2>{title}</h2>
          <p className="login-subtitle">
            {mode === "login" && "Your people operations, all in one place."}
            {mode === "forgot" && "Enter your work email and we’ll send you a secure reset link."}
            {mode === "reset" && "Choose a new password for your PeopleOS account."}
          </p>
          {mode !== "reset" && <>
            <label className="field-label" htmlFor="email">Work email</label>
            <div className="input-wrap"><input id="email" name="email" type="email" placeholder="you@company.com" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          </>}
          {mode === "login" && <>
            <div className="label-row"><label className="field-label" htmlFor="password">Password</label><button className="text-button" type="button" onClick={() => { setResetError(""); setResetMessage(""); setMode("forgot"); }}>Forgot password?</button></div>
            <div className="input-wrap password-wrap"><input id="password" name="password" type={showPassword ? "text" : "password"} placeholder="Enter your password" autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div>
          </>}
          {mode === "reset" && <>
            <label className="field-label" htmlFor="newPassword">New password</label>
            <div className="input-wrap"><input id="newPassword" name="newPassword" type="password" placeholder="At least 8 characters" autoComplete="new-password" minLength="8" maxLength="128" required /></div>
            <label className="field-label" htmlFor="confirmPassword">Confirm new password</label>
            <div className="input-wrap"><input id="confirmPassword" name="confirmPassword" type="password" placeholder="Enter your new password again" autoComplete="new-password" minLength="8" maxLength="128" required /></div>
          </>}
          {(error && mode === "login") && <div className="form-error" role="alert">{error}</div>}
          {resetError && <div className="form-error" role="alert">{resetError}</div>}
          {resetMessage && <div className="form-success" role="status">{resetMessage}</div>}
          <button className="button button-primary login-submit" type="submit" disabled={submitting}>
            {submitting ? "Please wait…" : mode === "login" ? "Sign in" : mode === "forgot" ? "Send reset link" : "Update password"}
            {!submitting && <ArrowRight size={17} />}
          </button>
          {mode !== "login" && <button className="back-to-login" type="button" onClick={backToLogin}><ArrowRight size={14} /> Back to sign in</button>}
          {mode === "login" && <div className="secure-note"><ShieldCheck size={15} /> Your information is encrypted and secure</div>}
        </form>
        <div className="login-footer"><span>© 2026 peopleOS</span><a href="#privacy" onClick={(e) => e.preventDefault()}>Privacy</a><a href="#terms" onClick={(e) => e.preventDefault()}>Terms</a></div>
      </div>
    </main>
  );
}

function Avatar({ name = "", color = "#e7eafe", small = false }) {
  const [first, ...rest] = name.split(" ");
  return <div className={`avatar ${small ? "avatar-small" : ""}`} style={{ background: color }}>{initials(first, rest.join(" "))}</div>;
}

function PageHeading({ eyebrow, title, description, children }) {
  return <div className="page-heading"><div><div className="page-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{children && <div className="heading-actions">{children}</div>}</div>;
}

function Overview({ user, isManager, stats, employees, attendance, leaves, currentAttendance, onCheckIn, onCheckOut, setSection, onAddEmployee, onRequestLeave, onReview }) {
  const deptStats = useMemo(() => {
    const count = employees.reduce((result, employee) => {
      result[employee.department] = (result[employee.department] || 0) + 1;
      return result;
    }, {});
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [employees]);
  const maxDepartment = Math.max(...deptStats.map(([, count]) => count), 1);
  const presentPercent = employees.length ? Math.round(((stats.todayAttendance || 0) / employees.length) * 100) : 0;
  const firstName = user?.name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return <>
    <PageHeading eyebrow="YOUR PEOPLE, AT A GLANCE" title={`${greeting}, ${firstName}!`} description="Here’s a little snapshot of how your team is doing today.">
      {isManager && <button className="button button-primary" onClick={onAddEmployee}><Plus size={17} /> Add employee</button>}
    </PageHeading>
    {isManager ? <div className="dashboard-grid">
      <div className="stat-card stat-primary">
        <div className="stat-top"><span>Total employees</span><span className="stat-icon"><Users size={18} /></span></div>
        <div className="stat-value">{stats.totalEmployees ?? 0}</div>
        <div className="stat-foot"><span className="trend-positive"><ArrowUpRight size={14} /> Team overview</span><span>All departments</span></div>
        <div className="stat-decoration">✳</div>
      </div>
      <div className="stat-card">
        <div className="stat-top"><span>Present today</span><span className="stat-icon mint"><Activity size={18} /></span></div>
        <div className="stat-value">{stats.todayAttendance ?? 0}<span className="stat-total"> / {stats.totalEmployees ?? 0}</span></div>
        <div className="progress-track"><span style={{ width: `${presentPercent}%` }} /></div>
        <div className="stat-foot"><span>{presentPercent}% attendance</span><span>Today</span></div>
      </div>
      <div className="stat-card">
        <div className="stat-top"><span>Active employees</span><span className="stat-icon lilac"><BriefcaseBusiness size={18} /></span></div>
        <div className="stat-value">{stats.activeEmployees ?? 0}</div>
        <div className="stat-foot"><span className="neutral-indicator"><span /> In good standing</span><span>Right now</span></div>
      </div>
      <div className="stat-card">
        <div className="stat-top"><span>Pending requests</span><span className="stat-icon peach"><CalendarDays size={18} /></span></div>
        <div className="stat-value">{stats.pendingLeaves ?? 0}</div>
        <button className="stat-link" onClick={() => setSection("Leave")}>Review requests <ArrowRight size={14} /></button>
        <div className="stat-foot"><span>Leave requests</span><span>This week</span></div>
      </div>

      <section className="panel department-panel">
        <div className="panel-heading"><div><h3>Your team</h3><p>People across each department</p></div><button className="text-link" onClick={() => setSection("Employees")}>View directory <ArrowRight size={14} /></button></div>
        {deptStats.length ? <div className="department-chart">{deptStats.map(([name, count], index) => (
          <div className="department-row" key={name}><div className={`department-dot color-${index}`} /><span className="department-name">{name}</span><div className="department-bar"><span className={`bar-fill fill-${index}`} style={{ width: `${(count / maxDepartment) * 100}%` }} /></div><strong>{count}</strong></div>
        ))}</div> : <div className="team-empty-state"><EmptyState title="Every great team starts somewhere" detail="Add your first teammate and their department will show up here." /><button className="button button-soft" onClick={onAddEmployee}><Plus size={16} /> Add your first teammate</button></div>}
      </section>
      <section className="panel attendance-panel">
        <div className="panel-heading"><div><h3>Attendance today</h3><p>A quick pulse on your team</p></div><button className="icon-button" aria-label="Attendance options"><Ellipsis size={19} /></button></div>
        <div className="attendance-summary"><div className="summary-ring" style={{ "--progress": `${presentPercent}%` }}><div><strong>{presentPercent}%</strong><span>present</span></div></div><div className="attendance-legend"><div><i className="legend-present" /><span>Checked in</span><strong>{stats.todayAttendance || 0}</strong></div><div><i className="legend-away" /><span>Not checked in</span><strong>{Math.max((stats.totalEmployees || 0) - (stats.todayAttendance || 0), 0)}</strong></div></div></div>
      </section>

      <section className="panel requests-panel">
        <div className="panel-heading"><div><h3>Recent leave requests</h3><p>Stay on top of time off</p></div><button className="text-link" onClick={() => setSection("Leave")}>See all <ArrowRight size={14} /></button></div>
        {leaves.length ? <div className="request-list">{leaves.slice(0, 4).map((leave) => <div className="request-item" key={leave._id}>
          <Avatar name={fullName(leave.employee)} color="#f4e8de" small />
          <div className="request-copy"><strong>{fullName(leave.employee)}</strong><span>{leave.type} · {dateLabel(leave.startDate, { month: "short", day: "numeric" })}</span></div>
          <StatusBadge status={leave.status} />
          {isManager && leave.status === "Pending" && <div className="inline-actions"><button title="Approve" onClick={() => onReview(leave._id, "Approved")}><Check size={15} /></button><button title="Reject" onClick={() => onReview(leave._id, "Rejected")}><X size={15} /></button></div>}
        </div>)}</div> : <EmptyState title="A clear calendar" detail="There are no leave requests to review right now." />}
      </section>
      <section className="panel quick-panel">
        <div className="panel-heading"><div><h3>Quick actions</h3><p>Get things moving</p></div><Sparkles size={18} className="quick-sparkle" /></div>
        <button className="quick-action" onClick={onAddEmployee}><span className="quick-action-icon lavender"><Users size={17} /></span><span><strong>Add a new teammate</strong><small>Create an employee profile</small></span><ArrowRight size={16} /></button>
        <button className="quick-action" onClick={() => setSection("Attendance")}><span className="quick-action-icon green"><Clock3 size={17} /></span><span><strong>View attendance</strong><small>Check today's time records</small></span><ArrowRight size={16} /></button>
      </section>
    </div> : <EmployeeOverview user={user} attendance={attendance} currentAttendance={currentAttendance} leaves={leaves} onCheckIn={onCheckIn} onCheckOut={onCheckOut} onRequestLeave={onRequestLeave} />}
  </>;
}

function EmployeeOverview({ user, attendance, currentAttendance, leaves, onCheckIn, onCheckOut, onRequestLeave }) {
  const hoursWorked = currentAttendance?.checkOut
    ? Math.max(0, (new Date(currentAttendance.checkOut) - new Date(currentAttendance.checkIn)) / 3600000).toFixed(1)
    : null;
  return <div className="employee-home">
    <section className="welcome-card"><div className="welcome-copy"><span className="welcome-tag"><Sparkles size={14} /> YOUR PERSONAL SPACE</span><h2>You're doing great work, {user?.name?.split(" ")[0]}.</h2><p>Keep your day in rhythm. Your attendance and time off are right here.</p></div><div className="welcome-decoration"><div className="welcome-orb orb-a" /><div className="welcome-orb orb-b" /><Coffee size={58} strokeWidth={1.2} /></div></section>
    <div className="employee-card-grid">
      <section className="panel punch-panel"><div className="panel-heading"><div><h3>Today's attendance</h3><p>{dateLabel(today)}</p></div><span className="today-pulse"><i /> TODAY</span></div>
        {currentAttendance ? <div className="punch-content"><div className="time-pair"><div><span>CHECKED IN</span><strong>{timeLabel(currentAttendance.checkIn)}</strong></div><ArrowRight size={18} /><div><span>CHECKED OUT</span><strong>{currentAttendance.checkOut ? timeLabel(currentAttendance.checkOut) : "Not yet"}</strong></div></div>{hoursWorked && <div className="hours-worked"><Clock3 size={15} /> {hoursWorked} hours worked today</div>}
          {!currentAttendance.checkOut && <button className="button button-secondary full-button" onClick={() => onCheckOut(currentAttendance._id)}>Check out <ArrowRight size={16} /></button>}</div>
          : <div className="punch-empty"><div className="punch-clock"><Clock3 size={26} /></div><p>You haven't checked in yet today.</p><button className="button button-primary" onClick={() => onCheckIn()}>Check in <ArrowRight size={16} /></button></div>}
      </section>
      <section className="panel my-leave-panel"><div className="panel-heading"><div><h3>My time off</h3><p>Your recent leave requests</p></div><button className="button button-soft button-small" onClick={onRequestLeave}><Plus size={15} /> Request leave</button></div>
        {leaves.length ? <div className="my-leave-list">{leaves.slice(0, 4).map((leave) => <div className="my-leave-item" key={leave._id}><div className="leave-date-icon"><CalendarDays size={17} /></div><div className="request-copy"><strong>{leave.type}</strong><span>{dateLabel(leave.startDate, { month: "short", day: "numeric" })} – {dateLabel(leave.endDate, { month: "short", day: "numeric" })}</span></div><StatusBadge status={leave.status} /></div>)}</div> : <EmptyState title="A little time for you" detail="Submit a leave request whenever you need one." />}
      </section>
      <section className="panel my-details"><div className="panel-heading"><div><h3>Your profile</h3><p>Your work details</p></div><span className="profile-check"><CheckCircle2 size={17} /></span></div>
        <div className="profile-detail-list"><div><span>Department</span><strong>{user?.employee?.department || "Not linked"}</strong></div><div><span>Position</span><strong>{user?.employee?.position || "Not linked"}</strong></div><div><span>Employee ID</span><strong>{user?.employee?.employeeId || "—"}</strong></div></div>
      </section>
    </div>
  </div>;
}

function EmployeesPage({ employees, allCount, isManager, search, setSearch, filter, setFilter, onAdd, onEdit, onDelete }) {
  return <>
    <PageHeading eyebrow="PEOPLE DIRECTORY" title="Your team" description={`${allCount} ${allCount === 1 ? "person" : "people"} making great things happen.`}>
      {isManager && <button className="button button-primary" onClick={onAdd}><Plus size={17} /> Add employee</button>}
    </PageHeading>
    <section className="panel directory-panel">
      <div className="directory-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, role or department..." /></div>
        <select className="select-control" value={filter} onChange={(event) => setFilter(event.target.value)}><option>All employees</option><option>Active</option><option>On leave</option><option>Inactive</option></select>
        <button className="button button-outline" onClick={() => {
          const csv = ["Employee ID,Name,Email,Department,Position,Status", ...employees.map((person) => [person.employeeId, fullName(person), person.email, person.department, person.position, person.status].map((value) => `"${String(value || "").replaceAll('"', '""')}"`).join(","))].join("\n");
          const link = document.createElement("a");
          link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
          link.download = "employee-directory.csv";
          link.click();
          URL.revokeObjectURL(link.href);
        }}><Download size={16} /> Export</button>
      </div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>EMPLOYEE</th><th>DEPARTMENT</th><th>POSITION</th><th>EMPLOYMENT</th><th>STATUS</th>{isManager && <th />}</tr></thead><tbody>
        {employees.map((employee, index) => <tr key={employee._id}><td><div className="employee-cell"><Avatar name={fullName(employee)} color={["#e4e8fb", "#fde9dd", "#e2f2e9", "#f2e6f6"][index % 4]} small /><span><strong>{fullName(employee)}</strong><small>{employee.email}</small></span></div></td><td><span className="department-chip">{employee.department}</span></td><td>{employee.position}</td><td>{employee.employmentType}</td><td><StatusBadge status={employee.status} /></td>{isManager && <td><div className="row-actions"><button title="Edit employee" onClick={() => onEdit(employee)}><Settings2 size={16} /></button><button title="Remove employee" onClick={() => onDelete(employee)}><X size={16} /></button></div></td>}</tr>)}
        {!employees.length && <tr><td colSpan={isManager ? 6 : 5}><EmptyState title="No employees found" detail={allCount ? "Try another search or filter." : "Add your first teammate to get started."} /></td></tr>}
      </tbody></table></div>
      <div className="table-footer"><span>Showing <strong>{employees.length}</strong> of <strong>{allCount}</strong> employees</span><span>Employee directory</span></div>
    </section>
  </>;
}

function AttendancePage({ records, employees, isManager, currentAttendance, user, onCheckIn, onCheckOut }) {
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const todayRecords = records.filter((record) => record.date === today);
  return <>
    <PageHeading eyebrow="TIME & PRESENCE" title="Attendance" description="A clear view of who's here and when.">
      {isManager ? <div className="heading-inline"><select className="select-control employee-select" value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)}><option value="">Select employee...</option>{employees.map((employee) => <option value={employee._id} key={employee._id}>{fullName(employee)}</option>)}</select><button className="button button-primary" disabled={!selectedEmployee} onClick={() => onCheckIn(selectedEmployee)}><Plus size={17} /> Record check-in</button></div>
        : currentAttendance && !currentAttendance.checkOut ? <button className="button button-primary" onClick={() => onCheckOut(currentAttendance._id)}>Check out <ArrowRight size={16} /></button> : !currentAttendance && <button className="button button-primary" onClick={() => onCheckIn()}><Plus size={17} /> Check in</button>}
    </PageHeading>
    <div className="attendance-overview-grid">
      <div className="attendance-highlight"><div className="highlight-icon"><Clock3 size={20} /></div><div><span>ON THE CLOCK TODAY</span><strong>{todayRecords.length} <small>of {employees.length} employees</small></strong></div><div className="highlight-decoration">✳</div></div>
      <div className="attendance-mini-card"><span>Still working</span><strong>{todayRecords.filter((record) => !record.checkOut).length}</strong><small><i className="status-dot-green" /> Active shifts</small></div>
      <div className="attendance-mini-card"><span>Completed shifts</span><strong>{todayRecords.filter((record) => record.checkOut).length}</strong><small><CheckCircle2 size={13} /> Checked out</small></div>
    </div>
    <section className="panel records-panel"><div className="panel-heading"><div><h3>Attendance records</h3><p>Most recent check-ins across your team</p></div><span className="records-date"><CalendarDays size={15} /> {dateLabel(today)}</span></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>EMPLOYEE</th><th>DATE</th><th>CHECK IN</th><th>CHECK OUT</th><th>HOURS</th><th>STATUS</th></tr></thead><tbody>
        {records.map((record) => {
          const hours = record.checkOut ? ((new Date(record.checkOut) - new Date(record.checkIn)) / 3600000).toFixed(1) : "—";
          return <tr key={record._id}><td><div className="employee-cell"><Avatar name={fullName(record.employee)} small /><span><strong>{fullName(record.employee)}</strong><small>{record.employee?.department || ""}</small></span></div></td><td>{dateLabel(record.date, { month: "short", day: "numeric", year: "numeric" })}</td><td>{timeLabel(record.checkIn)}</td><td>{timeLabel(record.checkOut)}</td><td>{hours === "—" ? hours : `${hours} hrs`}</td><td>{record.checkOut ? <StatusBadge status="Completed" /> : <StatusBadge status="Working" />}</td></tr>;
        })}
        {!records.length && <tr><td colSpan="6"><EmptyState title="No attendance yet" detail={isManager ? "Check-ins will appear here as your team starts their day." : "Your check-in history will appear here."} /></td></tr>}
      </tbody></table></div>
      <div className="table-footer"><span>Showing <strong>{records.length}</strong> recent records</span><span>Attendance uses the UTC calendar day</span></div>
    </section>
  </>;
}

function LeavePage({ leaves, employees, isManager, onRequest, onReview }) {
  const [view, setView] = useState("All");
  const pending = leaves.filter((leave) => leave.status === "Pending").length;
  const visibleLeaves = view === "Pending" ? leaves.filter((leave) => leave.status === "Pending") : leaves;
  return <>
    <PageHeading eyebrow="TIME TO RECHARGE" title={isManager ? "Leave management" : "My time off"} description={isManager ? "Review requests and help your team take the time they need." : "Plan a little breathing room. Your requests live here."}>
      <button className="button button-primary" onClick={onRequest}><Plus size={17} /> Request leave</button>
    </PageHeading>
    <div className="leave-stat-row"><div className="leave-stat-card"><span className="leave-stat-icon pending-icon"><Clock3 size={18} /></span><div><strong>{pending}</strong><small>Awaiting review</small></div></div><div className="leave-stat-card"><span className="leave-stat-icon approved-icon"><CheckCircle2 size={18} /></span><div><strong>{leaves.filter((leave) => leave.status === "Approved").length}</strong><small>Approved requests</small></div></div><div className="leave-stat-card"><span className="leave-stat-icon rejected-icon"><CalendarDays size={18} /></span><div><strong>{leaves.length}</strong><small>Total requests</small></div></div></div>
    <section className="panel leave-panel"><div className="panel-heading"><div><h3>Leave requests</h3><p>{isManager ? "Requests from across your team" : "Your submitted requests"}</p></div><div className="leave-filters"><button className={`filter-pill ${view === "All" ? "active" : ""}`} onClick={() => setView("All")}>All requests</button><button className={`filter-pill ${view === "Pending" ? "active" : ""}`} onClick={() => setView("Pending")}>{pending} pending</button></div></div>
      <div className="table-scroll"><table className="data-table leave-table"><thead><tr>{isManager && <th>EMPLOYEE</th>}<th>TIME OFF</th><th>DATES</th><th>DURATION</th><th>REASON</th><th>STATUS</th>{isManager && <th>ACTION</th>}</tr></thead><tbody>
        {visibleLeaves.map((leave) => {
          const days = Math.max(1, Math.round((new Date(leave.endDate) - new Date(leave.startDate)) / 86400000) + 1);
          return <tr key={leave._id}>{isManager && <td><div className="employee-cell"><Avatar name={fullName(leave.employee)} small /><span><strong>{fullName(leave.employee)}</strong><small>{leave.employee?.department || ""}</small></span></div></td>}<td><div className="leave-type"><span className={`leave-type-dot ${leave.type.toLowerCase().split(" ")[0]}`} />{leave.type}</div></td><td>{dateLabel(leave.startDate, { month: "short", day: "numeric" })} – {dateLabel(leave.endDate, { month: "short", day: "numeric", year: "numeric" })}</td><td>{days} {days === 1 ? "day" : "days"}</td><td className="reason-cell" title={leave.reason}>{leave.reason}</td><td><StatusBadge status={leave.status} /></td>{isManager && <td>{leave.status === "Pending" ? <div className="review-actions"><button className="approve-button" title="Approve" onClick={() => onReview(leave._id, "Approved")}><Check size={15} /></button><button className="reject-button" title="Reject" onClick={() => onReview(leave._id, "Rejected")}><X size={15} /></button></div> : <span className="reviewed-label">Reviewed</span>}</td>}</tr>;
        })}
        {!visibleLeaves.length && <tr><td colSpan={isManager ? 7 : 4}><EmptyState title={view === "Pending" ? "No pending requests" : "No leave requests yet"} detail={view === "Pending" ? "You're all caught up on leave approvals." : isManager ? "New requests from your team will show up here." : "When you request time off, you'll find it here."} /></td></tr>}
      </tbody></table></div>
      <div className="table-footer"><span><strong>{leaves.length}</strong> leave requests</span><span>{isManager ? `${employees.length} employees` : "Your leave history"}</span></div>
    </section>
  </>;
}

function StatusBadge({ status }) {
  const key = (status || "").toLowerCase().replaceAll(" ", "-");
  return <span className={`status-badge status-${key}`}><i />{status}</span>;
}

function EmptyState({ title, detail }) {
  return <div className="empty-state"><div className="empty-illustration"><FileText size={21} /></div><strong>{title}</strong><span>{detail}</span></div>;
}

function EmployeeModal({ employee, onClose, onSubmit, isAdmin }) {
  const [accountRole, setAccountRole] = useState("employee");
  return <Modal title={employee ? "Edit employee" : "Add a teammate"} subtitle={employee ? "Update their role and details." : "A little more about the person joining your team."} onClose={onClose}>
    <form className="modal-form" onSubmit={onSubmit}>
      <div className="form-grid">
        <Field label="First name"><input name="firstName" defaultValue={employee?.firstName} required maxLength="60" /></Field>
        <Field label="Last name"><input name="lastName" defaultValue={employee?.lastName} required maxLength="60" /></Field>
        <Field label="Work email"><input name="email" type="email" defaultValue={employee?.email} required /></Field>
        <Field label="Phone number"><input name="phone" defaultValue={employee?.phone} /></Field>
        <Field label="Employee ID"><input name="employeeId" defaultValue={employee?.employeeId} required /></Field>
        <Field label="Department"><input name="department" defaultValue={employee?.department} placeholder="e.g. Design" required /></Field>
        <Field label="Job title"><input name="position" defaultValue={employee?.position} placeholder="e.g. Product designer" required /></Field>
        <Field label="Employment type"><select name="employmentType" defaultValue={employee?.employmentType || "Full-time"}><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Intern</option></select></Field>
        <Field label="Start date"><input name="startDate" type="date" defaultValue={employee?.startDate?.slice(0, 10) || today} required /></Field>
        <Field label="Annual salary (USD)"><input name="salary" type="number" min="0" defaultValue={employee?.salary ?? ""} placeholder="0" /></Field>
        {employee && <Field label="Status"><select name="status" defaultValue={employee.status}><option>Active</option><option>On leave</option><option>Inactive</option></select></Field>}
        {!employee && isAdmin && <Field label="Account access"><select name="accountRole" value={accountRole} onChange={(event) => setAccountRole(event.target.value)}><option value="employee">Employee</option><option value="hr">HR manager</option></select></Field>}
        {!employee && <Field label="Login password" hint={accountRole === "hr" ? "Required to create an HR account." : "Optional. Leave blank to create a profile without login access."}><input name="accountPassword" type="password" minLength="8" required={accountRole === "hr"} placeholder="At least 8 characters" autoComplete="new-password" /></Field>}
      </div>
      <div className="modal-footer"><button className="button button-outline" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">{employee ? "Save changes" : "Add employee"} <ArrowRight size={15} /></button></div>
    </form>
  </Modal>;
}

function LeaveModal({ employees, isManager, onClose, onSubmit }) {
  return <Modal title="Request time off" subtitle="Take the time you need. We’ll keep your team in the loop." onClose={onClose}>
    <form className="modal-form" onSubmit={onSubmit}>
      {isManager && <Field label="Employee"><select name="employeeId" required defaultValue=""><option value="" disabled>Select employee</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{fullName(employee)}</option>)}</select></Field>}
      <Field label="Type of leave"><select name="type" defaultValue="Annual leave"><option>Annual leave</option><option>Sick leave</option><option>Personal leave</option><option>Unpaid leave</option></select></Field>
      <div className="form-grid"><Field label="First day"><input name="startDate" type="date" min={today} required /></Field><Field label="Last day"><input name="endDate" type="date" min={today} required /></Field></div>
      <Field label="A note for your manager"><textarea name="reason" rows="4" minLength="3" maxLength="1000" placeholder="Share a little context about your request..." required /></Field>
      <div className="modal-footer"><button className="button button-outline" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">Submit request <ArrowRight size={15} /></button></div>
    </form>
  </Modal>;
}

function Field({ label, hint, children }) {
  return <label className="field-label modal-field">{label}{children}{hint && <small>{hint}</small>}</label>;
}

function Modal({ title, subtitle, onClose, children }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div>{children}</section>
  </div>;
}

export default App;
