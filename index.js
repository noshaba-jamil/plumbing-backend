/**
 * ═══════════════════════════════════════════════════════════════
 *  Springfield Emergency Plumbing — Backend API Server
 *  Stack: Express + MongoDB (Mongoose) + JWT + Nodemailer
 * ═══════════════════════════════════════════════════════════════
 *
 *  Routes:
 *    GET  /                          → Health check
 *    POST /api/contact               → Submit contact form (public)
 *    POST /api/admin/login           → Admin login → returns JWT
 *    GET  /api/leads                 → Get all leads (JWT protected)
 *    PATCH /api/leads/:id/contacted  → Mark lead contacted (JWT protected)
 *
 *  Deploy to: Render, Railway, Heroku, or any Node host
 * ═══════════════════════════════════════════════════════════════
 */

// ── LOAD ENV VARIABLES FIRST ─────────────────────────────────
require('dotenv').config()
console.log('PORT:', process.env.PORT);
console.log('MONGO_URI:', process.env.MONGO_URI ? 'Loaded' : 'Not loaded');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Loaded' : 'Not loaded');

// ── IMPORTS ──────────────────────────────────────────────────
const express    = require('express')
const cors       = require('cors')
const mongoose   = require('mongoose')
const jwt        = require('jsonwebtoken')
const bcrypt     = require('bcrypt')
const nodemailer = require('nodemailer')

// ── MODELS ────────────────────────────────────────────────────
const Lead = require('./models/Lead')

// ── APP SETUP ─────────────────────────────────────────────────
const app  = express()
const PORT = process.env.PORT || 5000

// ── ENVIRONMENT VALIDATION ───────────────────────────────────
// Warn on startup if critical env vars are missing
const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD']
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key])
if (missingEnv.length > 0) {
  console.warn('⚠️  Missing environment variables:', missingEnv.join(', '))
  console.warn('   Copy .env.example to .env and fill in your values.')
}

// ── CORS ─────────────────────────────────────────────────────
// Allow requests from your React frontend
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://localhost:5173', // Vite default port
]

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      console.warn(`CORS blocked request from origin: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
)

// ── BODY PARSER ───────────────────────────────────────────────
app.use(express.json({ limit: '10kb' })) // Limit body size for security

// ── REQUEST LOGGER (development only) ────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`→ ${req.method} ${req.path}`)
    next()
  })
}

// ══════════════════════════════════════════════════════════════
//  MONGODB CONNECTION
// ══════════════════════════════════════════════════════════════
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // These options prevent deprecation warnings
      serverSelectionTimeoutMS: 5000,
    })
    console.log(`✅ MongoDB connected: ${conn.connection.host}`)
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message)
    console.error('   Check your MONGO_URI in .env')
    process.exit(1) // Exit if DB connection fails
  }
}

// ══════════════════════════════════════════════════════════════
//  EMAIL TRANSPORTER (Nodemailer + Gmail)
// ══════════════════════════════════════════════════════════════
const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️  Email not configured — notifications disabled')
    return null
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Use Gmail App Password, NOT your real password
    },
  })
}

const transporter = createTransporter()

/**
 * sendLeadNotification — Email alert when a new lead arrives
 * @param {Object} lead - The lead document from MongoDB
 */
const sendLeadNotification = async (lead) => {
  if (!transporter) return // Email not configured — skip silently

  const mailOptions = {
    from: `"Springfield Plumbing Website" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_USER,
    subject: `🚨 New Lead: ${lead.name} — ${lead.service || 'Plumbing Inquiry'}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Inter', Arial, sans-serif; background: #F4F6FB; margin: 0; padding: 0; }
          .wrapper { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(11,31,58,0.1); }
          .header { background: #0B1F3A; padding: 28px 32px; border-bottom: 4px solid #E8321C; }
          .header h1 { color: #fff; margin: 0; font-size: 20px; }
          .header p  { color: rgba(255,255,255,0.6); margin: 6px 0 0; font-size: 13px; }
          .body { padding: 32px; }
          .alert-box { background: #FFF3F2; border-left: 4px solid #E8321C; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px; }
          .alert-box p { margin: 0; color: #c0392b; font-weight: 700; font-size: 15px; }
          .field { margin-bottom: 18px; }
          .field label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6B7A8F; margin-bottom: 4px; }
          .field value { display: block; font-size: 15px; color: #0B1F3A; font-weight: 600; }
          .message-box { background: #F8FAFC; border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px; margin-top: 8px; }
          .message-box p { margin: 0; color: #374151; line-height: 1.7; }
          .cta { background: #E8321C; color: #fff; display: inline-block; padding: 13px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; margin-top: 24px; }
          .footer { background: #F8FAFC; padding: 20px 32px; border-top: 1px solid #E5E7EB; font-size: 12px; color: #9CA3AF; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="header">
            <h1>📋 New Lead Received</h1>
            <p>Springfield Emergency Plumbing — Contact Form Submission</p>
          </div>
          <div class="body">
            <div class="alert-box">
              <p>⚡ New customer inquiry — respond quickly to maximize conversion!</p>
            </div>

            <div class="field">
              <label>Customer Name</label>
              <value>${lead.name}</value>
            </div>
            <div class="field">
              <label>Phone Number</label>
              <value><a href="tel:${lead.phone}" style="color:#E8321C;">${lead.phone}</a></value>
            </div>
            <div class="field">
              <label>Email Address</label>
              <value><a href="mailto:${lead.email}" style="color:#E8321C;">${lead.email}</a></value>
            </div>
            ${lead.address ? `<div class="field"><label>Service Address</label><value>${lead.address}</value></div>` : ''}
            ${lead.service ? `<div class="field"><label>Service Requested</label><value>${lead.service}</value></div>` : ''}
            <div class="field">
              <label>Message</label>
              <div class="message-box"><p>${lead.message || 'No message provided'}</p></div>
            </div>
            <div class="field">
              <label>Submitted At</label>
              <value>${new Date(lead.createdAt).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' })} CST</value>
            </div>

            <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/admin" class="cta">
              View in Admin Dashboard →
            </a>
          </div>
          <div class="footer">
            This email was sent automatically when a visitor submitted the contact form on your website.
            To manage leads, visit your admin dashboard.
          </div>
        </div>
      </body>
      </html>
    `,
    // Plain text fallback
    text: `
New Lead: ${lead.name}
Phone: ${lead.phone}
Email: ${lead.email}
${lead.address ? `Address: ${lead.address}` : ''}
${lead.service ? `Service: ${lead.service}` : ''}
Message: ${lead.message}
Submitted: ${new Date(lead.createdAt).toLocaleString()}
    `.trim(),
  }

  try {
    await transporter.sendMail(mailOptions)
    console.log(`📧 Lead notification email sent for: ${lead.name}`)
  } catch (err) {
    // Log but don't crash the server — email failure shouldn't block lead saving
    console.error('⚠️  Email notification failed:', err.message)
  }
}

