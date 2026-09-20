const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// ==============================
// Environment variables
// ==============================

if (!process.env.BOT_TOKEN) {
    console.error("ERROR: BOT_TOKEN is missing.");
}

if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is missing.");
}

// ==============================
// PostgreSQL
// ==============================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// ==============================
// Middleware
// ==============================

app.use(express.json());
app.use(express.static(__dirname));

// ==============================
// Telegram initData verification
// ==============================

function verifyTelegramWebAppData(initData) {
    if (!initData || !process.env.BOT_TOKEN) {
        return null;
    }

    const params = new URLSearchParams(initData);

    const receivedHash = params.get("hash");

    if (!receivedHash) {
        return null;
    }

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

    if (calculatedHash !== receivedHash) {
        return null;
    }

    const userData = params.get("user");

    if (!userData) {
        return null;
    }

    try {
        return JSON.parse(userData);
    } catch (error) {
        return null;
    }
}

// ==============================
// Database
// ==============================

async function initializeDatabase() {

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            telegram_id BIGINT UNIQUE NOT NULL,
            username TEXT,
            first_name TEXT,
            points INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_daily_claim TIMESTAMPTZ
        );
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS last_daily_claim TIMESTAMPTZ;
    `);

    console.log("Database initialized successfully.");
}

// ==============================
// Main page
// ==============================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// ==============================
// Health check
// ==============================

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Reward Arena API is working"
    });
});

// ==============================
// Register / Get user
// ==============================

app.post("/api/user", async (req, res) => {

    try {

        const { initData } = req.body;

        const telegramUser = verifyTelegramWebAppData(initData);

        if (!telegramUser) {
            return res.status(401).json({
                success: false,
                message: "Invalid Telegram data"
            });
        }

        const telegramId = telegramUser.id;
        const username = telegramUser.username || null;
        const firstName = telegramUser.first_name || "Telegram User";

        const result = await pool.query(
            `
            INSERT INTO users (
                telegram_id,
                username,
                first_name
            )
            VALUES ($1, $2, $3)
            ON CONFLICT (telegram_id)
            DO UPDATE SET
                username = EXCLUDED.username,
                first_name = EXCLUDED.first_name
            RETURNING
                telegram_id,
                username,
                first_name,
                points;
            `,
            [
                telegramId,
                username,
                firstName
            ]
        );

        const user = result.rows[0];

        res.json({
            success: true,
            user: {
                telegram_id: user.telegram_id,
                username: user.username,
                first_name: user.first_name,
                display_name: user.first_name,
                points: user.points
            }
        });

    } catch (error) {

        console.error("User API error:", error);

        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});

// ==============================
// Daily Reward
// ==============================

app.post("/api/daily-reward", async (req, res) => {

    try {

        const { initData } = req.body;

        const telegramUser = verifyTelegramWebAppData(initData);

        if (!telegramUser) {
            return res.status(401).json({
                success: false,
                message: "Invalid Telegram data"
            });
        }

        const telegramId = telegramUser.id;

        // Current date in Algeria
        const today = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Africa/Algiers",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(new Date());

        const reward = 100;

        const result = await pool.query(
            `
            UPDATE users
            SET
                points = points + $1,
                last_daily_claim = NOW()
            WHERE telegram_id = $2
            AND (
                last_daily_claim IS NULL
                OR (
                    last_daily_claim AT TIME ZONE 'Africa/Algiers'
                )::date <> $3::date
            )
            RETURNING points;
            `,
            [
                reward,
                telegramId,
                today
            ]
        );

        if (result.rows.length === 0) {

            return res.json({
                success: false,
                claimed: false,
                message: "Daily reward already claimed today."
            });
        }

        res.json({
            success: true,
            claimed: true,
            reward: reward,
            points: result.rows[0].points
        });

    } catch (error) {

        console.error("Daily reward error:", error);

        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});

// ==============================
// Start server
// ==============================

async function startServer() {

    try {

        await initializeDatabase();

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

    } catch (error) {

        console.error("Startup error:", error);

        process.exit(1);
    }
}

startServer();
