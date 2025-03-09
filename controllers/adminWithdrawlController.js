// controllers/adminWithdrawalController.js
import mongoose from 'mongoose';

export const fetchPendingWithdrawals = async (adminUsername, adminRole) => {
  console.log(`Fetching pending withdrawals for admin: ${adminUsername}, role: ${adminRole}`);
  try {
    // Access MongoDB directly through the connection
    const db = mongoose.connection.db;
    const walletsCollection = db.collection('wallets');
    const usersCollection = db.collection('users');
    
    // First, get all users assigned to this admin (only if admin is not superadmin)
    let assignedUserIds = [];
    
    if (adminRole === 'admin') {
      // Find users assigned to this admin
      const assignedUsers = await usersCollection.find({
        assignedAdmin: adminUsername
      }).toArray();
      
      // Extract user IDs
      assignedUserIds = assignedUsers.map(user => user._id);
      
      // If no users assigned, return empty array
      if (assignedUserIds.length === 0) {
        return [];
      }
    }
    
    // Build query based on admin role
    let walletQuery = {
      "transactions": {
        $elemMatch: {
          "type": "withdrawal",
          "status": "pending"
        }
      }
    };
    
    // If admin (not superadmin), add user filter
    if (adminRole === 'admin') {
      walletQuery.userId = { $in: assignedUserIds };
    }
    
    // Find all wallets that have pending withdrawals
    const wallets = await walletsCollection.find(walletQuery).toArray();
    
    // Extract user IDs to get user information
    const userIds = wallets.map(wallet => 
      new mongoose.Types.ObjectId(wallet.userId)
    );
    
    // Get user information
    const users = await usersCollection.find({
      _id: { $in: userIds }
    }).toArray();
    
    // Create user lookup map
    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = {
        username: user.username,
        email: user.email
      };
    });
    
    // Extract and format all pending withdrawals
    const pendingWithdrawals = [];
    
    wallets.forEach(wallet => {
      const userId = wallet.userId.toString();
      const userInfo = userMap[userId] || { username: 'Unknown', email: 'Unknown' };
      
      wallet.transactions.forEach(tx => {
        if (tx.type === 'withdrawal' && tx.status === 'pending') {
          pendingWithdrawals.push({
            withdrawalId: tx._id.toString(),
            userId: wallet.userId,
            username: userInfo.username,
            email: userInfo.email,
            asset: tx.asset,
            network: tx.network,
            amount: Math.abs(tx.amount), // Convert negative to positive
            timestamp: tx.timestamp,
            status: tx.status,
            address: tx.withdrawalAddress, // Use the correct field name
            walletId: wallet._id
          });
        }
      });
    });
    
    // Sort by date (newest first)
    pendingWithdrawals.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    console.log(`Found ${pendingWithdrawals.length} pending withdrawals`);
    return pendingWithdrawals;
  } catch (error) {
    console.error('Error in fetchPendingWithdrawals:', error);
    throw error;
  }
};

// Get all pending withdrawals
export const getPendingWithdrawals = async (req, res) => {
  try {
    // Get admin info from middleware
    const adminUsername = req.admin.username;
    const adminRole = req.admin.role;

    // Access MongoDB directly through the connection
    const db = mongoose.connection.db;
    const walletsCollection = db.collection('wallets');
    const usersCollection = db.collection('users');
    
    // First, get all users assigned to this admin (only if admin is not superadmin)
    let assignedUserIds = [];
    
    if (adminRole === 'admin') {
      // Find users assigned to this admin
      const assignedUsers = await usersCollection.find({
        assignedAdmin: adminUsername
      }).toArray();
      
      // Extract user IDs
      assignedUserIds = assignedUsers.map(user => user._id);
      
      // If no users assigned, return empty array
      if (assignedUserIds.length === 0) {
        return res.status(200).json({
          success: true,
          pendingWithdrawals: []
        });
      }
    }
    
    // Build query based on admin role
    let walletQuery = {
      "transactions": {
        $elemMatch: {
          "type": "withdrawal",
          "status": "pending"
        }
      }
    };
    
    // If admin (not superadmin), add user filter
    if (adminRole === 'admin') {
      walletQuery.userId = { $in: assignedUserIds };
    }
    
    // Find all wallets that have pending withdrawals
    const wallets = await walletsCollection.find(walletQuery).toArray();
    
    // Extract user IDs to get user information
    const userIds = wallets.map(wallet => 
      new mongoose.Types.ObjectId(wallet.userId)
    );
    
    // Get user information
    const users = await usersCollection.find({
      _id: { $in: userIds }
    }).toArray();
    
    // Create user lookup map
    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = {
        username: user.username,
        email: user.email
      };
    });
    
    // Extract and format all pending withdrawals
    const pendingWithdrawals = [];
    
    wallets.forEach(wallet => {
      const userId = wallet.userId.toString();
      const userInfo = userMap[userId] || { username: 'Unknown', email: 'Unknown' };
      
      wallet.transactions.forEach(tx => {
        if (tx.type === 'withdrawal' && tx.status === 'pending') {
          pendingWithdrawals.push({
            withdrawalId: tx._id.toString(),
            userId: wallet.userId,
            username: userInfo.username,
            email: userInfo.email,
            asset: tx.asset,
            network: tx.network,
            amount: Math.abs(tx.amount), // Convert negative to positive
            timestamp: tx.timestamp,
            status: tx.status,
            address: tx.withdrawalAddress, // Use the correct field name
            walletId: wallet._id
          });
        }
      });
    });
    
    // Sort by date (newest first)
    pendingWithdrawals.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.status(200).json({
      success: true,
      pendingWithdrawals
    });
  } catch (error) {
    console.error('Error fetching pending withdrawals:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending withdrawals',
      error: error.message
    });
  }
};

