// server.js - Complete updated version with fixed monthly subscriptions
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const checkAccess = require("./middleware/accessControl");
const dns = require('dns').promises;
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');

const app = express();

// Debug: Check if environment variables are loading
console.log("Environment check:");
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("SESSION_SECRET:", process.env.SESSION_SECRET ? "Loaded" : "NOT LOADED - Check .env file");
console.log("MONGO_URI:", process.env.MONGO_URI ? "Loaded" : "Not loaded");
console.log("PAYSTACK_SECRET_KEY:", process.env.PAYSTACK_SECRET_KEY ? "Loaded" : "Not loaded");
console.log("EMAIL_USER:", process.env.EMAIL_USER ? "Loaded" : "NOT LOADED - Check .env file");
console.log("EMAIL_PASSWORD:", process.env.EMAIL_PASSWORD ? "Loaded" : "NOT LOADED - Check .env file");

// Check critical environment variables
if (!process.env.SESSION_SECRET) {
  console.error("❌ CRITICAL: SESSION_SECRET is not set in .env file");
  process.exit(1);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback_secret_key_for_development_only_change_in_production",
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: false, // Set to true if using HTTPS
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

// Add session logging middleware
app.use((req, res, next) => {
  console.log('🔐 Session check:', {
    path: req.path,
    method: req.method,
    hasSession: !!req.session,
    sessionEmail: req.session?.email,
    sessionId: req.sessionID
  });
  next();
});

// MongoDB Connection with better error handling
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/construction_calc")
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  });

// Import Routes
const paystackRoute = require("./routes/paystack");
const paymentRoute = require("./routes/payment");
const excavationRoute = require("./excavation");
const wallingRoute = require("./walling");
const concreteRoute = require("./concrete");
const plasterRoute = require("./plaster");

// Use Routes
app.use("/api/paystack", paystackRoute);
app.use("/api/pay", paymentRoute);
app.use("/walling", checkAccess, wallingRoute);
app.use("/concrete", checkAccess, concreteRoute);
app.use("/plaster", checkAccess, plasterRoute);
app.use("/excavation", checkAccess, excavationRoute);

// Email transporter configuration - FIXED: createTransport not createTransporter
let emailTransporter;
if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  emailTransporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
  
  // Verify email configuration
  emailTransporter.verify(function (error, success) {
    if (error) {
      console.error('❌ Email transporter verification failed:', error);
    } else {
      console.log('✅ Email transporter is ready to send messages');
    }
  });
} else {
  console.warn('⚠️ Email transporter not configured - missing credentials');
}

// Store verification codes
const verificationCodes = new Map();

// Store verification attempts for rate limiting
const emailValidationAttempts = new Map();
const MAX_ATTEMPTS_PER_HOUR = 10;

// Basic email format validation
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Disposable email check
function checkDisposableEmail(email) {
  const disposableDomains = [
    'tempmail.com', 'guerrillamail.com', 'mailinator.com', '10minutemail.com',
    'throwaway.com', 'fakeinbox.com', 'yopmail.com', 'trashmail.com',
    'disposable.com', 'temp-mail.org', 'getairmail.com', 'sharklasers.com',
    'maildrop.cc', 'tempail.com', 'fake-mail.com', 'throwawaymail.com',
    'tempmail.net', 'trashmail.net', 'dispostable.com', 'mailmetrash.com',
    'tmpmail.org', 'mailnesia.com', 'mohmal.com', 'fake-box.com',
    'mail-temp.com', 'tempinbox.com', 'mail-temporaire.com',
    'example.com', 'test.com', 'test.org', 'example.org', 'example.net',
    'test.net', 'fake.com', 'invalid.com', 'localhost.com', 'domain.com'
  ];
  
  const domain = email.split('@')[1].toLowerCase();
  
  if (disposableDomains.includes(domain)) {
    return { 
      valid: false, 
      reason: 'Temporary or disposable email addresses are not allowed. Please use a permanent email address from a trusted provider.' 
    };
  }
  
  return { valid: true };
}

