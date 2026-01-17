const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const { getConnection, initializeDatabase, sql } = require("./db");
const { generateCertificate } = require("./certificateGenerator");
const { sendCertificateEmail, sendTestEmail } = require("./emailService");
const {
  initializeBlobStorage,
  uploadToBlob,
  getBlobUrl,
  blobExists,
} = require("./azureBlobService");
const { sendCertificateSMS, sendTestSMS } = require("./smsService");

const app = express();
const PORT = process.env.PORT || 5000;

// Create certificates directory if it doesn't exist (for temporary storage)
const certificatesDir = path.join(__dirname, "certificates");
if (!fs.existsSync(certificatesDir)) {
  fs.mkdirSync(certificatesDir);
}

// CORS Middleware
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static certificates directory (fallback for local files)
app.use("/certificates", express.static(certificatesDir));

// Initialize database and Azure Blob Storage on server start
Promise.all([initializeDatabase(), initializeBlobStorage()])
  .then(() => {
    console.log("✓ All services initialized successfully");
  })
  .catch((err) => {
    console.error("Failed to initialize services:", err);
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

    // Generate and upload certificate to Azure Blob Storage
    const certificateFileName = `certificate_${newId}_${Date.now()}.pdf`;
    const tempCertificatePath = path.join(certificatesDir, certificateFileName);

    // Generate certificate
    await generateCertificate(
      { id: newId, name, email, phone, message },
      tempCertificatePath
    );

    // Upload to Azure Blob Storage
    const certificateBuffer = fs.readFileSync(tempCertificatePath);
    const blobUrl = await uploadToBlob(
      certificateFileName,
      certificateBuffer,
      "application/pdf"
    );

    // Update database with blob URL
    await pool
      .request()
      .input("id", sql.Int, newId)
      .input("certificate_url", sql.NVarChar, blobUrl)
      .input("certificate_path", sql.NVarChar, certificateFileName)
      .query(
        "UPDATE submissions SET certificate_path = @certificate_path, certificate_url = @certificate_url WHERE id = @id"
      );

    // Send certificate via email or SMS (prefer email if present)
    if (email && email.trim() !== "") {
      // Email is present - send via email with attachment
      await sendCertificateEmail({ name, email }, tempCertificatePath);
      await pool
        .request()
        .input("id", sql.Int, newId)
        .input("send_method", sql.NVarChar, "email")
        .query(
          "UPDATE submissions SET certificate_sent = 1, certificate_sent_at = GETDATE(), send_method = @send_method WHERE id = @id"
        );
      console.log(`✓ Certificate sent via EMAIL to ${email}`);
    } else if (phone && phone.trim() !== "") {
      // No email but phone is present - send via SMS with link
      await sendCertificateSMS({ id: newId, name, phone }, blobUrl);
      await pool
        .request()
        .input("id", sql.Int, newId)
        .input("send_method", sql.NVarChar, "sms")
        .query(
          "UPDATE submissions SET certificate_sent = 1, certificate_sent_at = GETDATE(), send_method = @send_method WHERE id = @id"
        );
      console.log(`✓ Certificate sent via SMS to ${phone}`);
    }

    // Clean up temporary file
    fs.unlinkSync(tempCertificatePath);

    // Determine response message based on what was sent
    let responseMessage = "Registration successful!";
    let sendMethod = "none";

    if (email && email.trim() !== "") {
      responseMessage =
        "Registration successful! Certificate has been sent to your email. 📧";
      sendMethod = "email";
    } else if (phone && phone.trim() !== "") {
      responseMessage =
        "Registration successful! Certificate link has been sent to your phone via SMS. 📱";
      sendMethod = "sms";
    }

    res.status(201).json({
      message: responseMessage,
      id: newId,
      certificateUrl: blobUrl,
      sendMethod: sendMethod,
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

// POST endpoint - Generate certificate and upload to Azure
app.post("/api/generate-certificate/:id", async (req, res) => {
  try {
    const { id } = req.params;

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
    const tempCertificatePath = path.join(certificatesDir, certificateFileName);

    // Generate certificate
    await generateCertificate(participant, tempCertificatePath);

    // Upload to Azure Blob Storage
    const certificateBuffer = fs.readFileSync(tempCertificatePath);
    const blobUrl = await uploadToBlob(
      certificateFileName,
      certificateBuffer,
      "application/pdf"
    );

    // Update database
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("certificate_path", sql.NVarChar, certificateFileName)
      .input("certificate_url", sql.NVarChar, blobUrl)
      .query(
        "UPDATE submissions SET certificate_path = @certificate_path, certificate_url = @certificate_url WHERE id = @id"
      );

    // Clean up temporary file
    fs.unlinkSync(tempCertificatePath);

    res.json({
      message: "Certificate generated successfully",
      certificateUrl: blobUrl,
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

    const pool = await getConnection();
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM submissions WHERE id = @id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Participant not found" });
    }

    const participant = result.recordset[0];

    if (!participant.email || participant.email.trim() === "") {
      return res
        .status(400)
        .json({ error: "No email address found for this participant" });
    }

    // Check if certificate URL exists in Azure
    let certificateUrl = participant.certificate_url;

    if (!certificateUrl || !(await blobExists(participant.certificate_path))) {
      // Generate new certificate
      const certificateFileName = `certificate_${id}_${Date.now()}.pdf`;
      const tempCertificatePath = path.join(
        certificatesDir,
        certificateFileName
      );

      await generateCertificate(participant, tempCertificatePath);

      const certificateBuffer = fs.readFileSync(tempCertificatePath);
      certificateUrl = await uploadToBlob(
        certificateFileName,
        certificateBuffer,
        "application/pdf"
      );

      await pool
        .request()
        .input("id", sql.Int, id)
        .input("certificate_path", sql.NVarChar, certificateFileName)
        .input("certificate_url", sql.NVarChar, certificateUrl)
        .query(
          "UPDATE submissions SET certificate_path = @certificate_path, certificate_url = @certificate_url WHERE id = @id"
        );

      fs.unlinkSync(tempCertificatePath);
    }

    // Download certificate from Azure for email attachment
    const tempPath = path.join(certificatesDir, participant.certificate_path);
    const axios = require("axios");
    const response = await axios.get(certificateUrl, {
      responseType: "arraybuffer",
    });
    fs.writeFileSync(tempPath, response.data);

    await sendCertificateEmail(participant, tempPath);

    await pool
      .request()
      .input("id", sql.Int, id)
      .query(
        "UPDATE submissions SET certificate_sent = 1, certificate_sent_at = GETDATE() WHERE id = @id"
      );

    fs.unlinkSync(tempPath);

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

// POST endpoint - Send certificate via SMS
app.post("/api/send-sms/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await getConnection();
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM submissions WHERE id = @id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Participant not found" });
    }

    const participant = result.recordset[0];

    if (!participant.phone || participant.phone.trim() === "") {
      return res
        .status(400)
        .json({ error: "No phone number found for this participant" });
    }

    // Check if certificate URL exists
    let certificateUrl = participant.certificate_url;

    if (!certificateUrl || !(await blobExists(participant.certificate_path))) {
      // Generate new certificate
      const certificateFileName = `certificate_${id}_${Date.now()}.pdf`;
      const tempCertificatePath = path.join(
        certificatesDir,
        certificateFileName
      );

      await generateCertificate(participant, tempCertificatePath);

      const certificateBuffer = fs.readFileSync(tempCertificatePath);
      certificateUrl = await uploadToBlob(
        certificateFileName,
        certificateBuffer,
        "application/pdf"
      );

      await pool
        .request()
        .input("id", sql.Int, id)
        .input("certificate_path", sql.NVarChar, certificateFileName)
        .input("certificate_url", sql.NVarChar, certificateUrl)
        .query(
          "UPDATE submissions SET certificate_path = @certificate_path, certificate_url = @certificate_url WHERE id = @id"
        );

      fs.unlinkSync(tempCertificatePath);
    }

    // Send SMS
    await sendCertificateSMS(participant, certificateUrl);

    await pool
      .request()
      .input("id", sql.Int, id)
      .query(
        "UPDATE submissions SET certificate_sent = 1, certificate_sent_at = GETDATE() WHERE id = @id"
      );

    res.json({
      message:
        "Certificate link sent successfully via SMS to " + participant.phone,
    });
  } catch (error) {
    console.error("Error sending SMS:", error);
    res.status(500).json({
      error: "Failed to send SMS",
      details: error.message,
    });
  }
});

// GET endpoint - Download certificate from Azure
app.get("/api/download-certificate/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await getConnection();
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM submissions WHERE id = @id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Participant not found" });
    }

    const participant = result.recordset[0];

    let certificateUrl = participant.certificate_url;

    if (!certificateUrl || !(await blobExists(participant.certificate_path))) {
      const certificateFileName = `certificate_${id}_${Date.now()}.pdf`;
      const tempCertificatePath = path.join(
        certificatesDir,
        certificateFileName
      );

      await generateCertificate(participant, tempCertificatePath);

      const certificateBuffer = fs.readFileSync(tempCertificatePath);
      certificateUrl = await uploadToBlob(
        certificateFileName,
        certificateBuffer,
        "application/pdf"
      );

      await pool
        .request()
        .input("id", sql.Int, id)
        .input("certificate_path", sql.NVarChar, certificateFileName)
        .input("certificate_url", sql.NVarChar, certificateUrl)
        .query(
          "UPDATE submissions SET certificate_path = @certificate_path, certificate_url = @certificate_url WHERE id = @id"
        );

      fs.unlinkSync(tempCertificatePath);
    }

    // Download from Azure and send to client
    const axios = require("axios");
    const response = await axios.get(certificateUrl, {
      responseType: "arraybuffer",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="YogiVemanaJayanti_Certificate_${participant.name.replace(
        /\s+/g,
        "_"
      )}.pdf"`
    );
    res.send(Buffer.from(response.data));
  } catch (error) {
    console.error("Error downloading certificate:", error);
    res.status(500).json({ error: "Failed to download certificate" });
  }
});

// Test SMS endpoint
app.post("/api/test-sms", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    await sendTestSMS(phoneNumber);
    res.json({ message: "Test SMS sent successfully" });
  } catch (error) {
    console.error("Error sending test SMS:", error);
    res.status(500).json({ error: "Failed to send test SMS" });
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
