// routes/paystack.js
const router = require('express').Router();
const axios = require('axios');

// Monthly subscription as one-time payment
router.get('/subscribe', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Use transaction API instead of subscription API
    const transactionData = {
      email: email,
      amount: 50000, // 500 KES in kobo
      currency: "KES",
      channels: ["card", "bank", "ussd", "qr", "mobile_money", "bank_transfer"],
      metadata: {
        custom_fields: [
          {
            display_name: "Subscription Type",
            variable_name: "subscription_type",
            value: "monthly_unlimited"
          },
          {
            display_name: "Service",
            variable_name: "service", 
            value: "Construction Calculator"
          }
        ],
        payment_type: "monthly_subscription"
      },
      callback_url: `${process.env.BASE_URL || 'http://localhost:3000'}/payment-success`
    };

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      transactionData,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      success: true,
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference
    });

  } catch (error) {
    console.error('Monthly subscription error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.message || 'Payment initialization failed'
    });
  }
});

module.exports = router;
