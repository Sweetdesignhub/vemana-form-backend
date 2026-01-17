const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const { getConnection, initializeDatabase, sql } = require("./db");
const { generateCertificate } = require("./certificateGenerator");
const { sendCertificateEmail, sendTestEmail } = require("./emailService");

const app = express();
const PORT = process.env.PORT || 5000;

// Create certificates directory if it doesn't exist
const certificatesDir = path.join(__dirname, "certificates");
if (!fs.existsSync(certificatesDir)) {
  fs.mkdirSync(certificatesDir);
}

// CORS Middleware (allow all)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static certificates directory
app.use("/certificates", express.static(certificatesDir));

// Initialize database on server start
initializeDatabase().catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});

app.post("/api/submit", async (req, res) => {
  try {
    const { name, email, phone, message, location } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (!email && !phone) {
      return res
        .status(400)
        .json({ error: "Either email or phone is required" });
    }

    const pool = await getConnection();

    const result = await pool
      .request()
      .input("name", sql.NVarChar, name)
      .input("email", sql.NVarChar, email || "")
      .input("phone", sql.NVarChar, phone || "")
      .input("message", sql.NVarChar, message || "")
      .input("latitude", sql.Float, location?.latitude || null)
      .input("longitude", sql.Float, location?.longitude || null)
      .input("location_accuracy", sql.Float, location?.accuracy || null)
      .input("city", sql.NVarChar, location?.city || null)
      .input("state", sql.NVarChar, location?.state || null)
      .input("country", sql.NVarChar, location?.country || null)
      .input("country_code", sql.NVarChar, location?.countryCode || null)
      .input("full_address", sql.NVarChar, location?.fullAddress || null)
      .input(
        "location_timestamp",
        sql.DateTime,
        location?.timestamp ? new Date(location.timestamp) : null
      ).query(`
        INSERT INTO submissions (
          name, email, phone, message,
          latitude, longitude, location_accuracy,
          city, state, country, country_code,
          full_address, location_timestamp
        )
        VALUES (
          @name, @email, @phone, @message,
          @latitude, @longitude, @location_accuracy,
          @city, @state, @country, @country_code,
          @full_address, @location_timestamp
        );
        SELECT SCOPE_IDENTITY() AS id;
      `);

    const newId = result.recordset[0].id;

    // 🔹 AUTO GENERATE & SEND CERTIFICATE
    let certificateFileName = null;

    if (email) {
      certificateFileName = `certificate_${newId}_${Date.now()}.pdf`;
      const certificatePath = path.join(certificatesDir, certificateFileName);

      await generateCertificate(
        { id: newId, name, email, phone, message },
        certificatePath
      );

      await pool
        .request()
        .input("id", sql.Int, newId)
        .input("certificate_path", sql.NVarChar, certificateFileName)
        .query(
          "UPDATE submissions SET certificate_path = @certificate_path WHERE id = @id"
        );

      await sendCertificateEmail({ name, email }, certificatePath);

      await pool
        .request()
        .input("id", sql.Int, newId)
        .query(
          "UPDATE submissions SET certificate_sent = 1, certificate_sent_at = GETDATE() WHERE id = @id"
        );
    }

    res.status(201).json({
      message: email
        ? "Registration successful! Certificate has been sent to your email."
        : "Registration successful! Certificate can be collected later.",
      id: newId,
    });
  } catch (error) {
    console.error("Error submitting data:", error);
    res.status(500).json({ error: "Failed to submit data" });
  }
});

// GET endpoint - Fetch all data
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

// POST endpoint - Generate certificate
app.post("/api/generate-certificate/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch participant data
    const pool = await getConnection();
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM submissions WHERE id = @id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Participant not found" });
    }

    const participant = result.recordset[0];
    const certificateFileName = `certificate_${id}_${Date.now()}.pdf`;
    const certificatePath = path.join(certificatesDir, certificateFileName);

    // Generate certificate
    await generateCertificate(participant, certificatePath);

    // Update database with certificate path
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("certificate_path", sql.NVarChar, certificateFileName)
      .query(
        "UPDATE submissions SET certificate_path = @certificate_path WHERE id = @id"
      );

    res.json({
      message: "Certificate generated successfully",
      certificateUrl: `/certificates/${certificateFileName}`,
      certificatePath: certificateFileName,
    });
  } catch (error) {
    console.error("Error generating certificate:", error);
    res.status(500).json({ error: "Failed to generate certificate" });
  }
});

