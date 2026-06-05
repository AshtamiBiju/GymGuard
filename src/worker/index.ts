import { Hono } from "hono";
import { cors } from "hono/cors";
import bcrypt from "bcryptjs";
import * as jose from "jose";

// Env type definition
type Env = {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  JWT_SECRET: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_TEMPLATE_NAME?: string;
  WHATSAPP_TEMPLATE_LANGUAGE_CODE?: string;
};

type AuthenticatedUser = {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
};

type Variables = {
  user: AuthenticatedUser;
};

type LoginUser = AuthenticatedUser & {
  password_hash: string;
};

type CountRow = {
  count: number;
};

type MembershipRow = {
  expiry_date: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", cors());

const SUBSCRIPTION_WHATSAPP_REMINDER_TYPE = "subscription_expiry_whatsapp";

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getTomorrowDate(): string {
  return formatDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

function buildReminderMessage(name: string, expiryDate: string): string {
  return `GymGuard: Hi ${name}, your gym subscription ends on ${expiryDate}. Please renew today to avoid access interruption.`;
}

function normalizePhoneForWhatsApp(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function sendSms(env: Env, to: string, body: string): Promise<string> {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_TEMPLATE_NAME) {
    throw new Error("WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_TEMPLATE_NAME.");
  }

  const response = await fetch(`https://graph.facebook.com/v23.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhoneForWhatsApp(to),
      type: "template",
      template: {
        name: env.WHATSAPP_TEMPLATE_NAME,
        language: {
          code: env.WHATSAPP_TEMPLATE_LANGUAGE_CODE || "en_US",
        },
        components: [
          {
            type: "body",
            parameters: body.split("|").map((value) => ({
              type: "text",
              text: value,
            })),
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp request failed: ${response.status} ${errorText}`);
  }

  const result = await response.json() as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  };

  const messageId = result.messages?.[0]?.id;
  if (!messageId) {
    throw new Error(result.error?.message || "WhatsApp returned no message id");
  }

  return messageId;
}

async function claimNotification(env: Env, userId: number, type: string, targetDate: string) {
  const claimResult = await env.DB.prepare(
    `
      INSERT OR IGNORE INTO notification_logs (user_id, notification_type, target_date)
      VALUES (?, ?, ?)
    `,
  ).bind(userId, type, targetDate).run();

  return (claimResult.meta?.changes ?? 0) > 0;
}

async function markNotificationSent(
  env: Env,
  providerMessageId: string,
  userId: number,
  type: string,
  targetDate: string,
) {
  await env.DB.prepare(
    `
      UPDATE notification_logs
      SET provider_message_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND notification_type = ? AND target_date = ?
    `,
  ).bind(providerMessageId, userId, type, targetDate).run();
}

async function releaseNotification(env: Env, userId: number, type: string, targetDate: string) {
  await env.DB.prepare(
    `
      DELETE FROM notification_logs
      WHERE user_id = ? AND notification_type = ? AND target_date = ?
    `,
  ).bind(userId, type, targetDate).run();
}

