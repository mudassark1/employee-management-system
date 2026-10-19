# PeopleOS — Employee Management System

A full-stack employee management starter built with React, Express, and Supabase Postgres. It includes protected sign-in, role-aware workspaces, employee records, attendance, leave requests, and an at-a-glance dashboard.

## Requirements

- Node.js 20.11 or newer
- A Supabase project

## Quick start

1. Create the environment file:

   ```powershell
   Copy-Item server\.env.example server\.env
   ```

2. In your Supabase project, open **SQL Editor** and run [`server/supabase/schema.sql`](server/supabase/schema.sql). Then edit `server\.env` with the Supabase project URL and its **service role key** (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`) and a unique `JWT_SECRET` of at least 32 characters. Keep the service role key secret and only use it on the backend. Set the initial admin name, email, and password as well. To enable forgot-password emails, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` with credentials from your email provider. `CLIENT_URL` must be the public web-app URL where users will reset their passwords. Do not use example credentials outside local development.

   For Gmail, enable 2-Step Verification and create a Google App Password (do not use your regular Gmail password), then set:

   ```dotenv
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=you@gmail.com
   SMTP_PASSWORD=your-google-app-password
   SMTP_FROM=PeopleOS <you@gmail.com>
   CLIENT_URL=http://localhost:5173
   ```

   Replace both email placeholders with your Gmail address and keep the App Password private. Restart the API after saving `server\.env`.

3. Install the root, API, and web app dependencies:

   ```powershell
   npm install
   npm install --prefix server
   npm install --prefix client
   ```

4. Create the first administrator:

   ```powershell
   npm run seed:admin --prefix server
   ```

5. Start the API and web app together:

   ```powershell
   npm run dev
   ```

6. Open [http://localhost:5173](http://localhost:5173) and sign in with the admin credentials configured in `server\.env`.

The API runs on `http://localhost:5000`; the Vite development server proxies `/api` requests to it. The API connects to Supabase using the backend service role key; Row Level Security is enabled for the application tables, so do not expose this key in frontend code.

## Features

- **Authentication:** JWT sessions, password hashing, role-based access for administrators, HR, and employees, plus rate-limited sign-in and one-hour, single-use password-reset links sent by email.
- **Employee directory:** Create, edit, search, filter, export, and remove employee profiles. New profiles can optionally receive an employee login account.
- **Dashboard:** Team and attendance summaries, department breakdown, pending leave requests, and shortcuts.
- **Attendance:** Employee self-service check-in/check-out and manager check-in recording. One record per employee per local calendar day.
- **Leave:** Submit leave requests, follow their status, and approve or reject requests as an administrator or HR user.
- **Responsive UI:** Desktop sidebar, mobile navigation, profile-aware employee workspace, and accessible forms.

## API overview

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | Public | Sign in and receive a JWT |
| `POST` | `/api/auth/forgot-password` | Public | Email a password-reset link |
| `POST` | `/api/auth/reset-password` | Public | Set a new password using a reset token |
| `GET` | `/api/auth/me` | Signed in | Get current account |
| `GET`, `POST`, `PATCH`, `DELETE` | `/api/employees` | Signed in; writes admin/HR | Manage or view employee profiles |
| `GET` | `/api/attendance` | Signed in | List attendance records |
| `POST` | `/api/attendance/check-in` | Signed in | Check in, or manager records an employee |
| `PATCH` | `/api/attendance/:id/check-out` | Signed in | Check out |
| `POST` | `/api/attendance` | Admin/HR | Add an attendance record |
| `GET`, `POST` | `/api/leaves` | Signed in | List and submit leave requests |
| `PATCH` | `/api/leaves/:id/status` | Admin/HR | Approve or reject a request |
| `GET` | `/api/dashboard` | Signed in | Load dashboard summaries |
| `GET` | `/api/health` | Public | API health check |

## Notes

- An employee account is created from **Add employee** by entering a login password. Without one, the employee has a directory profile but cannot sign in.
- From the sign-in screen, **Forgot password?** emails a single-use reset link when SMTP is configured. Reset tokens are stored hashed, expire after one hour, and a successful reset signs out the account's existing sessions. If SMTP is not configured, the app tells the user to contact an administrator.
- Employee accounts can only see their linked employee profile, attendance, and leave requests. Admin and HR accounts can manage the full team. Administrators can create HR login accounts from **Add employee**.
- The initial admin seed command is idempotent: it will not overwrite an account that already exists. Attendance date keys use the UTC calendar day.
- Before production use, set strong secrets, configure production CORS origins, use HTTPS, and add a deployment-specific environment configuration.
