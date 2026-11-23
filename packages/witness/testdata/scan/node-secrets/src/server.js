const express = require("express");

const app = express();
const stripeKey = process.env.STRIPE_SECRET_KEY;
const jwtSecret = process.env["JWT_SECRET"];

app.get("/healthz", (req, res) => res.send("ok"));
app.get("/invoices", (req, res) => res.json({ stripe: !!stripeKey, jwt: !!jwtSecret }));

module.exports = app;
if (require.main === module) app.listen(process.env.PORT || 3000);
