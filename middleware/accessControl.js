// middleware/accessControl.js - Fixed version with proper null checks
const User = require("../models/user");

async function checkAccess(req, res, next) {
  try {
    console.log('🔍 Access control check for:', req.method, req.originalUrl);
    console.log('📧 Session email:', req.session?.email);
    console.log('📦 Request body:', req.body);

    // Get email from session (primary) or body (fallback) with proper null checks
    const email = req.session?.email || (req.body && req.body.email) || null;

    if (!email) {
      console.log('❌ No email found in session or body');
      if (req.method === 'GET') {
        return res.redirect('/login');
      } else {
        return res.status(400).json({
          message: "Email is required to continue. Please log in again.",
          redirectTo: "/login"
        });
      }
    }

    console.log('✅ Using email:', email);

    // Find or create user
    let user = await User.findOne({ email });
    if (!user) {
      console.log('👤 Creating new user:', email);
      user = new User({
        email: email,
        calculationsUsed: 0,
        subscriptionActive: false
      });
      await user.save();
    }

    console.log('👤 User found/created:', {
      email: user.email,
      calculationsUsed: user.calculationsUsed,
      subscriptionActive: user.subscriptionActive,
      subscriptionExpires: user.subscriptionExpires
    });

    const today = new Date();

    // If user has active subscription
    if (user.subscriptionActive && user.subscriptionExpires && user.subscriptionExpires > today) {
      console.log('✅ User has active subscription');
      req.user = user;
      return next();
    }

    // Free limit (3 calculations)
    if (user.calculationsUsed < 3) {
      console.log(`✅ Free calculations remaining: ${3 - user.calculationsUsed}`);

      // Only increment for actual calculation requests, not page views
      const isCalculationSubmission = req.method === 'POST' && req.originalUrl.includes('/submit');

      if (isCalculationSubmission) {
        user.calculationsUsed += 1;
        await user.save();
        console.log(`📊 Incremented calculations used: ${user.calculationsUsed}`);
      }

      req.user = user;
      return next();
    }

    // Block and provide payment link
    console.log('🚫 Free limit reached for:', email);

    if (req.method === 'GET') {
      // For GET requests, show a payment required page
      return res.status(403).send(`
        <html>
          <head>
            <title>Limit Reached - Construction Calculator</title>
            <link rel="stylesheet" href="/styles.css">
            <style>
              .limit-container {
                max-width: 500px;
                margin: 100px auto;
                padding: 40px;
                background: white;
                border-radius: 10px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                text-align: center;
              }
              .limit-message {
                color: #856404;
                background: #fff3cd;
                padding: 20px;
                border-radius: 5px;
                margin: 20px 0;
              }
              .btn {
                display: inline-block;
                padding: 12px 24px;
                background: #007BFF;
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin: 10px 5px;
                font-weight: bold;
              }
              .btn-success {
                background: #28a745;
              }
              .btn-success:hover {
                background: #218838;
              }
              .user-info {
                background: #e7f3ff;
                padding: 15px;
                border-radius: 5px;
                margin: 15px 0;
              }
            </style>
          </head>
          <body>
            <div class="limit-container">
              <h1>🚧 Free Limit Reached</h1>

              <div class="user-info">
                <p><strong>User:</strong> ${email}</p>
                <p><strong>Calculations Used:</strong> ${user.calculationsUsed}/3</p>
              </div>

              <div class="limit-message">
                <p>You've used all 3 free calculations.</p>
                <p>Subscribe for unlimited access to all calculators.</p>
              </div>

              <div class="payment-options">
                <p><strong>Choose an option:</strong></p>
                <a href="/api/paystack/subscribe?email=${encodeURIComponent(email)}" class="btn btn-success">
                  📅 Subscribe Monthly (500 KES)
                </a>
                <br>
                <small>Unlimited access for 30 days</small>
                <br><br>
                <a href="/" class="btn">
                  🏠 Return Home
                </a>
              </div>
            </div>
          </body>
        </html>
      `);
    } else {
      // For POST requests, return JSON response
      return res.status(403).json({
        message: "Free limit reached. Please subscribe to continue.",
        email: email,
        calculationsUsed: user.calculationsUsed,
        subscribeUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/api/paystack/subscribe?email=${encodeURIComponent(email)}`
      });
    }
  } catch (error) {
    console.error("❌ Access control error:", error);

    // More detailed error response for debugging
    if (req.method === 'GET') {
      return res.status(500).send(`
        <html>
          <head>
            <title>Server Error</title>
            <link rel="stylesheet" href="/styles.css">
          </head>
          <body>
            <div style="text-align: center; padding: 50px;">
              <h1>❌ Server Error</h1>
              <p>An error occurred while checking access. Please try again.</p>
              <p><small>Error: ${error.message}</small></p>
              <a href="/">Return Home</a>
            </div>
          </body>
        </html>
      `);
    } else {
      return res.status(500).json({
        message: "An error occurred while checking access. Please try again.",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = checkAccess;
