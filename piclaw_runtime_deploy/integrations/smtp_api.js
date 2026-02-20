"use strict";

const nodemailer = require("nodemailer");
const identity = require("../core/identity");

/**
 * SMTP verification + single test send.
 * Send-only. Recipient is strictly PICLAW_SMTP_TEST_TO. No inbox access.
 * Never log password.
 */

async function sendTestMail() {
  const host = process.env.PICLAW_SMTP_HOST;
  const user = process.env.PICLAW_SMTP_USER;
  const pass = process.env.PICLAW_SMTP_PASS;
  const to = process.env.PICLAW_SMTP_TEST_TO;

  if (!host || !host.trim() || !user || !user.trim() || !pass || !pass.trim() || !to || !to.trim()) {
    return { ok: false, reason: "missing_config" };
  }

  const toAddress = to.trim();
  const id = identity.loadIdentity();
  const deviceId = id.device_id || "unknown";
  const timestamp = new Date().toISOString();

  try {
    const transporter = nodemailer.createTransport({
      host: host.trim(),
      port: parseInt(process.env.PICLAW_SMTP_PORT || "587", 10),
      secure: process.env.PICLAW_SMTP_SECURE === "true",
      auth: {
        user: user.trim(),
        pass,
      },
    });

    await transporter.sendMail({
      from: user.trim(),
      to: toAddress,
      subject: "Piclaw SMTP Test",
      text: `Piclaw node ${deviceId} verified outbound mail at ${timestamp}.`,
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message || "send_failed" };
  }
}

module.exports = { sendTestMail };
