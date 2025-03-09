import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

// Register a new admin
export const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingAdmin) {
      if (existingAdmin.email === email) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      if (existingAdmin.username === username) {
        return res.status(400).json({ message: 'Username already in use' });
      }
    }

    // Create new admin with unverified status
    const newAdmin = await Admin.create({
      username,
      email,
      password,
      verificationStatus: 'unverified', // Set status explicitly (though default is already 'unverified')
      balance: 0
    });

    // Generate token
    const token = generateToken(newAdmin._id);

    // Return user data (excluding password)
    res.status(201).json({
      message: 'Admin registered successfully. Please wait for account verification by a superadmin.',
      token,
      user: {
        id: newAdmin._id,
        username: newAdmin.username,
        email: newAdmin.email,
        role: newAdmin.role,
        balance: newAdmin.balance,
        verificationStatus: newAdmin.verificationStatus
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: 'Registration failed', 
      error: error.message 
    });
  }
};

// Login admin
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if admin exists
    const admin = await Admin.findOne({ email }).select('+password');
    if (!admin) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if password is correct
    const isPasswordCorrect = await admin.comparePassword(password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if account is verified
    if (admin.verificationStatus !== 'verified') {
      return res.status(403).json({ 
        message: 'Your account is not verified yet. Please wait for approval by a superadmin.',
        verificationStatus: admin.verificationStatus
      });
    }

    // Generate token
    const token = generateToken(admin._id);

    // Return user data (excluding password)
    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        balance: admin.balance,
        verificationStatus: admin.verificationStatus
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Login failed', 
      error: error.message 
    });
  }
};

// Get current admin
export const getCurrentAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id);
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.status(200).json({
      id: admin._id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      balance: admin.balance
    });
  } catch (error) {
    console.error('Get admin error:', error);
    res.status(500).json({ 
      message: 'Failed to get admin data', 
      error: error.message 
    });
  }
};

