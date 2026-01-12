import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Admin from './models/Admin.js'

dotenv.config()

const seedSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

    // Check if super admin already exists
    const existingAdmin = await Admin.findOne({ role: 'super_admin' })
    
    if (existingAdmin) {
      console.log('Super admin already exists:')
      console.log(`  Email: ${existingAdmin.email}`)
      console.log('  Use this account to login or create new admins.')
      await mongoose.disconnect()
      process.exit(0)
    }

    // Create super admin
    const superAdmin = await Admin.create({
      name: 'Super Admin',
      email: 'admin@admin.com',
      password: 'Admin@123',
      role: 'super_admin',
      permissions: ['all'],
      isActive: true
    })

    console.log('✅ Super Admin created successfully!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('  Email:    admin@admin.com')
    console.log('  Password: Admin@123')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('⚠️  Please change the password after first login!')

    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('Error seeding admin:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

seedSuperAdmin()