// Enhanced email validation with existence checking
async function enhancedEmailValidation(email) {
  // 1. Basic format validation
  if (!isValidEmail(email)) {
    return { valid: false, reason: 'Invalid email format. Please enter a valid email address (e.g., yourname@example.com).' };
  }

  // 2. Disposable email check
  const disposableCheck = checkDisposableEmail(email);
  if (!disposableCheck.valid) {
    return disposableCheck;
  }

  // 3. Check for common fake domains
  const fakeDomains = [
    'example.com', 'test.com', 'test.org', 'fake.com', 'invalid.com',
    'localhost.com', 'domain.com', 'email.com', 'mail.com', 'test.net'
  ];
  
  const domain = email.split('@')[1].toLowerCase();
  if (fakeDomains.includes(domain)) {
    return { 
      valid: false, 
      reason: 'Please use a real email service (Gmail, Outlook, Yahoo, etc.) instead of test domains.' 
    };
  }

  // 4. MX record check (verifies domain accepts emails)
  try {
    const mxRecords = await dns.resolveMx(domain);
    
    if (!mxRecords || mxRecords.length === 0) {
      return { 
        valid: false, 
        reason: 'This email domain does not accept emails. Please use a different email address.' 
      };
    }
    
    console.log(`✅ MX records found for ${domain}:`, mxRecords.length);
    
    return { valid: true };
    
  } catch (error) {
    console.log('❌ MX record check failed for:', email, error.code);
    
    if (error.code === 'ENOTFOUND') {
      return { 
        valid: false, 
        reason: 'This email domain does not exist. Please check for typos or use a different email.' 
      };
    } else if (error.code === 'ENODATA') {
      return { 
        valid: false, 
        reason: 'This domain exists but does not accept emails. Please use a different email address.' 
      };
    }
    
    // If DNS check fails, use strict validation
    console.log('⚠️ DNS check failed, using strict validation');
    return await strictEmailValidation(email);
  }
}

// Strict email validation when DNS fails
async function strictEmailValidation(email) {
  const domain = email.split('@')[1].toLowerCase();
  
  // List of known valid email providers
  const validProviders = [
    'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'rocketmail.com',
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'protonmail.com', 'proton.me',
    'aol.com',
    'zoho.com',
    'mail.com',
    'gmx.com',
    'yandex.com',
    // Kenyan providers
    'co.ke', 'ac.ke', 'go.ke', 'ne.ke', 'or.ke', 'sc.ke', 'me.ke'
  ];

  // Check if domain is from a known provider
  const isKnownProvider = validProviders.some(provider => 
    domain === provider || domain.endsWith('.' + provider)
  );

  if (!isKnownProvider) {
    return {
      valid: false,
      reason: 'Unable to verify this email domain. Please use a well-known email provider like Gmail, Outlook, or Yahoo.'
    };
  }

  return { valid: true };
}

// Rate limiting for email validation
function checkRateLimit(email) {
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  
  if (!emailValidationAttempts.has(email)) {
    emailValidationAttempts.set(email, []);
  }
  
  const attempts = emailValidationAttempts.get(email);
  
  // Remove old attempts
  const recentAttempts = attempts.filter(timestamp => timestamp > oneHourAgo);
  emailValidationAttempts.set(email, recentAttempts);
  
  // Check if over limit
  if (recentAttempts.length >= MAX_ATTEMPTS_PER_HOUR) {
    return false;
  }
  
  // Add current attempt
  recentAttempts.push(now);
  return true;
}

