const express = require("express");
const Paystack = require("paystack-api")(process.env.PAYSTACK_SECRET_KEY);

const router = express.Router();

// initialize payment
router.post("/initialize", async (req, res) => {
  try {
    const { email, amount } = req.body;
    const payment = await Paystack.transaction.initialize({
      email,
      amount: amount * 100, // Paystack uses kobo (multiply by 100)
      callback_url: "http://localhost:3000/payment/verify",
    });
    res.redirect(payment.data.authorization_url);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error initializing payment");
  }
});

// verify payment
router.get("/verify", async (req, res) => {
  try {
    const ref = req.query.reference;
    const verify = await Paystack.transaction.verify({ reference: ref });
    if (verify.data.status === "success") {
      res.send(`<h1>✅ Payment Successful!</h1>`);
    } else {
      res.send(`<h1>❌ Payment Failed</h1>`);
    }
  } catch (error) {
    res.status(500).send("Verification failed");
  }
});

module.exports = router;
