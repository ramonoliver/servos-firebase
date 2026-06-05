const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
envContent.split("\n").forEach(line => {
  const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : "";
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
});

const host = "smtp-relay.sendinblue.com";
const port = Number(env.BREVO_SMTP_PORT || 587);
const user = env.BREVO_SMTP_USER;
const pass = env.BREVO_SMTP_PASS;
const from = env.EMAIL_FROM || "Servos <noreply@seudominio.com>";

console.log("Config loaded:");
console.log({ host, port, user, from });

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  tls: {
    servername: host,
  },
  auth: {
    user,
    pass,
  },
});

transporter.sendMail({
  from,
  to: env.SUPPORT_EMAIL || "ramon.oliver@gmail.com",
  subject: "Teste SMTP Servos",
  text: "Teste de envio de email via nodemailer",
})
.then(info => {
  console.log("Success:", info);
})
.catch(err => {
  console.error("Error:", err);
});