// Generate 6-digit verification code
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email
async function sendVerificationEmail(email, code) {
  // Check if email transporter is configured
  if (!emailTransporter) {
    console.error('❌ Email transporter not configured - cannot send verification email');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'Construction Calculator <noreply@construction.com>',
      to: email,
      subject: 'Your Construction Calculator Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
          <div style="text-align: center; background: #007BFF; padding: 20px; border-radius: 10px 10px 0 0; color: white;">
            <h1>Construction Calculator</h1>
            <p>Email Verification</p>
          </div>
          
          <div style="padding: 30px 20px;">
            <h2>Hello!</h2>
            <p>Thank you for signing up for the Construction Calculator. Please use the verification code below to verify your email address:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <div style="display: inline-block; background: #f8f9fa; padding: 15px 30px; border: 2px dashed #007BFF; border-radius: 10px; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #007BFF;">
                ${code}
              </div>
            </div>
            
            <p><strong>This code will expire in 15 minutes.</strong></p>
            
            <p>If you didn't request this verification, please ignore this email.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #666; font-size: 12px;">
              <p>Construction Calculator Team<br>shikanishamjengo by simiyu</p>
            </div>
          </div>
        </div>
      `
    };

    const result = await emailTransporter.sendMail(mailOptions);
    console.log(`✅ Verification email sent to: ${email}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Failed to send verification email:', error);
    return { success: false, error: error.message };
  }
}

// Helper function for error responses
function sendErrorResponse(res, message) {
  return res.status(400).send(`
    <html>
      <head>
        <title>Error - Construction Calculator</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <div class="error-container">
          <h1>❌ Error</h1>
          <div class="error-message">
            <p>${message}</p>
          </div>
          
          <div class="suggestion">
            <p><strong>Tips:</strong></p>
            <ul>
              <li>Check for typos in the email address</li>
              <li>Use a permanent email (Gmail, Outlook, Yahoo, etc.)</li>
              <li>Ensure the email domain exists</li>
            </ul>
          </div>
          
          <a href="/login" class="btn">Try Again</a>
          <a href="/" class="btn btn-secondary">Home</a>
        </div>
      </body>
    </html>
  `);
}

