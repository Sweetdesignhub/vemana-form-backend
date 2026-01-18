const nodemailer = require("nodemailer");
require("dotenv").config();

/**
 * Create email transporter
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: true, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

/**
 * Send certificate via email
 * @param {Object} participant - The participant data
 * @param {string} certificatePath - Path to the certificate PDF
 * @returns {Promise<Object>} - Email send result
 */
async function sendCertificateEmail(participant, certificatePath) {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"Yogi Vemana Jayanti" <${process.env.SMTP_USER}>`,
      to: participant.email,
      subject: "🎓 Your Yogi Vemana Jayanti Participation Certificate",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #EA580C 0%, #F59E0B 100%);
      color: white;
      padding: 32px;
      border-radius: 10px 10px 0 0;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .header p {
      margin: 8px 0 0;
      font-size: 14px;
      opacity: 0.95;
    }
    .content {
      background: #FFF7ED;
      padding: 30px;
      border-radius: 0 0 10px 10px;
    }
    .greeting {
      font-size: 18px;
      color: #EA580C;
      margin-bottom: 20px;
    }
    .quote {
      background: #ffffff;
      border-left: 4px solid #F59E0B;
      padding: 16px;
      margin: 24px 0;
      font-style: italic;
      color: #555;
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      padding-top: 20px;
      border-top: 2px solid #F59E0B;
      color: #666;
      font-size: 13px;
    }
    ul {
      padding-left: 20px;
    }
    li {
      margin-bottom: 6px;
    }
  </style>
</head>

<body>
  <div class="header">
    <h1>🌼 Vemana Vignana Yatra 🌼</h1>
    <p>Celebrating Knowledge, Culture, and Values</p>
    <p>An initiative by the Government of Andhra Pradesh<br>
       On the occasion of Vemana Jayanti</p>
  </div>
  
  <div class="content">
    <p class="greeting">Dear ${participant.name},</p>

    <p>Namaste 🙏</p>

    <p>
      We are pleased to present your <strong>Certificate of Participation</strong>
      for the <strong>Vemana Vignana Yatra</strong>, organized as part of
      <strong>Vemana Jayanti</strong> celebrations.
    </p>

    <p>
      This initiative was conducted to honor the timeless wisdom of
      Saint-Poet <strong>Yogi Vemana</strong> and to celebrate Kadiri’s rich
      heritage through learning, dialogue, and innovation.
    </p>

    <div class="quote">
      “Knowledge is the supreme wealth among all treasures.”<br>
      <small>— Yogi Vemana</small>
    </div>

    <p>
      Your participation and engagement contributed meaningfully to the
      success of this knowledge-driven journey.
    </p>

    <p>
      Please find your certificate attached with this email. You may
      download and print it for your records.
    </p>

    <p><strong>Participation Details:</strong></p>
    <ul>
      <li><strong>Event:</strong> Vemana Vignana Yatra</li>
      <li><strong>Participant:</strong> ${participant.name}</li>
      <li><strong>Certificate ID:</strong> YV-${participant.id}-2026</li>
      <li><strong>Date of Issue:</strong> ${new Date().toLocaleDateString(
        "en-IN",
        {
          day: "numeric",
          month: "long",
          year: "numeric",
        }
      )}</li>
    </ul>

    <p>
      May the teachings of Yogi Vemana continue to inspire rational thought,
      social harmony, and lifelong learning.
    </p>

    <p>
      With regards,<br>
      <strong>Vemana Vignana Yatra Team</strong><br>
    </p>

    <div class="footer">
      <p>This is an automated message. Please do not reply.</p>
    </div>
  </div>
</body>
</html>  `,
      attachments: [
        {
          filename: `YogiVemanaJayanti_Certificate_${participant.name.replace(
            /\s+/g,
            "_"
          )}.pdf`,
          path: certificatePath,
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Certificate email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending certificate email:", error);
    throw error;
  }
}

/**
 * Send a test email to verify configuration
 */
async function sendTestEmail() {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"Yogi Vemana Jayanti" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      subject: "Test Email - SMTP Configuration",
      text: "This is a test email to verify SMTP configuration.",
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Test email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending test email:", error);
    throw error;
  }
}

module.exports = {
  sendCertificateEmail,
  sendTestEmail,
};
