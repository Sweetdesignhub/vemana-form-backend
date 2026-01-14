const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { getConnection, initializeDatabase, sql } = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: "*", // allow all origins
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Handle preflight requests
app.options("*", cors());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize database on server start
initializeDatabase().catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});

// POST endpoint to submit data
app.post("/api/submit", async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    // Validation
    if (!name || !email || !phone || !message) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const pool = await getConnection();

    const result = await pool
      .request()
      .input("name", sql.NVarChar, name)
      .input("email", sql.NVarChar, email)
      .input("phone", sql.NVarChar, phone)
      .input("message", sql.NVarChar, message).query(`
        INSERT INTO submissions (name, email, phone, message)
        VALUES (@name, @email, @phone, @message);
        SELECT SCOPE_IDENTITY() AS id;
      `);

    const insertedId = result.recordset[0].id;

    res.status(201).json({
      message: "Data submitted successfully",
      id: insertedId,
    });
  } catch (error) {
    console.error("Error submitting data:", error);
    res.status(500).json({ error: "Failed to submit data" });
  }
});

// GET endpoint to retrieve all data
app.get("/api/data", async (req, res) => {
  try {
    const pool = await getConnection();

    const result = await pool
      .request()
      .query("SELECT * FROM submissions ORDER BY created_at DESC");

    res.json(result.recordset);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "Server is running" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  const { closeConnection } = require("./db");
  await closeConnection();
  process.exit(0);
});