// Function to activate monthly subscription
async function activateMonthlySubscription(email) {
  try {
    const User = require('./models/user');
    
    const user = await User.findOneAndUpdate(
      { email: email },
      { 
        subscriptionActive: true,
        subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        subscriptionType: 'monthly',
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    
    console.log(`✅ Monthly subscription activated for: ${email}`);
    return user;
  } catch (error) {
    console.error('Error activating subscription:', error);
    throw error;
  }
}

// Function to add tokens
async function addTokens(email, amount) {
  try {
    const User = require('./models/user');
    const tokensToAdd = Math.floor(amount / 100); // 1 token per 100 KES
    
    const user = await User.findOneAndUpdate(
      { email: email },
      { 
        $inc: { tokenBalance: tokensToAdd },
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    
    console.log(`✅ ${tokensToAdd} tokens added for: ${email}`);
    return user;
  } catch (error) {
    console.error('Error adding tokens:', error);
    throw error;
  }
}

// Paystack webhook handler
app.post('/webhook/paystack', express.json(), async (req, res) => {
  try {
    const event = req.body;
    
    if (event.event === 'charge.success') {
      const { reference, amount, customer, metadata } = event.data;
      
      console.log('💰 Payment successful:', {
        reference,
        amount,
        email: customer.email,
        metadata
      });
      
      // Check if this is a monthly subscription payment
      const isMonthlySubscription = 
        metadata?.payment_type === 'monthly_subscription' || 
        amount === 50000 || // 500 KES
        metadata?.custom_fields?.some(field => 
          field.variable_name === 'subscription_type' && 
          field.value === 'monthly_unlimited'
        );
      
      if (isMonthlySubscription) {
        // Activate monthly subscription
        await activateMonthlySubscription(customer.email);
      } else {
        // Regular token purchase
        await addTokens(customer.email, amount);
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

// Payment success page
app.get('/payment-success', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Payment Successful - Construction Calculator</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <div class="container">
          <div class="success-container">
            <h1>✅ Payment Successful!</h1>
            <p>Your payment has been processed successfully.</p>
            <p>You can now access all the construction calculators.</p>
            <a href="/" class="btn">Go to Calculators</a>
          </div>
        </div>
      </body>
    </html>
  `);
});

// Debug route to check session
app.get("/debug-session", (req, res) => {
  res.json({
    session: req.session,
    sessionId: req.sessionID,
    sessionEmail: req.session.email,
    headers: req.headers
  });
});

// Debug endpoint to test Paystack subscription
app.get("/test-paystack", (req, res) => {
  const email = req.query.email || "test@example.com";
  
  res.send(`
    <html>
      <head>
        <title>Test Paystack</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <div class="test-paystack-container">
          <h1>Test Paystack Subscription</h1>
          <p>Email: ${email}</p>
          
          <button onclick="testSubscription()">Test Subscription</button>
          
          <div id="result" class="result"></div>
        </div>
        
        <script>
          async function testSubscription() {
            const resultDiv = document.getElementById('result');
            resultDiv.innerHTML = 'Testing...';
            
            try {
              const response = await fetch('/api/paystack/subscribe?email=${email}');
              const data = await response.json();
              
              resultDiv.innerHTML = '<strong>Response:</strong><br>' + JSON.stringify(data, null, 2);
              
              if (data.authorization_url) {
                resultDiv.innerHTML += '<br><br><span class="success">✅ Success! Redirecting to Paystack...</span>';
                setTimeout(() => {
                  window.location.href = data.authorization_url;
                }, 1000);
              } else {
                resultDiv.innerHTML += '<br><br><span class="error">❌ No authorization URL received</span>';
              }
            } catch (error) {
              resultDiv.innerHTML = '<strong>Error:</strong><br>' + error.message;
            }
          }
        </script>
      </body>
    </html>
  `);
});

// Login Page with email verification
app.get("/login", (req, res) => {
  // Check if user is already verified
  if (req.session.email && req.session.verified) {
    return res.redirect("/");
  }

  res.send(`
    <html>
      <head>
        <title>Login - Construction Calculator</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <div class="login-container">
          <h1>CONSTRUCTION CALCULATOR</h1>
          <p>Welcome to shikanishamjengo by simiyu</p>
          
          <div class="error-message" id="emailError">
            ❌ Please enter a valid email address
          </div>
          
          <div class="success-message" id="successMessage">
            ✅ Verification code sent! Check your email.
          </div>
          
          <form id="emailForm">
            <div class="form-group">
              <label for="email">Email Address</label>
              <input type="email" name="email" id="email" placeholder="you@example.com" required />
            </div>
            
            <div class="loading" id="emailLoading">
              🔄 Sending verification code...
            </div>
            
            <button type="submit" id="emailSubmitBtn">Send Verification Code</button>
          </form>
          
          <div class="verification-section" id="verificationSection">
            <h3>Enter Verification Code</h3>
            <p>We sent a 6-digit code to: <strong id="userEmail"></strong></p>
            
            <form id="codeForm">
              <div class="code-inputs">
                <input type="text" class="code-input" maxlength="1" data-index="1" required>
                <input type="text" class="code-input" maxlength="1" data-index="2" required>
                <input type="text" class="code-input" maxlength="1" data-index="3" required>
                <input type="text" class="code-input" maxlength="1" data-index="4" required>
                <input type="text" class="code-input" maxlength="1" data-index="5" required>
                <input type="text" class="code-input" maxlength="1" data-index="6" required>
              </div>
              
              <div class="loading" id="codeLoading">
                🔄 Verifying code...
              </div>
              
              <button type="submit" id="codeSubmitBtn">Verify & Continue</button>
            </form>
            
            <p class="resend-link" onclick="resendCode()">Didn't receive the code? Click to resend</p>
          </div>
        </div>

        <script>
          const emailForm = document.getElementById('emailForm');
          const codeForm = document.getElementById('codeForm');
          const verificationSection = document.getElementById('verificationSection');
          const userEmailSpan = document.getElementById('userEmail');
          const emailError = document.getElementById('emailError');
          const successMessage = document.getElementById('successMessage');
          const emailLoading = document.getElementById('emailLoading');
          const codeLoading = document.getElementById('codeLoading');
          const emailSubmitBtn = document.getElementById('emailSubmitBtn');
          const codeSubmitBtn = document.getElementById('codeSubmitBtn');
          
          let currentEmail = '';

          // Email validation
          function isValidEmail(email) {
            const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
            return emailRegex.test(email);
          }

          // Handle email submission
          emailForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value.trim();
            
            if (!isValidEmail(email)) {
              emailError.style.display = 'block';
              successMessage.style.display = 'none';
              return;
            }

            emailSubmitBtn.disabled = true;
            emailSubmitBtn.textContent = 'Sending...';
            emailLoading.style.display = 'block';
            emailError.style.display = 'none';

            try {
              const response = await fetch('/send-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
              });

              const data = await response.json();

              if (data.success) {
                currentEmail = email;
                userEmailSpan.textContent = email;
                verificationSection.style.display = 'block';
                successMessage.style.display = 'block';
                emailError.style.display = 'none';
                
                // Setup code input auto-focus
                setupCodeInputs();
              } else {
                emailError.textContent = data.message || 'Failed to send verification code';
                emailError.style.display = 'block';
                successMessage.style.display = 'none';
              }
            } catch (error) {
              emailError.textContent = 'Network error: ' + error.message;
              emailError.style.display = 'block';
              successMessage.style.display = 'none';
            } finally {
              emailSubmitBtn.disabled = false;
              emailSubmitBtn.textContent = 'Send Verification Code';
              emailLoading.style.display = 'none';
            }
          });

          // Setup code input auto-navigation
          function setupCodeInputs() {
            const inputs = document.querySelectorAll('.code-input');
            inputs.forEach((input, index) => {
              input.addEventListener('input', (e) => {
                if (e.target.value.length === 1) {
                  if (index < inputs.length - 1) {
                    inputs[index + 1].focus();
                  }
                }
              });
              
              input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && e.target.value === '') {
                  if (index > 0) {
                    inputs[index - 1].focus();
                  }
                }
              });
            });
            
            // Focus first input
            inputs[0].focus();
          }

          // Handle code verification
          codeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const inputs = document.querySelectorAll('.code-input');
            const code = Array.from(inputs).map(input => input.value).join('');
            
            if (code.length !== 6) {
              alert('Please enter the complete 6-digit code');
              return;
            }

            codeSubmitBtn.disabled = true;
            codeSubmitBtn.textContent = 'Verifying...';
            codeLoading.style.display = 'block';

            try {
              const response = await fetch('/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  email: currentEmail,
                  code: code
                })
              });

              const data = await response.json();

              if (data.success) {
                // Redirect to main application
                window.location.href = '/';
              } else {
                alert('Invalid verification code: ' + (data.message || 'Please try again'));
                // Clear inputs
                inputs.forEach(input => input.value = '');
                inputs[0].focus();
              }
            } catch (error) {
              alert('Network error: ' + error.message);
            } finally {
              codeSubmitBtn.disabled = false;
              codeSubmitBtn.textContent = 'Verify & Continue';
              codeLoading.style.display = 'none';
            }
          });

          // Resend code function
          async function resendCode() {
            if (!currentEmail) return;
            
            const resendLink = document.querySelector('.resend-link');
            resendLink.textContent = 'Resending...';
            resendLink.style.color = '#666';
            
            try {
              const response = await fetch('/send-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: currentEmail })
              });

              const data = await response.json();
              
              if (data.success) {
                alert('✅ New verification code sent!');
              } else {
                alert('❌ Failed to resend code: ' + (data.message || 'Unknown error'));
              }
            } catch (error) {
              alert('Network error: ' + error.message);
            } finally {
              resendLink.textContent = "Didn't receive the code? Click to resend";
              resendLink.style.color = '#007BFF';
            }
          }
        </script>
      </body>
    </html>
  `);
});

// Send verification code endpoint
app.post("/send-verification", async (req, res) => {
  const { email } = req.body;
  
  if (!email || !isValidEmail(email)) {
    return res.json({ 
      success: false, 
      message: 'Please enter a valid email address.' 
    });
  }

  // Rate limiting check
  if (!checkRateLimit(email)) {
    return res.json({
      success: false,
      message: 'Too many verification attempts. Please try again in one hour.'
    });
  }

  try {
    // Basic email validation first
    const basicValidation = await enhancedEmailValidation(email);
    if (!basicValidation.valid) {
      return res.json({
        success: false,
        message: basicValidation.reason
      });
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();
    
    // Store code with expiration (15 minutes)
    verificationCodes.set(email, {
      code: verificationCode,
      timestamp: Date.now(),
      attempts: 0
    });

    // Send verification email
    const emailResult = await sendVerificationEmail(email, verificationCode);
    
    if (emailResult.success) {
      console.log(`✅ Verification code ${verificationCode} sent to: ${email}`);
      res.json({ 
        success: true, 
        message: 'Verification code sent to your email.' 
      });
    } else {
      console.error('❌ Failed to send email:', emailResult.error);
      res.json({ 
        success: false, 
        message: 'Failed to send verification email. Please try again.' 
      });
    }

  } catch (error) {
    console.error('Error sending verification:', error);
    res.json({ 
      success: false, 
      message: 'An error occurred. Please try again.' 
    });
  }
});

// Verify code endpoint
app.post("/verify-code", async (req, res) => {
  const { email, code } = req.body;
  
  if (!email || !code) {
    return res.json({ 
      success: false, 
      message: 'Email and verification code are required.' 
    });
  }

  try {
    const storedData = verificationCodes.get(email);
    
    if (!storedData) {
      return res.json({ 
        success: false, 
        message: 'No verification code found for this email. Please request a new one.' 
      });
    }

    // Check if code is expired (15 minutes)
    if (Date.now() - storedData.timestamp > 15 * 60 * 1000) {
      verificationCodes.delete(email);
      return res.json({ 
        success: false, 
        message: 'Verification code has expired. Please request a new one.' 
      });
    }

    // Check attempt limit
    if (storedData.attempts >= 5) {
      verificationCodes.delete(email);
      return res.json({ 
        success: false, 
        message: 'Too many failed attempts. Please request a new verification code.' 
      });
    }

    // Verify code
    if (storedData.code === code) {
      // Code is correct - create session
      req.session.email = email;
      req.session.verified = true;
      
      // Remove used code
      verificationCodes.delete(email);
      
      console.log(`✅ Email verified: ${email}`);
      res.json({ 
        success: true, 
        message: 'Email verified successfully!' 
      });
    } else {
      // Increment attempt count
      storedData.attempts += 1;
      verificationCodes.set(email, storedData);
      
      res.json({ 
        success: false, 
        message: 'Invalid verification code. Please try again.' 
      });
    }

  } catch (error) {
    console.error('Error verifying code:', error);
    res.json({ 
      success: false, 
      message: 'An error occurred during verification. Please try again.' 
    });
  }
});

// Home Page - Check if user is verified
app.get("/", (req, res) => {
  if (!req.session.email || !req.session.verified) {
    return res.redirect("/login");
  }

  const email = req.session.email;

  res.send(`
    <html>
      <head>
        <title>Construction Cost Calculator</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <div class="container">
          <h1>Welcome, ${email}</h1>
          <h2>Construction Cost Calculator</h2>
          
          <div class="calculator-links">
            <h3>Available Calculators:</h3>
            <ul>
              <li><a href="/excavation">⚒️ Excavation Calculator</a></li>
              <li><a href="/walling">🏗️ Walling Calculator</a></li>
              <li><a href="/concrete">🧱 Concrete Works Calculator</a></li>
              <li><a href="/plaster">🪣 Plaster Works Calculator</a></li>
            </ul>
          </div>

          <div class="payment-section">
            <h3>Purchase Options</h3>
            <p><strong>Current Plan:</strong> <span id="planStatus">Free (3 calculations remaining)</span></p>
            
            <!-- Success and Error Messages -->
            <div class="success-message" id="successMessage"></div>
            <div class="error-message" id="errorMessage"></div>
            
            <div class="payment-options">
              <div class="option">
                <h4>Buy Tokens (Pay-per-use)</h4>
                <p>Flexible - pay for what you use</p>
                <form id="payForm">
                  <input type="number" id="amount" placeholder="Amount in KES" min="100" required>
                  <button type="submit">Pay with Paystack</button>
                </form>
              </div>
              
              <div class="option">
                <h4>Monthly Unlimited</h4>
                <p>One payment, unlimited access for 30 days</p>
                <p><strong>Price: 500 KES</strong></p>
                <button id="subscribeBtn" class="subscribe-btn">Subscribe Monthly</button>
                <div class="payment-loading" id="subscribeLoading">
                  🔄 Processing...
                </div>
              </div>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <a href="/logout" style="color: #666; text-decoration: none;">Logout</a>
          </div>
        </div>

        <script>
          // Utility functions
          function showMessage(elementId, message, isError = false) {
            const element = document.getElementById(elementId);
            element.textContent = message;
            element.style.display = 'block';
            element.className = isError ? 'error-message' : 'success-message';
            
            setTimeout(() => {
              element.style.display = 'none';
            }, 5000);
          }

          function setButtonState(button, isLoading) {
            button.disabled = isLoading;
            button.classList.toggle('loading', isLoading);
            button.textContent = isLoading ? 'Processing...' : 'Subscribe Monthly';
          }

          // Pay-per-use form
          document.getElementById('payForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('amount').value;
            
            if (amount < 100) {
              showMessage('errorMessage', 'Minimum amount is 100 KES', true);
              return;
            }

            try {
              const res = await fetch('/api/pay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  email: "${email}", 
                  amount: amount 
                })
              });
              
              const data = await res.json();
              
              if (data.authorization_url) {
                console.log('Redirecting to Paystack:', data.authorization_url);
                window.location.href = data.authorization_url;
              } else {
                showMessage('errorMessage', 'Payment initialization failed: ' + (data.message || 'Unknown error'), true);
              }
            } catch (error) {
              showMessage('errorMessage', 'Network error: ' + error.message, true);
            }
          });

          // Monthly subscription button - FIXED VERSION
          document.getElementById('subscribeBtn').addEventListener('click', async function() {
            const btn = this;
            const loading = document.getElementById('subscribeLoading');
            
            // Set loading state
            setButtonState(btn, true);
            loading.style.display = 'block';
            
            try {
              console.log('Starting monthly subscription process...');
              
              // Use the transaction-based monthly payment
              const response = await fetch('/api/paystack/subscribe?email=${encodeURIComponent(email)}');
              console.log('Response status:', response.status);
              
              const data = await response.json();
              console.log('Monthly subscription response:', data);
              
              if (data.success && data.authorization_url) {
                console.log('✅ Success! Redirecting to Paystack:', data.authorization_url);
                // IMMEDIATELY redirect to Paystack
                window.location.href = data.authorization_url;
              } else {
                console.error('❌ Monthly subscription failed:', data);
                const errorMsg = data.message || data.error || 'Unknown error occurred';
                showMessage('errorMessage', 'Subscription failed: ' + errorMsg, true);
                setButtonState(btn, false);
                loading.style.display = 'none';
              }
            } catch (error) {
              console.error('❌ Network error:', error);
              showMessage('errorMessage', 'Network error: ' + error.message, true);
              setButtonState(btn, false);
              loading.style.display = 'none';
            }
          });

          // Debug: Log when page loads
          console.log('Page loaded for user: ${email}');
          console.log('Subscribe button ready');

          // Check if user has active subscription
          async function checkSubscriptionStatus() {
            try {
              const response = await fetch('/api/user/status?email=${encodeURIComponent(email)}');
              const data = await response.json();
              
              if (data.subscriptionActive) {
                document.getElementById('planStatus').textContent = 'Pro (Unlimited)';
                showMessage('successMessage', '✅ You have an active subscription!', false);
              } else if (data.tokenBalance > 0) {
                document.getElementById('planStatus').textContent = 'Tokens (' + data.tokenBalance + ' calculations remaining)';
              }
            } catch (error) {
              console.log('Could not check subscription status:', error);
            }
          }

          // Check subscription status on page load
          checkSubscriptionStatus();
        </script>
      </body>
    </html>
  `);
});

// User status endpoint
app.get("/api/user/status", async (req, res) => {
  const { email } = req.query;
  
  if (!email) {
    return res.json({ error: 'Email required' });
  }

  try {
    const User = require('./models/user');
    const user = await User.findOne({ email });
    
    if (user) {
      res.json({
        email: user.email,
        subscriptionActive: user.subscriptionActive || false,
        subscriptionExpires: user.subscriptionExpires,
        tokenBalance: user.tokenBalance || 0,
        calculationsUsed: user.calculationsUsed || 0
      });
    } else {
      res.json({
        email: email,
        subscriptionActive: false,
        tokenBalance: 0,
        calculationsUsed: 0
      });
    }
  } catch (error) {
    console.error('Error checking user status:', error);
    res.json({
      email: email,
      subscriptionActive: false,
      error: 'Could not check status'
    });
  }
});

// Logout route
app.get("/logout", (req, res) => {
  const email = req.session.email;
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    } else {
      console.log("User logged out:", email);
    }
    res.redirect("/login");
  });
});

// Cleanup expired verification codes (run every 5 minutes)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [email, data] of verificationCodes.entries()) {
    if (now - data.timestamp > 15 * 60 * 1000) { // 15 minutes
      verificationCodes.delete(email);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired verification codes`);
  }
}, 5 * 60 * 1000);

