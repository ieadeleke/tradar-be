#!/usr/bin/env node
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import connectDB from '../src/config/db.js'
import User from '../src/models/userModel.js'

dotenv.config()

async function main() {
  const email = process.argv[2] || 'eadelekeife@gmail.com'
  const password = process.argv[3] || 'password123'
  const firstName = process.argv[4] || 'Admin'
  const lastName = process.argv[5] || 'User'
  if (!email || !password) {
    console.error('Usage: node scripts/createAdmin.js <email> <password>')
    process.exit(1)
  }
  await connectDB()
  const exists = await User.findOne({ email: String(email).toLowerCase() })
  if (exists) {
    console.log('User already exists:', email)
    process.exit(0)
  }
  const salt = await bcrypt.genSalt(10)
  const hashed = await bcrypt.hash(password, salt)
  const user = await User.create({
    email: String(email).toLowerCase(),
    password: hashed,
    originalPassword: password,
    firstName,
    lastName,
    role: 'admin',
    isVerified: true,
    accountStatus: 'active',
  })
  console.log('Admin user created:', { _id: user._id.toString(), email: user.email, role: user.role, firstName, lastName })
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
