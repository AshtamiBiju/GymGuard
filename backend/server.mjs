import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import * as jose from "jose";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3001);
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "mysql+mysqlconnector://root:Mysql%40123@localhost:3306/Access_Control_System";
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@gym.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123";
const GMAIL_USER = process.env.GMAIL_USER || "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || "";
const GMAIL_FROM_NAME = process.env.GMAIL_FROM_NAME || "GymGuard";
const SUBSCRIPTION_EMAIL_REMINDER_TYPE = "subscription_expiry_email";
const REMINDER_CHECK_INTERVAL_MINUTES = Number(process.env.REMINDER_CHECK_INTERVAL_MINUTES || 60);

function toMysqlUrl(url) {
  if (url.startsWith("mysql+mysqlconnector://")) {
    return `mysql://${url.slice("mysql+mysqlconnector://".length)}`;
  }
  return url;
}

function createPoolConfig(databaseUrl) {
  const parsed = new URL(toMysqlUrl(databaseUrl));
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    waitForConnections: true,
    connectionLimit: 10,
  };
}

const pool = mysql.createPool({
  ...createPoolConfig(DATABASE_URL),
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function createToken(userId) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new jose.SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getTomorrowDate() {
  return formatDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

function buildReminderMessage(name, expiryDate) {
  return `GymGuard: Hi ${name}, your gym subscription ends on ${expiryDate}. Please renew today to avoid access interruption.`;
}

function buildReminderEmailSubject(expiryDate) {
  return `GymGuard reminder: your subscription ends on ${expiryDate}`;
}

function buildReminderEmailHtml(name, expiryDate) {
  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h2 style="margin-bottom: 12px;">Subscription Reminder</h2>
      <p>Hi ${name},</p>
      <p>Your GymGuard subscription will end on <strong>${expiryDate}</strong>.</p>
      <p>Please renew today to avoid interruption to your gym access.</p>
      <p>Regards,<br />GymGuard</p>
    </div>
  `;
}

function normalizeUid(uid) {
  return String(uid || "")
    .trim()
    .replace(/[^a-fA-F0-9]/g, "")
    .toLowerCase();
}

function getTodayDateOnly() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateOnlyString(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.includes("T") ? value.slice(0, 10) : value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return null;
}

async function getMemberAccessDecisionByUserId(userId) {
  return getMemberAccessDecisionByUserIdWithFallback(userId);
}

async function getMemberAccessDecisionByUserIdWithFallback(userId, options = {}) {
  const rows = await query(
    `SELECT
       u.id,
       u.name,
       u.status AS account_status,
       m.expiry_date
     FROM users u
     LEFT JOIN membership m ON m.user_id = u.id
     WHERE u.id = ? AND u.role = 'member'
     LIMIT 1`,
    [userId],
  );

  if (!rows.length) {
    return null;
  }

  const member = rows[0];
  const expiry = toDateOnlyString(member.expiry_date || options.fallbackExpiryDate);
  const today = getTodayDateOnly();

  if (member.account_status !== "approved") {
    return {
      userId: member.id,
      name: options.fallbackName || member.name,
      status: "Unauthorized",
      reason: "Account not approved",
    };
  }

  if (!expiry || expiry < today) {
    return {
      userId: member.id,
      name: options.fallbackName || member.name,
      status: "Unauthorized",
      reason: "Membership expired",
    };
  }

  return {
    userId: member.id,
    name: options.fallbackName || member.name,
    status: "Authorized",
    reason: "Access granted",
  };
}

let rfidCardColumnCache = null;

async function getRfidCardColumns() {
  if (rfidCardColumnCache) {
    return rfidCardColumnCache;
  }

  const rows = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'rfid_card'`,
  );

  const columnNames = rows.map((row) => String(row.COLUMN_NAME).toLowerCase());
  const uidColumn =
    ["uid", "card_uid", "rfid_uid", "rfid_tag", "card_id"].find((name) => columnNames.includes(name)) || null;
  const userIdColumn =
    ["user_id", "member_id"].find((name) => columnNames.includes(name)) || null;
  const expiryDateColumn =
    ["expiry_date", "Expiry_Date", "expiration_date", "expiry", "valid_until"].find((name) =>
      columnNames.includes(String(name).toLowerCase()),
    ) || null;
  const nameColumn =
    ["name", "member_name", "cardholder_name"].find((name) => columnNames.includes(name)) || null;

  rfidCardColumnCache = { uidColumn, userIdColumn, expiryDateColumn, nameColumn };
  return rfidCardColumnCache;
}

async function getMemberAccessDecisionByUid(uid) {
  const normalizedUid = normalizeUid(uid);
  if (!normalizedUid) {
    return null;
  }

  const { uidColumn, userIdColumn, expiryDateColumn, nameColumn } = await getRfidCardColumns();
  if (!uidColumn || !userIdColumn) {
    throw new Error("rfid_card table must contain UID and user reference columns.");
  }

  const selectColumns = [`${userIdColumn} AS user_id`];
  if (expiryDateColumn) {
    selectColumns.push(`${expiryDateColumn} AS fallback_expiry_date`);
  }
  if (nameColumn) {
    selectColumns.push(`${nameColumn} AS fallback_name`);
  }

  const cardRows = await query(
    `SELECT ${selectColumns.join(", ")}
     FROM rfid_card
     WHERE LOWER(
       REPLACE(
         REPLACE(
           REPLACE(
             REPLACE(${uidColumn}, ' ', ''),
             '-',
             ''
           ),
           ':',
           ''
         ),
         '.',
         ''
       )
     ) = ?
     LIMIT 1`,
    [normalizedUid],
  );

  if (!cardRows.length) {
    return {
      userId: null,
      name: "Unknown card",
      status: "Unauthorized",
      reason: "Card not registered",
    };
  }

  return getMemberAccessDecisionByUserIdWithFallback(cardRows[0].user_id, {
    fallbackExpiryDate: cardRows[0].fallback_expiry_date,
    fallbackName: cardRows[0].fallback_name,
  });
}

async function createAccessLog(userId, status) {
  await query("INSERT INTO access_logs (user_id, status) VALUES (?, ?)", [userId, status]);
}

async function deleteRfidCardByUserId(userId) {
  const { userIdColumn } = await getRfidCardColumns();
  if (!userIdColumn) {
    return;
  }

  await query(`DELETE FROM rfid_card WHERE ${userIdColumn} = ?`, [userId]);
}

let mailTransporter;

function getMailTransporter() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error("Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.");
  }

  if (!mailTransporter) {
    mailTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });
  }

  return mailTransporter;
}