// Approve withdrawal
export const approveWithdrawal = async (req, res) => {
  try {
    const { userId, withdrawalId, txHash } = req.body;
    const adminUsername = req.admin.username;
    const adminRole = req.admin.role;
    
    if (!userId || !withdrawalId) {
      return res.status(400).json({
        success: false,
        message: 'userId and withdrawalId are required'
      });
    }
    
    // Get MongoDB connection
    const db = mongoose.connection.db;
    const walletsCollection = db.collection('wallets');
    const usersCollection = db.collection('users');
    
    // Check if admin has permission to manage this user (if not superadmin)
    if (adminRole === 'admin') {
      const user = await usersCollection.findOne({
        _id: new mongoose.Types.ObjectId(userId)
      });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Check if user is assigned to this admin
      if (user.assignedAdmin !== adminUsername) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to approve withdrawals for this user'
        });
      }
    }
    
    // Find the wallet
    const wallet = await walletsCollection.findOne({
      userId: new mongoose.Types.ObjectId(userId)
    });
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }
    
    // Find the transaction index
    let transactionIndex = -1;
    for (let i = 0; i < wallet.transactions.length; i++) {
      const tx = wallet.transactions[i];
      if (tx._id.toString() === withdrawalId && tx.type === 'withdrawal' && tx.status === 'pending') {
        transactionIndex = i;
        break;
      }
    }
    
    if (transactionIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Pending withdrawal not found'
      });
    }
    
    // Update the transaction status to completed
    await walletsCollection.updateOne(
      { _id: wallet._id },
      { 
        $set: { 
          [`transactions.${transactionIndex}.status`]: 'completed',
          [`transactions.${transactionIndex}.txHash`]: txHash || null,
          lastUpdated: new Date()
        } 
      }
    );
    
    res.status(200).json({
      success: true,
      message: 'Withdrawal request approved successfully'
    });
  } catch (error) {
    console.error('Error approving withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving withdrawal',
      error: error.message
    });
  }
};

// Disapprove withdrawal
export const disapproveWithdrawal = async (req, res) => {
  try {
    const { userId, withdrawalId } = req.body;
    const adminUsername = req.admin.username;
    const adminRole = req.admin.role;
    
    if (!userId || !withdrawalId) {
      return res.status(400).json({
        success: false,
        message: 'userId and withdrawalId are required'
      });
    }
    
    // Get MongoDB connection
    const db = mongoose.connection.db;
    const walletsCollection = db.collection('wallets');
    const usersCollection = db.collection('users');
    
    // Check if admin has permission to manage this user (if not superadmin)
    if (adminRole === 'admin') {
      const user = await usersCollection.findOne({
        _id: new mongoose.Types.ObjectId(userId)
      });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Check if user is assigned to this admin
      if (user.assignedAdmin !== adminUsername) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to disapprove withdrawals for this user'
        });
      }
    }
    
    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Find the wallet
      const wallet = await walletsCollection.findOne({
        userId: new mongoose.Types.ObjectId(userId)
      });
      
      if (!wallet) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Wallet not found'
        });
      }
      
      // Find the transaction
      let transaction = null;
      let transactionIndex = -1;
      
      for (let i = 0; i < wallet.transactions.length; i++) {
        const tx = wallet.transactions[i];
        if (tx._id.toString() === withdrawalId && tx.type === 'withdrawal' && tx.status === 'pending') {
          transaction = tx;
          transactionIndex = i;
          break;
        }
      }
      
      if (!transaction) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Pending withdrawal not found'
        });
      }
      
      // Calculate amount to refund (convert negative to positive)
      const refundAmount = Math.abs(transaction.amount);
      
      // Update the transaction status to rejected
      await walletsCollection.updateOne(
        { _id: wallet._id },
        { 
          $set: { 
            [`transactions.${transactionIndex}.status`]: 'rejected',
            lastUpdated: new Date()
          },
          $inc: { totalBalanceUSD: refundAmount }
        }
      );
      
      await session.commitTransaction();
      
      res.status(200).json({
        success: true,
        message: 'Withdrawal request rejected and funds returned to wallet',
        refundAmount
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Error disapproving withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Error disapproving withdrawal',
      error: error.message
    });
  }
};