async function processSubscriptionReminders(env: Env) {
  const targetDate = getTomorrowDate();

  const { results } = await env.DB.prepare(
    `
      SELECT u.id, u.name, u.phone, m.expiry_date
      FROM users u
      JOIN membership m ON m.user_id = u.id
      WHERE u.role = 'member'
        AND u.status = 'approved'
        AND m.expiry_date = ?
    `,
  ).bind(targetDate).all();

  const summary = {
    targetDate,
    checked: results.length,
    whatsapp: { sent: 0, skipped: 0, failed: 0 },
  };

  for (const result of results as Array<{ id: number; name: string; phone: string; expiry_date: string }>) {
    const whatsappClaimed = await claimNotification(env, result.id, SUBSCRIPTION_WHATSAPP_REMINDER_TYPE, result.expiry_date);
    if (!whatsappClaimed) {
      summary.whatsapp.skipped += 1;
    } else {
      try {
        const providerMessageId = await sendSms(
          env,
          result.phone,
          `${result.name}|${result.expiry_date}`,
        );
        await markNotificationSent(env, providerMessageId, result.id, SUBSCRIPTION_WHATSAPP_REMINDER_TYPE, result.expiry_date);
        summary.whatsapp.sent += 1;
      } catch (error) {
        await releaseNotification(env, result.id, SUBSCRIPTION_WHATSAPP_REMINDER_TYPE, result.expiry_date);
        summary.whatsapp.failed += 1;
        console.error("Failed to send WhatsApp subscription reminder", {
          userId: result.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return summary;
}

// Helper to create JWT
async function createToken(userId: number, env: Env): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return await new jose.SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret);
}

// Helper to verify JWT
async function verifyToken(token: string, env: Env): Promise<{ userId: number } | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    return { userId: payload.userId as number };
  } catch {
    return null;
  }
}

// Auth middleware
async function authMiddleware(
  c: {
    req: { header: (name: string) => string | undefined };
    env: Env;
    json: (body: unknown, status?: number) => Response;
    set: (key: "user", value: AuthenticatedUser) => void;
  },
  next: () => Promise<void>,
) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env);
  
  if (!payload) {
    return c.json({ error: "Invalid token" }, 401);
  }
  
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, email, phone, role, status FROM users WHERE id = ?"
  ).bind(payload.userId).all();
  
  if (results.length === 0) {
    return c.json({ error: "User not found" }, 401);
  }
  
  c.set("user", results[0] as AuthenticatedUser);
  await next();
}

// Admin middleware
async function adminMiddleware(
  c: {
    get: (key: "user") => AuthenticatedUser;
    json: (body: unknown, status?: number) => Response;
  },
  next: () => Promise<void>,
) {
  const user = c.get("user");
  if (user.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }
  await next();
}

// ==================== AUTH ROUTES ====================

const nameRegex = /^[A-Za-z\s]+$/;
const phoneRegex = /^\+\d{1,3}\s\d{10}$/;
const passwordRegex = /^(?=.*[A-Za-z])(?=.*[^A-Za-z0-9]).{6,}$/;

// Register new member
app.post("/api/auth/register", async (c) => {
  const body = await c.req.json();
  const { name, email, phone, password } = body;

  if (!name || !email || !phone || !password) {
    return c.json({ error: "All fields are required" }, 400);
  }

  const normalizedName = String(name).trim().replace(/\s+/g, " ");
  const normalizedPhone = String(phone).trim();

  if (!nameRegex.test(normalizedName)) {
    return c.json({ error: "Name should contain only letters and spaces" }, 400);
  }

  if (!phoneRegex.test(normalizedPhone)) {
    return c.json({ error: "Phone number must include a country code and exactly 10 digits" }, 400);
  }

  if (!passwordRegex.test(String(password))) {
    return c.json({ error: "Password must be at least 6 characters and include letters and a special character" }, 400);
  }

  // Check if email already exists
  const { results: existing } = await c.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?"
  ).bind(email.toLowerCase()).all();

  if (existing.length > 0) {
    return c.json({ error: "Email already registered" }, 400);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await c.env.DB.prepare(
    "INSERT INTO users (name, email, phone, password_hash, role, status) VALUES (?, ?, ?, ?, 'member', 'pending')"
  ).bind(normalizedName, email.toLowerCase(), normalizedPhone, passwordHash).run();

  return c.json({ message: "Registration submitted. Awaiting admin approval." });
});

