const nodemailer = require('nodemailer');

const APP_NAME = process.env.APP_NAME || 'DB Studio';
const FROM     = process.env.EMAIL_FROM || process.env.EMAIL_USER;

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST  || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',   // false = STARTTLS on port 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return _transporter;
}

function isConfigured() {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function otpHtml(heading, body, otp) {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:440px;margin:0 auto;padding:36px 28px;background:#09090b;color:#e4e4e7;border-radius:14px">
      <h2 style="margin:0 0 6px;color:#a78bfa;font-size:17px;font-weight:600">${APP_NAME}</h2>
      <h3 style="margin:0 0 14px;color:#f4f4f5;font-size:15px;font-weight:600">${heading}</h3>
      <p style="margin:0 0 24px;color:#a1a1aa;font-size:14px;line-height:1.6">${body}</p>
      <div style="background:#18181b;border:1px solid #3f3f46;border-radius:10px;padding:22px;text-align:center;font-size:36px;font-weight:700;letter-spacing:12px;color:#f4f4f5;font-family:monospace">${otp}</div>
      <p style="margin:20px 0 0;color:#52525b;font-size:12px;line-height:1.5">
        This code expires in <strong style="color:#71717a">10 minutes</strong>.<br>
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `;
}

async function sendVerifyEmail(to, otp) {
  if (!isConfigured()) {
    console.log(`[mailer] EMAIL_USER/PASS not set — verify OTP for ${to}: ${otp}`);
    return;
  }
  await getTransporter().sendMail({
    from:    FROM,
    to,
    subject: `${APP_NAME} — Verify your email (${otp})`,
    html:    otpHtml('Verify your email', 'Enter the code below to confirm your email address and activate your account.', otp),
  });
}

async function sendPasswordReset(to, otp) {
  if (!isConfigured()) {
    console.log(`[mailer] EMAIL_USER/PASS not set — reset OTP for ${to}: ${otp}`);
    return;
  }
  await getTransporter().sendMail({
    from:    FROM,
    to,
    subject: `${APP_NAME} — Password reset code (${otp})`,
    html:    otpHtml('Reset your password', 'Enter the code below to set a new password for your account.', otp),
  });
}

module.exports = { sendVerifyEmail, sendPasswordReset, isConfigured };
