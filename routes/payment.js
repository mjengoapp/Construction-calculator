const express = require("express");
const router = express.Router();
const Paystack = require("paystack-api")(process.env.PAYSTACK_SECRET_KEY);

// @route   POST /api/pay
// @desc    Initialize Paystack payment
router.post("/", async (req, res) => {
  try {
    const { email, amount } = req.body;

    if (!email || !amount) {
      return res.status(400).json({ message: "Email and amount are required" });
    }

    const payment = await Paystack.transaction.initialize({
      email,
      amount: amount * 100,
      currency: "KES",
      callback_url: "http://localhost:3000/api/pay/verify_callback", // update later if deployed
    });

    res.json({
      authorization_url: payment.data.authorization_url,
      access_code: payment.data.access_code,
      reference: payment.data.reference,
    });
  } catch (error) {
    console.error("Paystack init error:", error);
    res.status(500).json({ message: "Payment initialization failed" });
  }
});

// @route   GET /api/pay/verify/:reference
// @desc    Verify Paystack payment
router.get("/verify/:reference", async (req, res) => {
  const { reference } = req.params;

  try {
    const verification = await Paystack.transaction.verify({ reference });

    if (verification.data.status === "success") {
      res.send(`
        <html>
          <head><title>Payment Successful</title></head>
          <body>
            <h1>✅ Payment Successful!</h1>
            <p>Reference: ${reference}</p>
            <p>Amount: ${verification.data.amount / 100} KES</p>
            <a href="/">Go Back</a>
          </body>
        </html>
      `);
    } else {
      res.send(`
        <html>
          <head><title>Payment Failed</title></head>
          <body>
            <h1>❌ Payment Failed or Incomplete</h1>
            <p>Reference: ${reference}</p>
            <a href="/">Try Again</a>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).send("Error verifying payment");
  }
});

// @route   GET /api/pay/verify_callback
// @desc    Handle Paystack redirect after payment
router.get("/verify_callback", async (req, res) => {
  const { reference } = req.query;

  try {
    const verification = await Paystack.transaction.verify({ reference });

    if (verification.data.status === "success") {
      res.send(`
        <html>
          <head><title>Payment Success</title></head>
          <body style="font-family: sans-serif;">
            <h1>✅ Payment Successful</h1>
            <p><b>Reference:</b> ${reference}</p>
            <p><b>Amount:</b> ${verification.data.amount / 100} KES</p>
            <p>Thank you for your payment!</p>
            <a href="/">Return Home</a>
          </body>
        </html>
      `);
    } else {
      res.send(`
        <html>
          <head><title>Payment Failed</title></head>
          <body style="font-family: sans-serif;">
            <h1>❌ Payment Failed or Cancelled</h1>
            <p>Reference: ${reference}</p>
            <a href="/">Try Again</a>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error("Paystack verification error:", error);
    res.status(500).send("An error occurred while verifying payment.");
  }
});
module.exports = router;
