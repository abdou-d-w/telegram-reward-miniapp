const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.BOT_TOKEN) console.error("ERROR: BOT_TOKEN is missing.");
if (!process.env.DATABASE_URL) console.error("ERROR: DATABASE_URL is missing.");
if (!process.env.BOT_USERNAME) console.error("ERROR: BOT_USERNAME is missing.");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false
});
app.use("/api/", apiLimiter);

function verifyTelegramWebAppData(initData) {
  if (!initData || !process.env.BOT_TOKEN) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) return null;

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(process.env.BOT_TOKEN)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(calculatedHash, "hex");
  const b = Buffer.from(receivedHash, "hex");

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > 86400) return null;

  const userData = params.get("user");
  if (!userData) return null;

  try {
    return JSON.parse(userData);
  } catch {
    return null;
  }
}

function todayAlgiers() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function safeInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      points INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      last_daily_claim TIMESTAMPTZ,
      referred_by BIGINT,
      referral_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_claim TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by BIGINT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_count INTEGER NOT NULL DEFAULT 0;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      url TEXT,
      reward INTEGER NOT NULL DEFAULT 50,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_tasks (
      user_id BIGINT NOT NULL,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      claimed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, task_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      amount INTEGER NOT NULL,
      method TEXT NOT NULL,
      destination TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMPTZ
    );
  `);

  const taskCount = await pool.query(`SELECT COUNT(*)::int AS count FROM tasks;`);
  if (taskCount.rows[0].count === 0) {
    await pool.query(`
      INSERT INTO tasks (title, description, url, reward)
      VALUES
      ('Join our Telegram channel', 'Open the channel and complete the task.', 'https://t.me/', 100),
      ('Follow the project', 'Open the project link and complete the task.', 'https://t.me/', 75);
    `);
  }

  console.log("Database initialized.");
}

async function auth(req, res, next) {
  const user = verifyTelegramWebAppData(req.body?.initData || req.headers["x-telegram-init-data"]);
  if (!user) return res.status(401).json({ success: false, message: "Invalid or expired Telegram session." });
  req.telegramUser = user;
  next();
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "TapRush API is working" });
});

app.post("/api/user", auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const tg = req.telegramUser;
    const telegramId = String(tg.id);
    const username = tg.username || null;
    const firstName = tg.first_name || "Telegram User";
    const startParam = typeof req.body.startParam === "string" ? req.body.startParam : "";

    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT telegram_id, username, first_name, points, referred_by, referral_count
       FROM users WHERE telegram_id = $1 FOR UPDATE`,
      [telegramId]
    );

    let user;
    let referralApplied = false;

    if (existing.rows.length === 0) {
      let referrerId = null;
      let startingPoints = 0;

      if (startParam.startsWith("ref_")) {
        const candidate = startParam.slice(4);
        if (/^\d+$/.test(candidate) && candidate !== telegramId) {
          const ref = await client.query(
            `SELECT telegram_id FROM users WHERE telegram_id = $1 FOR UPDATE`,
            [candidate]
          );
          if (ref.rows.length) {
            referrerId = String(ref.rows[0].telegram_id);
            startingPoints = 100;
          }
        }
      }

      const inserted = await client.query(
        `INSERT INTO users
          (telegram_id, username, first_name, points, referred_by, referral_count)
         VALUES ($1, $2, $3, $4, $5, 0)
         RETURNING telegram_id, username, first_name, points, referred_by, referral_count`,
        [telegramId, username, firstName, startingPoints, referrerId]
      );

      user = inserted.rows[0];

      if (referrerId) {
        await client.query(
          `UPDATE users
           SET points = points + 500,
               referral_count = COALESCE(referral_count, 0) + 1
           WHERE telegram_id = $1`,
          [referrerId]
        );
        referralApplied = true;
      }
    } else {
      const updated = await client.query(
        `UPDATE users
         SET username = $1, first_name = $2
         WHERE telegram_id = $3
         RETURNING telegram_id, username, first_name, points, referred_by, referral_count`,
        [username, firstName, telegramId]
      );
      user = updated.rows[0];
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      referralApplied,
      user: {
        telegram_id: String(user.telegram_id),
        username: user.username,
        first_name: user.first_name,
        display_name: user.first_name,
        points: user.points,
        referred_by: user.referred_by ? String(user.referred_by) : null,
        referral_count: user.referral_count || 0
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("User error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
});

app.post("/api/daily-reward", auth, async (req, res) => {
  try {
    const telegramId = String(req.telegramUser.id);
    const today = todayAlgiers();
    const reward = 100;

    const result = await pool.query(
      `UPDATE users
       SET points = points + $1, last_daily_claim = NOW()
       WHERE telegram_id = $2
         AND (
           last_daily_claim IS NULL OR
           (last_daily_claim AT TIME ZONE 'Africa/Algiers')::date <> $3::date
         )
       RETURNING points`,
      [reward, telegramId, today]
    );

    if (!result.rows.length) {
      return res.json({
        success: false,
        claimed: false,
        message: "Daily reward already claimed today."
      });
    }

    res.json({
      success: true,
      claimed: true,
      reward,
      points: result.rows[0].points
    });
  } catch (error) {
    console.error("Daily reward error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/tasks", auth, async (req, res) => {
  try {
    const telegramId = String(req.telegramUser.id);
    const result = await pool.query(
      `SELECT
        t.id, t.title, t.description, t.url, t.reward,
        CASE WHEN ut.task_id IS NULL THEN false ELSE true END AS claimed
       FROM tasks t
       LEFT JOIN user_tasks ut
         ON ut.task_id = t.id AND ut.user_id = $1
       WHERE t.active = true
       ORDER BY t.id ASC`,
      [telegramId]
    );
    res.json({ success: true, tasks: result.rows });
  } catch (error) {
    console.error("Tasks error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/tasks/:id/claim", auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const taskId = safeInt(req.params.id, -1);
    const telegramId = String(req.telegramUser.id);

    if (taskId < 1) return res.status(400).json({ success: false, message: "Invalid task." });

    await client.query("BEGIN");

    const task = await client.query(
      `SELECT id, reward FROM tasks WHERE id = $1 AND active = true`,
      [taskId]
    );
    if (!task.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Task not found." });
    }

    const claimed = await client.query(
      `SELECT 1 FROM user_tasks WHERE user_id = $1 AND task_id = $2`,
      [telegramId, taskId]
    );
    if (claimed.rows.length) {
      await client.query("ROLLBACK");
      return res.json({ success: false, claimed: false, message: "Task already claimed." });
    }

    const inserted = await client.query(
      `INSERT INTO user_tasks (user_id, task_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING task_id`,
      [telegramId, taskId]
    );

    if (!inserted.rows.length) {
      await client.query("ROLLBACK");
      return res.json({ success: false, claimed: false, message: "Task already claimed." });
    }

    const reward = task.rows[0].reward;
    const balance = await client.query(
      `UPDATE users SET points = points + $1
       WHERE telegram_id = $2
       RETURNING points`,
      [reward, telegramId]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      claimed: true,
      reward,
      points: balance.rows[0].points
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Task claim error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
});

app.get("/api/leaderboard", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT first_name, username, points, referral_count
       FROM users
       ORDER BY points DESC, created_at ASC
       LIMIT 20`
    );
    res.json({ success: true, leaderboard: result.rows });
  } catch (error) {
    console.error("Leaderboard error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/referral", auth, async (req, res) => {
  try {
    const telegramId = String(req.telegramUser.id);
    const result = await pool.query(
      `SELECT points, referral_count
       FROM users WHERE telegram_id = $1`,
      [telegramId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "User not found." });

    const user = result.rows[0];
    const username = String(process.env.BOT_USERNAME || "").replace(/^@/, "");

    res.json({
      success: true,
      referralLink: `https://t.me/${username}?startapp=ref_${telegramId}`,
      referralCount: user.referral_count || 0,
      points: user.points || 0,
      rewardPerReferral: 500
    });
  } catch (error) {
    console.error("Referral error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/withdraw", auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const telegramId = String(req.telegramUser.id);
    const amount = safeInt(req.body.amount, 0);
    const method = String(req.body.method || "").trim().slice(0, 40);
    const destination = String(req.body.destination || "").trim().slice(0, 200);

    if (amount < 1000) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal is 1000 points." });
    }
    if (!method || !destination) {
      return res.status(400).json({ success: false, message: "Withdrawal details are required." });
    }

    await client.query("BEGIN");

    const user = await client.query(
      `SELECT points FROM users WHERE telegram_id = $1 FOR UPDATE`,
      [telegramId]
    );
    if (!user.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (user.rows[0].points < amount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Insufficient points." });
    }

    await client.query(
      `UPDATE users SET points = points - $1 WHERE telegram_id = $2`,
      [amount, telegramId]
    );

    const withdrawal = await client.query(
      `INSERT INTO withdrawals (telegram_id, amount, method, destination)
       VALUES ($1, $2, $3, $4)
       RETURNING id, amount, method, destination, status, created_at`,
      [telegramId, amount, method, destination]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      withdrawal: withdrawal.rows[0],
      message: "Withdrawal request submitted for review."
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Withdrawal error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
});

// ------------------------------
// Simple admin endpoints
// ------------------------------

function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!process.env.ADMIN_KEY || !key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ success: false, message: "Unauthorized." });
  }
  next();
}

app.get("/api/admin/stats", adminAuth, async (req, res) => {
  try {
    const users = await pool.query(`SELECT COUNT(*)::int AS count FROM users`);
    const points = await pool.query(`SELECT COALESCE(SUM(points),0)::bigint AS total FROM users`);
    const pending = await pool.query(`SELECT COUNT(*)::int AS count FROM withdrawals WHERE status = 'pending'`);
    res.json({
      success: true,
      users: users.rows[0].count,
      totalPoints: points.rows[0].total,
      pendingWithdrawals: pending.rows[0].count
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/admin/tasks", adminAuth, async (req, res) => {
  try {
    const title = String(req.body.title || "").trim().slice(0, 120);
    const description = String(req.body.description || "").trim().slice(0, 500);
    const url = String(req.body.url || "").trim().slice(0, 500);
    const reward = safeInt(req.body.reward, 0);

    if (!title || reward < 1) {
      return res.status(400).json({ success: false, message: "Title and a positive reward are required." });
    }

    const result = await pool.query(
      `INSERT INTO tasks (title, description, url, reward)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [title, description, url, reward]
    );

    res.json({ success: true, task: result.rows[0] });
  } catch (error) {
    console.error("Admin task error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/admin/withdrawals", adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ success: true, withdrawals: result.rows });
  } catch (error) {
    console.error("Admin withdrawals error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/admin/withdrawals/:id/review", adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = safeInt(req.params.id, -1);
    const status = ["approved", "rejected"].includes(req.body.status) ? req.body.status : null;
    if (id < 1 || !status) return res.status(400).json({ success: false, message: "Invalid request." });

    await client.query("BEGIN");

    const w = await client.query(
      `SELECT id, telegram_id, amount, status
       FROM withdrawals WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (!w.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Withdrawal not found." });
    }

    if (w.rows[0].status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Already reviewed." });
    }

    if (status === "rejected") {
      await client.query(
        `UPDATE users SET points = points + $1 WHERE telegram_id = $2`,
        [w.rows[0].amount, String(w.rows[0].telegram_id)]
      );
    }

    await client.query(
      `UPDATE withdrawals
       SET status = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [status, id]
    );

    await client.query("COMMIT");
    res.json({ success: true, status });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Review error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
});

app.listen(PORT, async () => {
  try {
    await initializeDatabase();
    console.log(`TapRush server running on port ${PORT}`);
  } catch (error) {
    console.error("Database initialization failed:", error);
    process.exit(1);
  }
});