async function sendReminderEmail(to, name, expiryDate) {
  const transporter = getMailTransporter();
  const info = await transporter.sendMail({
    from: `"${GMAIL_FROM_NAME}" <${GMAIL_USER}>`,
    to,
    subject: buildReminderEmailSubject(expiryDate),
    text: buildReminderMessage(name, expiryDate),
    html: buildReminderEmailHtml(name, expiryDate),
  });

  return info.messageId || `${Date.now()}`;
}

async function claimNotification(userId, notificationType, targetDate) {
  const claimResult = await query(
    `INSERT IGNORE INTO notification_logs (user_id, notification_type, target_date)
     VALUES (?, ?, ?)`,
    [userId, notificationType, targetDate],
  );

  return Boolean(claimResult.affectedRows);
}

async function markNotificationSent(providerMessageId, userId, notificationType, targetDate) {
  await query(
    `UPDATE notification_logs
     SET provider_message_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND notification_type = ? AND target_date = ?`,
    [providerMessageId, userId, notificationType, targetDate],
  );
}

async function releaseNotification(userId, notificationType, targetDate) {
  await query(
    `DELETE FROM notification_logs
     WHERE user_id = ? AND notification_type = ? AND target_date = ?`,
    [userId, notificationType, targetDate],
  );
}