// Login
app.post("/api/auth/login", async (c) => {
  const body = await c.req.json();
  const { email, password } = body;

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM users WHERE email = ?"
  ).bind(email.toLowerCase()).all();

  if (results.length === 0) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const user = results[0] as LoginUser;
  const validPassword = await bcrypt.compare(password, user.password_hash);

  if (!validPassword) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await createToken(user.id, c.env);

  return c.json({
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
});

// Get current user
app.get("/api/auth/me", authMiddleware, async (c) => {
  const user = c.get("user");
  return c.json({ user });
});

// ==================== ADMIN ROUTES ====================

// Get all members (with membership info)
app.get("/api/admin/members", authMiddleware, adminMiddleware, async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT 
      u.id, u.name, u.email, u.phone, u.role, u.status, u.created_at,
      m.start_date, m.expiry_date
    FROM users u
    LEFT JOIN membership m ON u.id = m.user_id
    WHERE u.role = 'member'
    ORDER BY u.created_at DESC
  `).all();

  return c.json({ members: results });
});

// Get pending registrations
app.get("/api/admin/pending", authMiddleware, adminMiddleware, async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT id, name, email, phone, created_at
    FROM users
    WHERE role = 'member' AND status = 'pending'
    ORDER BY created_at DESC
  `).all();

  return c.json({ pending: results });
});

// Approve member
app.post("/api/admin/approve/:id", authMiddleware, adminMiddleware, async (c) => {
  const userId = parseInt(c.req.param("id"));
  
  // Update user status
  await c.env.DB.prepare(
    "UPDATE users SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = 'member'"
  ).bind(userId).run();

  // Create membership with 30 days from today
  const startDate = new Date().toISOString().split("T")[0];
  const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  await c.env.DB.prepare(`
    INSERT INTO membership (user_id, start_date, expiry_date)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET 
      start_date = excluded.start_date,
      expiry_date = excluded.expiry_date,
      updated_at = CURRENT_TIMESTAMP
  `).bind(userId, startDate, expiryDate).run();

  return c.json({ message: "Member approved" });
});

// Reject member
app.post("/api/admin/reject/:id", authMiddleware, adminMiddleware, async (c) => {
  const userId = parseInt(c.req.param("id"));
  
  await c.env.DB.prepare(
    "UPDATE users SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = 'member'"
  ).bind(userId).run();

  return c.json({ message: "Member rejected" });
});

// Update membership expiry
app.put("/api/admin/membership/:id", authMiddleware, adminMiddleware, async (c) => {
  const userId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const { expiry_date } = body;

  if (!expiry_date) {
    return c.json({ error: "Expiry date is required" }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE membership SET expiry_date = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
  `).bind(expiry_date, userId).run();

  return c.json({ message: "Membership updated" });
});

app.post("/api/admin/notifications/subscription-reminders", authMiddleware, adminMiddleware, async (c) => {
  const summary = await processSubscriptionReminders(c.env);
  return c.json(summary);
});

// Delete member
app.delete("/api/admin/members/:id", authMiddleware, adminMiddleware, async (c) => {
  const userId = parseInt(c.req.param("id"));

  if (!Number.isInteger(userId) || userId <= 0) {
    return c.json({ error: "Invalid member id" }, 400);
  }

  // D1 schema in this project has no FK constraints, so delete related rows explicitly.
  await c.env.DB.prepare("DELETE FROM access_logs WHERE user_id = ?").bind(userId).run();
  await c.env.DB.prepare("DELETE FROM membership WHERE user_id = ?").bind(userId).run();
  const deleteResult = await c.env.DB.prepare(
    "DELETE FROM users WHERE id = ? AND role = 'member'"
  ).bind(userId).run();

  if (!deleteResult.success || (deleteResult.meta?.changes ?? 0) === 0) {
    return c.json({ error: "Member not found" }, 404);
  }

  return c.json({ message: "Member deleted" });
});

// Get all access logs (admin view)
app.get("/api/admin/access-logs", authMiddleware, adminMiddleware, async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT 
      a.id, a.user_id, a.entry_time, a.status,
      u.name, u.email
    FROM access_logs a
    JOIN users u ON a.user_id = u.id
    ORDER BY a.entry_time DESC
    LIMIT 100
  `).all();

  return c.json({ logs: results });
});

// Get dashboard stats
app.get("/api/admin/stats", authMiddleware, adminMiddleware, async (c) => {
  const { results: totalMembers } = await c.env.DB.prepare(
    `
      SELECT COUNT(*) as count
      FROM users u
      JOIN membership m ON m.user_id = u.id
      WHERE u.role = 'member'
        AND u.status = 'approved'
        AND m.expiry_date >= ?
    `
  ).bind(new Date().toISOString().split("T")[0]).all();

  const { results: pendingCount } = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM users WHERE role = 'member' AND status = 'pending'"
  ).all();

  const today = new Date().toISOString().split("T")[0];
  const { results: todayEntries } = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM access_logs WHERE DATE(entry_time) = ?"
  ).bind(today).all();

  return c.json({
    totalMembers: (totalMembers[0] as CountRow).count,
    pendingApprovals: (pendingCount[0] as CountRow).count,
    todayEntries: (todayEntries[0] as CountRow).count,
  });
});