// ══════════════════════════════════════════════════════════════
//  JWT MIDDLEWARE — Protect admin routes
// ══════════════════════════════════════════════════════════════

/**
 * verifyToken — Express middleware
 * Checks Authorization header for valid Bearer JWT
 * Attaches decoded payload to req.admin
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No token provided.' })
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.admin = decoded
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please log in again.' })
    }
    return res.status(401).json({ message: 'Invalid token. Please log in again.' })
  }
}

// ══════════════════════════════════════════════════════════════
//  RATE LIMITING — Simple in-memory limiter
//  (For production, use express-rate-limit package instead)
// ══════════════════════════════════════════════════════════════
const requestCounts = new Map()

const rateLimit = (maxRequests, windowMs) => (req, res, next) => {
  const key     = req.ip + req.path
  const now     = Date.now()
  const record  = requestCounts.get(key) || { count: 0, startTime: now }

  // Reset window if expired
  if (now - record.startTime > windowMs) {
    record.count     = 0
    record.startTime = now
  }

  record.count++
  requestCounts.set(key, record)

  if (record.count > maxRequests) {
    return res.status(429).json({
      message: 'Too many requests. Please wait a moment and try again.',
    })
  }

  next()
}

// ══════════════════════════════════════════════════════════════
//  ADMIN CREDENTIALS SETUP
//  Passwords are hashed at startup using bcrypt
// ══════════════════════════════════════════════════════════════
let hashedAdminPassword = null

const setupAdminCredentials = async () => {
  const rawPassword = process.env.ADMIN_PASSWORD || 'admin123'
  hashedAdminPassword = await bcrypt.hash(rawPassword, 12)
  console.log('🔐 Admin credentials initialized')
}

// ══════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════

// ── GET / — Health check ──────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    message: 'Backend is running! 🚀',
    service: 'Springfield Emergency Plumbing API',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    endpoints: {
      healthCheck:    'GET /',
      contactForm:    'POST /api/contact',
      adminLogin:     'POST /api/admin/login',
      getLeads:       'GET /api/leads (JWT required)',
      markContacted:  'PATCH /api/leads/:id/contacted (JWT required)',
    },
  })
})

// ── POST /api/contact — Submit contact form ───────────────────
app.post(
  '/api/contact',
  rateLimit(5, 15 * 60 * 1000), // Max 5 submissions per IP per 15 minutes
  async (req, res) => {
    try {
      const { name, email, phone, address, service, message } = req.body

      // ── VALIDATION ────────────────────────────────────────
      const errors = []
      if (!name?.trim())    errors.push('Name is required')
      if (!email?.trim())   errors.push('Email is required')
      if (!phone?.trim())   errors.push('Phone number is required')
      if (!message?.trim()) errors.push('Message is required')

      // Basic email format check
      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        errors.push('Please enter a valid email address')
      }

      if (errors.length > 0) {
        return res.status(400).json({ message: errors[0], errors })
      }

      // ── SAVE LEAD TO MONGODB ───────────────────────────────
      const lead = await Lead.create({
        name:      name.trim(),
        email:     email.trim().toLowerCase(),
        phone:     phone.trim(),
        address:   address?.trim() || '',
        service:   service?.trim() || '',
        message:   message?.trim() || '',
        ipAddress: req.ip || '',
      })

      console.log(`✅ New lead saved: ${lead.name} (${lead.phone})`)

      // ── SEND EMAIL NOTIFICATION ────────────────────────────
      // Don't await — fire and forget so user isn't waiting for email
      sendLeadNotification(lead).catch(() => {})

      // ── RESPOND TO CLIENT ──────────────────────────────────
      return res.status(201).json({
        success: true,
        message: 'Your message was received. We will contact you shortly.',
        leadId: lead._id,
      })
    } catch (err) {
      // Handle Mongoose validation errors
      if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(e => e.message)
        return res.status(400).json({ message: messages[0], errors: messages })
      }
      console.error('❌ /api/contact error:', err.message)
      return res.status(500).json({
        message: 'Server error. Please call us directly at (417) 000-0000.',
      })
    }
  }
)

// ── POST /api/admin/login — Admin authentication ──────────────
app.post(
  '/api/admin/login',
  rateLimit(10, 15 * 60 * 1000), // Max 10 login attempts per IP per 15 min
  async (req, res) => {
    try {
      const { username, password } = req.body

      if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' })
      }

      // ── CHECK USERNAME ─────────────────────────────────────
      const adminUsername = process.env.ADMIN_USERNAME || 'admin'
      if (username.trim() !== adminUsername) {
        // Use same message for username and password to prevent user enumeration
        return res.status(401).json({ message: 'Invalid username or password' })
      }

      // ── CHECK PASSWORD (bcrypt compare) ───────────────────
      const passwordMatch = await bcrypt.compare(password, hashedAdminPassword)
      if (!passwordMatch) {
        console.warn(`⚠️  Failed login attempt for username: ${username} from IP: ${req.ip}`)
        return res.status(401).json({ message: 'Invalid username or password' })
      }

      // ── GENERATE JWT TOKEN ─────────────────────────────────
      const token = jwt.sign(
        {
          username: adminUsername,
          role: 'admin',
          iat: Math.floor(Date.now() / 1000),
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' } // Token valid for 8 hours
      )

      console.log(`✅ Admin login successful: ${adminUsername} from IP: ${req.ip}`)

      return res.json({
        success: true,
        token,
        user: { username: adminUsername, role: 'admin' },
        message: 'Login successful',
      })
    } catch (err) {
      console.error('❌ /api/admin/login error:', err.message)
      return res.status(500).json({ message: 'Server error during login' })
    }
  }
)

// ── GET /api/leads — Fetch all leads ─────────────────────────
app.get('/api/leads', verifyToken, async (req, res) => {
  try {
    // Return all leads, newest first
    const leads = await Lead.find({})
      .sort({ createdAt: -1 })
      .select('-__v -ipAddress') // Exclude internal fields
      .lean() // Return plain JS objects (faster)

    return res.json(leads)
  } catch (err) {
    console.error('❌ /api/leads error:', err.message)
    return res.status(500).json({ message: 'Failed to fetch leads' })
  }
})

// ── PATCH /api/leads/:id/contacted — Mark lead as contacted ───
app.patch('/api/leads/:id/contacted', verifyToken, async (req, res) => {
  try {
    const { id } = req.params

    // Validate MongoDB ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid lead ID format' })
    }

    const lead = await Lead.findByIdAndUpdate(
      id,
      {
        contacted:   true,
        contactedAt: new Date(),
      },
      {
        new:          true,   // Return the updated document
        runValidators: true,
        select: '-__v -ipAddress',
      }
    )

    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' })
    }

    console.log(`✅ Lead marked as contacted: ${lead.name} (${lead._id})`)
    return res.json({ success: true, lead })
  } catch (err) {
    console.error('❌ /api/leads/:id/contacted error:', err.message)
    return res.status(500).json({ message: 'Failed to update lead' })
  }
})

// ── 404 HANDLER ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

// ── GLOBAL ERROR HANDLER ──────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('❌ Unhandled error:', err.message)
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  })
})

// ══════════════════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════════════════
const startServer = async () => {
  try {
    // 1. Hash admin password
    await setupAdminCredentials()

    // 2. Connect to MongoDB
    await connectDB()

    // 3. Start Express server
    app.listen(PORT, () => {
      console.log('\n══════════════════════════════════════════')
      console.log(`  🚀 Server running on port ${PORT}`)
      console.log(`  📋 Health check: http://localhost:${PORT}`)
      console.log(`  🔑 Admin login:  POST /api/admin/login`)
      console.log(`  📬 Contact form: POST /api/contact`)
      console.log(`  📊 Get leads:    GET  /api/leads`)
      console.log('══════════════════════════════════════════\n')
    })
  } catch (err) {
    console.error('❌ Failed to start server:', err.message)
    process.exit(1)
  }
}

startServer()
