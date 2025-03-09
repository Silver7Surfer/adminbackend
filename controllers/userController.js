import mongoose from 'mongoose';

// Get users for admin
export const getAllUsers = async (req, res) => {
  try {
    // The admin's username should be available from the auth middleware
    const adminUsername = req.admin.username;

    // Use the native MongoDB driver to access the actual users collection
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Create query based on admin role
    let query = {};
    
    // If admin role is 'admin' (not superadmin), only fetch assigned users
    if (req.admin.role === 'admin') {
      query = { assignedAdmin: adminUsername };
    }
    
    // Fetch users matching the query
    const users = await usersCollection.find(query).toArray();
    
    res.status(200).json(users);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch users', 
      error: error.message 
    });
  }
};

// Get user by ID
export const getUserById = async (req, res) => {
  try {
    const adminUsername = req.admin.username;
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Check if ID is valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    
    // Find the user
    const user = await usersCollection.findOne({ 
      _id: new mongoose.Types.ObjectId(req.params.id) 
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if admin is allowed to access this user
    if (req.admin.role === 'admin' && user.assignedAdmin !== adminUsername) {
      return res.status(403).json({ message: 'You do not have permission to access this user' });
    }
    
    res.status(200).json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch user', 
      error: error.message 
    });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const adminUsername = req.admin.username;
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Check if ID is valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    // Find the user first to check permissions
    const user = await usersCollection.findOne({ 
      _id: new mongoose.Types.ObjectId(req.params.id) 
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if admin is allowed to update this user
    if (req.admin.role === 'admin' && user.assignedAdmin !== adminUsername) {
      return res.status(403).json({ message: 'You do not have permission to update this user' });
    }
    
    const { username, email, role, isActive } = req.body;
    
    // Construct update object
    const updateFields = {};
    if (username) updateFields.username = username;
    if (email) updateFields.email = email;
    
    // Only superadmin can change role
    if (role && req.admin.role === 'superadmin') {
      updateFields.role = role;
    }
    
    if (isActive !== undefined) updateFields.isActive = isActive;
    
    // Update timestamp
    updateFields.updatedAt = new Date();
    
    // Update user
    const result = await usersCollection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: updateFields }
    );
    
    if (result.modifiedCount === 0) {
      return res.status(400).json({ message: 'No changes made to user' });
    }
    
    // Fetch updated user
    const updatedUser = await usersCollection.findOne({ 
      _id: new mongoose.Types.ObjectId(req.params.id) 
    });
    
    res.status(200).json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ 
      message: 'Failed to update user', 
      error: error.message 
    });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const adminUsername = req.admin.username;
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Check if ID is valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    
    // Find the user first to check permissions
    const user = await usersCollection.findOne({ 
      _id: new mongoose.Types.ObjectId(req.params.id) 
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if admin is allowed to delete this user
    if (req.admin.role === 'admin' && user.assignedAdmin !== adminUsername) {
      return res.status(403).json({ message: 'You do not have permission to delete this user' });
    }
    
    // Delete the user
    const result = await usersCollection.deleteOne({ 
      _id: new mongoose.Types.ObjectId(req.params.id) 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      message: 'Failed to delete user', 
      error: error.message 
    });
  }
};