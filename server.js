const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;


// PostgreSQL connection

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});


// Middleware

app.use(express.json());

app.use(express.static(__dirname));


// Create database tables

async function initializeDatabase() {

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            telegram_id BIGINT UNIQUE NOT NULL,
            username TEXT,
            first_name TEXT,
            points INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log("Database initialized");
}


// Main page

app.get("/", (req, res) => {

    res.sendFile(
        path.join(__dirname, "index.html")
    );

});


// Health check

app.get("/api/health", (req, res) => {

    res.json({
        success: true,
        message: "Reward Arena API is working"
    });

});


// Start server

app.listen(PORT, async () => {

    console.log(`Server running on port ${PORT}`);

    try {

        await initializeDatabase();

    } catch (error) {

        console.error(
            "Database initialization error:",
            error
        );

    }

});
