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
              padding: 30px;
              border-radius: 10px 10px 0 0;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
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
              background: white;
              border-left: 4px solid #F59E0B;
              padding: 15px;
              margin: 20px 0;
              font-style: italic;
              color: #666;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 2px solid #F59E0B;
              color: #666;
              font-size: 14px;
            }
            .button {
              display: inline-block;
              background: linear-gradient(135deg, #EA580C 0%, #F59E0B 100%);
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>✨ Yogi Vemana Jayanti ✨</h1>
            <p>Certificate of Participation</p>
          </div>
          
          <div class="content">
            <p class="greeting">Dear ${participant.name},</p>
            
            <p>Namaste! 🙏</p>
            
            <p>We are delighted to share your Certificate of Participation for the <strong>Yogi Vemana Jayanti Celebration</strong>.</p>
            
            <p>Your presence and participation in this spiritual gathering honoring the great Telugu philosopher and poet Yogi Vemana has been truly valued.</p>
            
            <div class="quote">
              "Knowledge is the supreme wealth among all treasures"<br>
              <small>- Yogi Vemana</small>
            </div>
            
            <p>Please find your certificate attached to this email. You may download and print it for your records.</p>
            
            <p><strong>Event Details:</strong></p>
            <ul>
              <li>Event: Yogi Vemana Jayanti Celebration</li>
              <li>Participant: ${participant.name}</li>
              <li>Certificate ID: YV-${participant.id}-2026</li>
              <li>Date Issued: ${new Date().toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}</li>
            </ul>
            
            <p>May the wisdom of Yogi Vemana continue to illuminate your path!</p>
            
            <p>With warm regards,<br>
            <strong>Yogi Vemana Jayanti Organizing Committee</strong></p>
            
            <div class="footer">
              <p>This is an automated email. Please do not reply to this message.</p>
              <p>© 2026 Yogi Vemana Jayanti Celebration</p>
            </div>
          </div>
        </body>
        </html>
      `,
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