// ==================== MEMBER ROUTES ====================

// Get own membership info
app.get("/api/member/membership", authMiddleware, async (c) => {
  const user = c.get("user");
  
  const { results } = await c.env.DB.prepare(
    "SELECT start_date, expiry_date FROM membership WHERE user_id = ?"
  ).bind(user.id).all();

  if (results.length === 0) {
    return c.json({ membership: null });
  }

  return c.json({ membership: results[0] });
});

// Get own access logs
app.get("/api/member/access-logs", authMiddleware, async (c) => {
  const user = c.get("user");
  
  const { results } = await c.env.DB.prepare(`
    SELECT id, entry_time, status
    FROM access_logs
    WHERE user_id = ?
    ORDER BY entry_time DESC
    LIMIT 50
  `).bind(user.id).all();

  return c.json({ logs: results });
});

// ==================== INITIALIZATION ====================

// Seed admin account (idempotent)
app.post("/api/init/seed-admin", async (c) => {
  const adminEmail = "admin@gym.com";
  
  // Check if admin already exists
  const { results } = await c.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?"
  ).bind(adminEmail).all();

  if (results.length > 0) {
    return c.json({ message: "Admin already exists" });
  }

  // Hash the password Admin@123
  const passwordHash = await bcrypt.hash("Admin@123", 10);

  await c.env.DB.prepare(
    "INSERT INTO users (name, email, phone, password_hash, role, status) VALUES (?, ?, ?, ?, 'admin', 'approved')"
  ).bind("Admin", adminEmail, "+1 000 000 0000", passwordHash).run();

  return c.json({ message: "Admin account created", email: adminEmail });
});

// ==================== ACCESS SIMULATION ====================

// Simulate gym entry (creates access log)
app.post("/api/access/entry/:userId", async (c) => {
  const userId = parseInt(c.req.param("userId"));

  // Check if user exists and is approved
  const { results: userResults } = await c.env.DB.prepare(
    "SELECT id, status FROM users WHERE id = ? AND role = 'member'"
  ).bind(userId).all();

  if (userResults.length === 0) {
    return c.json({ error: "Member not found" }, 404);
  }

  const user = userResults[0] as Pick<AuthenticatedUser, "id" | "status">;
  
  // Check membership validity
  const { results: membershipResults } = await c.env.DB.prepare(
    "SELECT expiry_date FROM membership WHERE user_id = ?"
  ).bind(userId).all();

  let status = "Unauthorized";
  
  if (user.status === "approved" && membershipResults.length > 0) {
    const membership = membershipResults[0] as MembershipRow;
    const today = new Date().toISOString().split("T")[0];
    
    if (membership.expiry_date >= today) {
      status = "Authorized";
    }
  }

  // Log the access attempt
  await c.env.DB.prepare(
    "INSERT INTO access_logs (user_id, status) VALUES (?, ?)"
  ).bind(userId, status).run();

  return c.json({ status, message: `Access ${status.toLowerCase()}` });
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env) {
    const summary = await processSubscriptionReminders(env);
    console.log("Subscription reminder run", summary);
  },
};
