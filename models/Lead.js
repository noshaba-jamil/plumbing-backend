/**
 * Lead Model — MongoDB Schema
 * ─────────────────────────────────────────────
 * Stores every contact form submission as a lead.
 * Each lead has a contact status (contacted: true/false)
 * so the admin can track follow-ups.
 */

const mongoose = require('mongoose')

const leadSchema = new mongoose.Schema(
  {
    // ── CUSTOMER DETAILS ──────────────────────
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      maxlength: [30, 'Phone number is too long'],
    },
    address: {
      type: String,
      trim: true,
      maxlength: [200, 'Address is too long'],
      default: '',
    },
    service: {
      type: String,
      trim: true,
      enum: {
        values: [
          'Emergency Plumbing',
          'Drain Cleaning',
          'Leak Detection',
          'Water Heater Repair',
          'Sewer Line Repair',
          'Pipe Repair & Installation',
          'Other',
          '',
        ],
        message: 'Invalid service type',
      },
      default: '',
    },
    message: {
      type: String,
      trim: true,
      maxlength: [2000, 'Message is too long'],
      default: '',
    },

    // ── FOLLOW-UP STATUS ──────────────────────
    contacted: {
      type: Boolean,
      default: false,
    },
    contactedAt: {
      type: Date,
      default: null,
    },

    // ── METADATA ─────────────────────────────
    // IP address for spam detection (optional)
    ipAddress: {
      type: String,
      default: '',
    },
  },
  {
    // Automatically adds createdAt and updatedAt fields
    timestamps: true,
  }
)

// ── INDEXES ───────────────────────────────────
// Speed up common admin queries
leadSchema.index({ createdAt: -1 })   // sort by newest first
leadSchema.index({ contacted: 1 })    // filter by status
leadSchema.index({ name: 'text', email: 'text', service: 'text' }) // text search

// ── VIRTUAL: formatted date ───────────────────
leadSchema.virtual('formattedDate').get(function () {
  return this.createdAt?.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
})

module.exports = mongoose.model('Lead', leadSchema)
