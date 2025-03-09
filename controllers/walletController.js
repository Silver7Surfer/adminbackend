import mongoose from 'mongoose';

// Get all wallets with assigned admin filtering
export const getAllWallets = async (req, res) => {
  try {
    const adminUsername = req.admin.username;
    const db = mongoose.connection.db;
    const walletsCollection = db.collection('wallets');
    const usersCollection = db.collection('users');
    
    // If admin role is 'admin' (not superadmin), only fetch assigned users' wallets
    if (req.admin.role === 'admin') {
      // First, get all assigned users' IDs
      const assignedUsers = await usersCollection.find({ 
        assignedAdmin: adminUsername 
      }).toArray();
      
      // Extract user IDs
      const userIds = assignedUsers.map(user => new mongoose.Types.ObjectId(user._id));
      
      // Fetch wallets for those users
      const wallets = await walletsCollection.find({
        userId: { $in: userIds }
      }).toArray();
      
      return res.status(200).json(wallets);
    }
    
    // For superadmin, fetch all wallets
    const wallets = await walletsCollection.find({}).toArray();
    res.status(200).json(wallets);
  } catch (error) {
    console.error('Get all wallets error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch wallets', 
      error: error.message 
    });
  }
};

// Get wallet by userId with assigned admin check
export const getWalletByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminUsername = req.admin.username;
    
    // Check if ID is valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    
    const db = mongoose.connection.db;
    const walletsCollection = db.collection('wallets');
    const usersCollection = db.collection('users');
    
    // Check if admin is allowed to access this user's wallet
    if (req.admin.role === 'admin') {
      const user = await usersCollection.findOne({ 
        _id: new mongoose.Types.ObjectId(userId) 
      });
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      if (user.assignedAdmin !== adminUsername) {
        return res.status(403).json({ 
          message: 'You do not have permission to access this user\'s wallet' 
        });
      }
    }
    
    const wallet = await walletsCollection.findOne({ 
      userId: new mongoose.Types.ObjectId(userId) 
    });
    
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    
    res.status(200).json(wallet);
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch wallet', 
      error: error.message 
    });
  }
};

// Update wallet balance with assigned admin check
export const updateWalletBalance = async (req, res) => {
  try {
    const { userId } = req.params;
    const { totalBalanceUSD } = req.body;
    const adminUsername = req.admin.username;
    
    // Check if ID is valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    
    if (totalBalanceUSD === undefined || isNaN(totalBalanceUSD)) {
      return res.status(400).json({ message: 'Valid totalBalanceUSD is required' });
    }
    
    const db = mongoose.connection.db;
    const walletsCollection = db.collection('wallets');
    const usersCollection = db.collection('users');
    
    // Check if admin is allowed to update this user's wallet
    if (req.admin.role === 'admin') {
      const user = await usersCollection.findOne({ 
        _id: new mongoose.Types.ObjectId(userId) 
      });
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      if (user.assignedAdmin !== adminUsername) {
        return res.status(403).json({ 
          message: 'You do not have permission to update this user\'s wallet' 
        });
      }
    }
    
    const result = await walletsCollection.updateOne(
      { userId: new mongoose.Types.ObjectId(userId) },
      { 
        $set: { 
          totalBalanceUSD: Number(totalBalanceUSD),
          lastUpdated: new Date()
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    
    if (result.modifiedCount === 0) {
      return res.status(400).json({ message: 'No changes made to wallet' });
    }
    
    // Fetch updated wallet
    const updatedWallet = await walletsCollection.findOne({ 
      userId: new mongoose.Types.ObjectId(userId) 
    });
    
    res.status(200).json({
      message: 'Wallet balance updated successfully',
      wallet: updatedWallet
    });
  } catch (error) {
    console.error('Update wallet error:', error);
    res.status(500).json({ 
      message: 'Failed to update wallet', 
      error: error.message 
    });
  }
};