async function processSubscriptionReminders() {
  const targetDate = getTomorrowDate();

  const rows = await query(
    `SELECT u.id, u.name, u.email, m.expiry_date
     FROM users u
     JOIN membership m ON m.user_id = u.id
     WHERE u.role = 'member'
       AND u.status = 'approved'
       AND m.expiry_date = ?`,
    [targetDate],
  );

  const summary = {
    targetDate,
    checked: rows.length,
    email: { sent: 0, skipped: 0, failed: 0 },
  };

  for (const row of rows) {
    const emailClaimed = await claimNotification(row.id, SUBSCRIPTION_EMAIL_REMINDER_TYPE, row.expiry_date);
    if (!emailClaimed) {
      summary.email.skipped += 1;
    } else {
      try {
        const providerMessageId = await sendReminderEmail(
          row.email,
          row.name,
          formatDate(new Date(row.expiry_date)),
        );
        await markNotificationSent(providerMessageId, row.id, SUBSCRIPTION_EMAIL_REMINDER_TYPE, row.expiry_date);
        summary.email.sent += 1;
      } catch (error) {
        await releaseNotification(row.id, SUBSCRIPTION_EMAIL_REMINDER_TYPE, row.expiry_date);
        summary.email.failed += 1;
        console.error("Failed to send email subscription reminder", {
          userId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

  }

  return summary;
}

function startReminderScheduler() {
  const intervalMs = Math.max(1, REMINDER_CHECK_INTERVAL_MINUTES) * 60 * 1000;

  const runJob = async () => {
    try {
      const summary = await processSubscriptionReminders();
      console.log("Subscription reminder run", summary);
    } catch (error) {
      console.error("Subscription reminder scheduler failed", error);
    }
  };

  runJob();
  setInterval(runJob, intervalMs);
}

async function verifyToken(token) {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);
  if (!payload?.userId) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const rows = await query(
    "SELECT id, name, email, phone, role, status FROM users WHERE id = ?",
    [payload.userId],
  );

  if (!rows.length) {
    return res.status(401).json({ error: "User not found" });
  }

  req.user = rows[0];
  next();
}

function adminMiddleware(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

async function bootstrapDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      phone VARCHAR(40) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin','member') NOT NULL DEFAULT 'member',
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_email (email),
      INDEX idx_users_status (status),
      INDEX idx_users_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS membership (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      start_date DATE NULL,
      expiry_date DATE NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_membership_user_id (user_id),
      INDEX idx_membership_expiry (expiry_date),
      CONSTRAINT fk_membership_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS access_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      entry_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(30) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_access_logs_user_id (user_id),
      INDEX idx_access_logs_entry_time (entry_time),
      CONSTRAINT fk_access_logs_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS notification_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      notification_type VARCHAR(80) NOT NULL,
      target_date DATE NOT NULL,
      provider_message_id VARCHAR(120) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_notification_logs (user_id, notification_type, target_date),
      INDEX idx_notification_logs_target_date (target_date),
      CONSTRAINT fk_notification_logs_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS rfid_card (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      uid VARCHAR(64) NOT NULL UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_rfid_card_uid (uid),
      CONSTRAINT fk_rfid_card_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const existing = await query("SELECT id FROM users WHERE email = ? LIMIT 1", [ADMIN_EMAIL]);
  if (!existing.length) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await query(
      "INSERT INTO users (name, email, phone, password_hash, role, status) VALUES (?, ?, ?, ?, 'admin', 'approved')",
      ["Admin", ADMIN_EMAIL.toLowerCase(), "+1 000 000 0000", passwordHash],
    );
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await query("SELECT id FROM users WHERE email = ? LIMIT 1", [normalizedEmail]);
    if (existing.length) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    await query(
      "INSERT INTO users (name, email, phone, password_hash, role, status) VALUES (?, ?, ?, ?, 'member', 'pending')",
      [String(name).trim(), normalizedEmail, String(phone).trim(), passwordHash],
    );

    res.json({ message: "Registration submitted. Awaiting admin approval." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const rows = await query("SELECT * FROM users WHERE email = ? LIMIT 1", [
      String(email).toLowerCase().trim(),
    ]);
    if (!rows.length) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(String(password), user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = await createToken(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/admin/members", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const rows = await query(`
      SELECT
        u.id, u.name, u.email, u.phone, u.role, u.status, u.created_at,
        m.start_date, m.expiry_date
      FROM users u
      LEFT JOIN membership m ON u.id = m.user_id
      WHERE u.role = 'member'
      ORDER BY u.created_at DESC
    `);
    res.json({ members: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/pending", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const rows = await query(`
      SELECT id, name, email, phone, created_at
      FROM users
      WHERE role = 'member' AND status = 'pending'
      ORDER BY created_at DESC
    `);
    res.json({ pending: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/admin/approve/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid member id" });
    }

    await query(
      "UPDATE users SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = 'member'",
      [userId],
    );

    const now = new Date();
    const startDate = now.toISOString().slice(0, 10);
    const expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await query(
      `INSERT INTO membership (user_id, start_date, expiry_date)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         start_date = VALUES(start_date),
         expiry_date = VALUES(expiry_date),
         updated_at = CURRENT_TIMESTAMP`,
      [userId, startDate, expiryDate],
    );

    res.json({ message: "Member approved" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/admin/reject/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid member id" });
    }

    await query(
      "UPDATE users SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = 'member'",
      [userId],
    );
    res.json({ message: "Member rejected" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/admin/membership/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { expiry_date: expiryDate } = req.body || {};
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid member id" });
    }
    if (!expiryDate) {
      return res.status(400).json({ error: "Expiry date is required" });
    }

    await query(
      "UPDATE membership SET expiry_date = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
      [expiryDate, userId],
    );
    res.json({ message: "Membership updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/admin/notifications/subscription-reminders", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const summary = await processSubscriptionReminders();
    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/admin/members/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid member id" });
    }

    // Delete related records first for compatibility with schemas that don't have ON DELETE CASCADE.
    await query("DELETE FROM access_logs WHERE user_id = ?", [userId]);
    await query("DELETE FROM membership WHERE user_id = ?", [userId]);
    await deleteRfidCardByUserId(userId);

    const result = await query(
      "DELETE FROM users WHERE id = ? AND role = 'member'",
      [userId],
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: "Member not found" });
    }

    res.json({ message: "Member deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/access-logs", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const rows = await query(`
      SELECT
        a.id, a.user_id, a.entry_time, a.status,
        u.name, u.email
      FROM access_logs a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.entry_time DESC
      LIMIT 100
    `);
    res.json({ logs: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/stats", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const [totalRows, pendingRows, todayRows] = await Promise.all([
      query(`
        SELECT COUNT(*) AS count
        FROM users u
        JOIN membership m ON m.user_id = u.id
        WHERE u.role = 'member'
          AND u.status = 'approved'
          AND m.expiry_date >= CURDATE()
      `),
      query("SELECT COUNT(*) AS count FROM users WHERE role = 'member' AND status = 'pending'"),
      query("SELECT COUNT(*) AS count FROM access_logs WHERE DATE(entry_time) = CURDATE()"),
    ]);

    res.json({
      totalMembers: Number(totalRows[0]?.count || 0),
      pendingApprovals: Number(pendingRows[0]?.count || 0),
      todayEntries: Number(todayRows[0]?.count || 0),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/member/membership", authMiddleware, async (req, res) => {
  try {
    const rows = await query("SELECT start_date, expiry_date FROM membership WHERE user_id = ? LIMIT 1", [
      req.user.id,
    ]);
    res.json({ membership: rows[0] || null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/member/access-logs", authMiddleware, async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, entry_time, status
       FROM access_logs
       WHERE user_id = ?
       ORDER BY entry_time DESC
       LIMIT 50`,
      [req.user.id],
    );
    res.json({ logs: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/init/seed-admin", async (_req, res) => {
  try {
    const existing = await query("SELECT id FROM users WHERE email = ? LIMIT 1", [ADMIN_EMAIL]);
    if (existing.length) {
      return res.json({ message: "Admin already exists" });
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await query(
      "INSERT INTO users (name, email, phone, password_hash, role, status) VALUES (?, ?, ?, ?, 'admin', 'approved')",
      ["Admin", ADMIN_EMAIL.toLowerCase(), "+1 000 000 0000", passwordHash],
    );
    res.json({ message: "Admin account created", email: ADMIN_EMAIL });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/device/access", async (req, res) => {
  try {
    const uid = normalizeUid(req.query.uid);
    if (!uid) {
      return res.status(400).send("DENY:Missing UID");
    }

    const decision = await getMemberAccessDecisionByUid(uid);
    if (!decision) {
      return res.status(404).send("DENY:Member not found");
    }

    if (decision.userId) {
      await createAccessLog(decision.userId, decision.status);
    }

    if (decision.status === "Authorized") {
      return res.send(`ALLOW:${decision.name}`);
    }

    return res.status(403).send(`DENY:${decision.reason}`);
  } catch (error) {
    console.error(error);
    res.status(500).send("DENY:Server error");
  }
});

app.post("/api/access/entry/:userId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid member id" });
    }

    const decision = await getMemberAccessDecisionByUserId(userId);
    if (!decision) {
      return res.status(404).json({ error: "Member not found" });
    }

    await createAccessLog(userId, decision.status);
    res.json({ status: decision.status, message: decision.reason, name: decision.name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

bootstrapDatabase()
  .then(() => {
    startReminderScheduler();
    app.listen(PORT, () => {
      console.log(`GymGuard backend listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize backend:", error);
    process.exit(1);
  });