// POST endpoint - Send certificate via email
app.post("/api/send-certificate/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch participant data
    const pool = await getConnection();
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM submissions WHERE id = @id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Participant not found" });
    }

    const participant = result.recordset[0];

    // Check if email exists
    if (!participant.email || participant.email.trim() === "") {
      return res
        .status(400)
        .json({ error: "No email address found for this participant" });
    }

    // Check if certificate exists, if not generate it
    let certificatePath;
    if (participant.certificate_path) {
      certificatePath = path.join(
        certificatesDir,
        participant.certificate_path
      );

      // If file doesn't exist, regenerate
      if (!fs.existsSync(certificatePath)) {
        const certificateFileName = `certificate_${id}_${Date.now()}.pdf`;
        certificatePath = path.join(certificatesDir, certificateFileName);
        await generateCertificate(participant, certificatePath);

        // Update database
        await pool
          .request()
          .input("id", sql.Int, id)
          .input("certificate_path", sql.NVarChar, certificateFileName)
          .query(
            "UPDATE submissions SET certificate_path = @certificate_path WHERE id = @id"
          );
      }
    } else {
      // Generate new certificate
      const certificateFileName = `certificate_${id}_${Date.now()}.pdf`;
      certificatePath = path.join(certificatesDir, certificateFileName);
      await generateCertificate(participant, certificatePath);

      // Update database
      await pool
        .request()
        .input("id", sql.Int, id)
        .input("certificate_path", sql.NVarChar, certificateFileName)
        .query(
          "UPDATE submissions SET certificate_path = @certificate_path WHERE id = @id"
        );
    }

    // Send email
    await sendCertificateEmail(participant, certificatePath);

    // Update email sent status
    await pool
      .request()
      .input("id", sql.Int, id)
      .query(
        "UPDATE submissions SET certificate_sent = 1, certificate_sent_at = GETDATE() WHERE id = @id"
      );

    res.json({
      message: "Certificate sent successfully to " + participant.email,
    });
  } catch (error) {
    console.error("Error sending certificate:", error);
    res.status(500).json({
      error: "Failed to send certificate",
      details: error.message,
    });
  }
});

// GET endpoint - Download certificate
app.get("/api/download-certificate/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch participant data
    const pool = await getConnection();
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM submissions WHERE id = @id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Participant not found" });
    }

    const participant = result.recordset[0];

    // Check if certificate exists, if not generate it
    let certificatePath;
    if (participant.certificate_path) {
      certificatePath = path.join(
        certificatesDir,
        participant.certificate_path
      );

      // If file doesn't exist, regenerate
      if (!fs.existsSync(certificatePath)) {
        const certificateFileName = `certificate_${id}_${Date.now()}.pdf`;
        certificatePath = path.join(certificatesDir, certificateFileName);
        await generateCertificate(participant, certificatePath);

        // Update database
        await pool
          .request()
          .input("id", sql.Int, id)
          .input("certificate_path", sql.NVarChar, certificateFileName)
          .query(
            "UPDATE submissions SET certificate_path = @certificate_path WHERE id = @id"
          );
      }
    } else {
      // Generate new certificate
      const certificateFileName = `certificate_${id}_${Date.now()}.pdf`;
      certificatePath = path.join(certificatesDir, certificateFileName);
      await generateCertificate(participant, certificatePath);

      // Update database
      await pool
        .request()
        .input("id", sql.Int, id)
        .input("certificate_path", sql.NVarChar, certificateFileName)
        .query(
          "UPDATE submissions SET certificate_path = @certificate_path WHERE id = @id"
        );
    }

    // Send file for download
    res.download(
      certificatePath,
      `YogiVemanaJayanti_Certificate_${participant.name.replace(
        /\s+/g,
        "_"
      )}.pdf`
    );
  } catch (error) {
    console.error("Error downloading certificate:", error);
    res.status(500).json({ error: "Failed to download certificate" });
  }
});

// Test email endpoint
app.post("/api/test-email", async (req, res) => {
  try {
    await sendTestEmail();
    res.json({ message: "Test email sent successfully" });
  } catch (error) {
    console.error("Error sending test email:", error);
    res.status(500).json({ error: "Failed to send test email" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "Server is running" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  const { closeConnection } = require("./db");
  await closeConnection();
  process.exit(0);
});