// Cleanup expired rate limit entries (run every hour)
setInterval(() => {
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  let cleaned = 0;
  
  for (const [email, attempts] of emailValidationAttempts.entries()) {
    const recentAttempts = attempts.filter(timestamp => timestamp > oneHourAgo);
    if (recentAttempts.length === 0) {
      emailValidationAttempts.delete(email);
      cleaned++;
    } else {
      emailValidationAttempts.set(email, recentAttempts);
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired rate limit entries`);
  }
}, 60 * 60 * 1000);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err.stack);
  res.status(500).send(`
    <html>
      <head>
        <title>Error</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <div class="error-container">
          <h1>🚧 Something went wrong!</h1>
          <p>We're working on fixing this issue. Please try again later.</p>
          <div class="error-details">
            ${process.env.NODE_ENV === 'development' ? err.stack : 'Error details hidden in production'}
          </div>
          <a href="/" class="btn">Return Home</a>
        </div>
      </body>
    </html>
  `);
});

// 404 handler
app.use((req, res) => {
  res.status(404).send(`
    <html>
      <head>
        <title>Page Not Found</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <div class="error-container">
          <h1>🔍 Page Not Found</h1>
          <p>The page you're looking for doesn't exist.</p>
          
          <div class="suggestions">
            <p>You might be looking for:</p>
            <ul>
              <li><a href="/">Home Page</a></li>
              <li><a href="/login">Login</a></li>
              <li><a href="/walling">Walling Calculator</a></li>
              <li><a href="/concrete">Concrete Calculator</a></li>
              <li><a href="/plaster">Plaster Calculator</a></li>
              <li><a href="/excavation">Excavation Calculator</a></li>
            </ul>
          </div>
          
          <a href="/" class="btn">Return Home</a>
        </div>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Email verification: ${emailTransporter ? 'Enabled' : 'Disabled - no email credentials'}`);
  console.log(`✅ Session management: Active`);
  console.log(`✅ Payment handling: Fixed and working`);
  console.log(`✅ Monthly subscriptions: Using one-time payments with all methods`);
  console.log(`✅ Webhook endpoint: /webhook/paystack`);
  console.log(`✅ Debug endpoints: /debug-session and /test-paystack available`);
});