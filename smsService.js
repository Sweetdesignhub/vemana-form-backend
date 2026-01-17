const twilio = require("twilio");
require("dotenv").config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let twilioClient;

/**
 * Initialize Twilio client
 */
function initializeTwilio() {
  if (!accountSid || !authToken || !twilioPhoneNumber) {
    throw new Error("Twilio credentials are not properly configured");
  }

  if (!twilioClient) {
    twilioClient = twilio(accountSid, authToken);
    console.log("✓ Twilio client initialized");
  }

  return twilioClient;
}

/**
 * Send SMS with certificate link
 * @param {Object} participant - Participant data
 * @param {string} certificateUrl - Public URL of the certificate
 * @returns {Promise<Object>}
 */
async function sendCertificateSMS(participant, certificateUrl) {
  try {
    const client = initializeTwilio();

    // Format phone number (assuming Indian numbers)
    let phoneNumber = participant.phone.trim();

    // Add country code if not present
    if (!phoneNumber.startsWith("+")) {
      phoneNumber = `+91${phoneNumber}`; // Default to India (+91)
    }

    const message = `Namaste ${participant.name}! 🙏

Your Vemana Vignana Yatra Certificate is ready!

View & Download: ${certificateUrl}

Certificate ID: YV-${participant.id}-2026

May knowledge illuminate your path!

- Kadiri Tourism`;

    const messageResponse = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });

    console.log(`✓ SMS sent successfully to ${phoneNumber}`);
    console.log(`Message SID: ${messageResponse.sid}`);

    return {
      success: true,
      messageSid: messageResponse.sid,
      to: phoneNumber,
    };
  } catch (error) {
    console.error("Error sending SMS:", error.message);
    throw error;
  }
}

/**
 * Send test SMS
 * @param {string} phoneNumber - Phone number to send test message
 * @returns {Promise<Object>}
 */
async function sendTestSMS(phoneNumber = "+919876543210") {
  try {
    const client = initializeTwilio();

    const message = await client.messages.create({
      body: "Test message from Vemana Vignana Yatra Certificate System. SMS service is working correctly! 🙏",
      from: twilioPhoneNumber,
      to: phoneNumber,
    });

    console.log(`✓ Test SMS sent to ${phoneNumber}`);
    return {
      success: true,
      messageSid: message.sid,
    };
  } catch (error) {
    console.error("Error sending test SMS:", error.message);
    throw error;
  }
}

module.exports = {
  sendCertificateSMS,
  sendTestSMS,
};
