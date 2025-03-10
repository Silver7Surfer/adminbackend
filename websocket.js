// websocket.js
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import Admin from './models/Admin.js';
import { fetchPendingWithdrawals } from './controllers/adminWithdrawlController.js';
import { fetchAllGameProfiles, fetchGameStatistics } from './controllers/adminGameController.js';

let io;

export const initWebSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: ["https://admin.bigwin.gold", "http://localhost:3000"], // Your frontend URL
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 60000, // Increase ping timeout
    pingInterval: 25000  // Ping clients regularly
  });

  io.on('connection', (socket) => {
    console.log('New client connected', socket.id);
    
    // Handle admin authentication
    socket.on('authenticate', async (token) => {
      try {
        if (!token) {
          console.log('No token provided for socket authentication');
          return socket.emit('authenticated', { 
            success: false, 
            message: 'No authentication token provided' 
          });
        }
        
        // Verify token - same as in your middleware
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if admin still exists - same as in your middleware
        const admin = await Admin.findById(decoded.id);
        if (!admin) {
          console.log('Admin not found for socket authentication');
          return socket.emit('authenticated', { 
            success: false, 
            message: 'Admin not found' 
          });
        }
        
        // Store admin data in socket
        socket.adminData = {
          id: admin._id,
          username: admin.username,
          email: admin.email,
          role: admin.role
        };
        
        console.log(`Admin authenticated via WebSocket: ${admin.username}`);
        
        // Emit authenticated event
        socket.emit('authenticated', { success: true });
        
        // Send initial pending withdrawals data
        await sendPendingWithdrawals(socket);
      } catch (error) {
        console.error('Socket authentication error:', error);
        
        let message = 'Authentication error';
        if (error.name === 'JsonWebTokenError') {
          message = 'Invalid token';
        } else if (error.name === 'TokenExpiredError') {
          message = 'Token expired, please login again';
        }
        
        socket.emit('authenticated', { 
          success: false, 
          message: message
        });
      }
    });

    // Request for pending withdrawals
    socket.on('get:pendingWithdrawals', async () => {
      if (!socket.adminData) {
        return socket.emit('error', { message: 'Not authenticated' });
      }
      
      await sendPendingWithdrawals(socket);
    });
    
    // Request for game profiles
    socket.on('get:gameProfiles', async () => {
      if (!socket.adminData) {
        return socket.emit('error', { message: 'Not authenticated' });
      }
      
      await sendGameProfiles(socket);
    });

    // Request for game statistics
    socket.on('get:gameStatistics', async () => {
      if (!socket.adminData) {
        return socket.emit('error', { message: 'Not authenticated' });
      }
      
      await sendGameStatistics(socket);
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected', socket.id);
    });
  });
  
  // Add a periodic check for connected clients
  setInterval(async () => {
    try {
      const sockets = await io.fetchSockets();
      console.log(`Currently ${sockets.length} clients connected to WebSocket`);
      const adminClients = sockets.filter(s => s.adminData).length;
      console.log(`${adminClients} authenticated admin clients`);
    } catch (err) {
      console.error('Error checking connected clients:', err);
    }
  }, 60000); // Log every minute
  
  return io;
};

// Function to send pending withdrawals to admin
async function sendPendingWithdrawals(socket) {
  try {
    if (!socket.adminData) {
      return socket.emit('error', { message: 'Not authenticated' });
    }
    
    const pendingWithdrawals = await fetchPendingWithdrawals(
      socket.adminData.username,
      socket.adminData.role
    );
    
    socket.emit('pendingWithdrawals', {
      success: true,
      pendingWithdrawals
    });
    
    console.log(`Sent ${pendingWithdrawals.length} pending withdrawals to admin: ${socket.adminData.username}`);
  } catch (error) {
    console.error('Error fetching pending withdrawals:', error);
    socket.emit('error', {
      message: 'Error fetching pending withdrawals',
      error: error.message
    });
  }
}

// Function to send game profiles to admin
async function sendGameProfiles(socket) {
  try {
    if (!socket.adminData) {
      return socket.emit('error', { message: 'Not authenticated' });
    }
    
    const gameProfiles = await fetchAllGameProfiles(
      socket.adminData.username,
      socket.adminData.role
    );
    
    socket.emit('gameProfiles', {
      success: true,
      count: gameProfiles.length,
      profiles: gameProfiles
    });
    
    console.log(`Sent ${gameProfiles.length} game profiles to admin: ${socket.adminData.username}`);
  } catch (error) {
    console.error('Error fetching game profiles:', error);
    socket.emit('error', {
      message: 'Error fetching game profiles',
      error: error.message
    });
  }
}

// Function to send game statistics to admin
async function sendGameStatistics(socket) {
  try {
    if (!socket.adminData) {
      return socket.emit('error', { message: 'Not authenticated' });
    }
    
    const statistics = await fetchGameStatistics(
      socket.adminData.username,
      socket.adminData.role
    );
    
    socket.emit('gameStatistics', {
      success: true,
      statistics
    });
    
    console.log(`Sent game statistics to admin: ${socket.adminData.username}`);
  } catch (error) {
    console.error('Error fetching game statistics:', error);
    socket.emit('error', {
      message: 'Error fetching game statistics',
      error: error.message
    });
  }
}

// Function to broadcast withdrawal updates to all connected admins
export const broadcastWithdrawalUpdates = async () => {
  if (!io) {
    console.log('Socket.io not initialized, cannot broadcast');
    return;
  }
  
  try {
    const sockets = await io.fetchSockets();
    let adminCount = 0;
    
    for (const socket of sockets) {
      if (socket.adminData) {
        adminCount++;
        await sendPendingWithdrawals(socket);
      }
    }
    
    console.log(`Broadcasted withdrawal updates to ${adminCount} connected admin clients`);
  } catch (error) {
    console.error('Error broadcasting withdrawal updates:', error);
  }
};

// Function to broadcast game profiles updates to all connected admins
export const broadcastGameProfilesUpdates = async () => {
  if (!io) {
    console.log('Socket.io not initialized, cannot broadcast');
    return;
  }
  
  try {
    const sockets = await io.fetchSockets();
    let adminCount = 0;
    
    for (const socket of sockets) {
      if (socket.adminData) {
        adminCount++;
        await sendGameProfiles(socket);
      }
    }
    
    console.log(`Broadcasted game profiles updates to ${adminCount} connected admin clients`);
  } catch (error) {
    console.error('Error broadcasting game profiles updates:', error);
  }
};

// Function to broadcast game statistics updates to all connected admins
export const broadcastGameStatisticsUpdates = async () => {
  if (!io) {
    console.log('Socket.io not initialized, cannot broadcast');
    return;
  }
  
  try {
    const sockets = await io.fetchSockets();
    let adminCount = 0;
    
    for (const socket of sockets) {
      if (socket.adminData) {
        adminCount++;
        await sendGameStatistics(socket);
      }
    }
    
    console.log(`Broadcasted game statistics updates to ${adminCount} connected admin clients`);
  } catch (error) {
    console.error('Error broadcasting game statistics updates:', error);
  }
};

// Setup MongoDB change stream to watch for new withdrawals
export const setupChangeStreams = async (db) => {
  try {
    const walletsCollection = db.collection('wallets');
    
    // Create a change stream with broader filter and full document lookup
    const changeStream = walletsCollection.watch([], {
      fullDocument: 'updateLookup'
    });
    
    // Handle change events
    changeStream.on('change', async (change) => {
      console.log('Detected change in wallets collection:', change.operationType);
      console.log('Change details:', JSON.stringify({
        ns: change.ns,
        documentKey: change.documentKey,
        operationType: change.operationType
      }, null, 2));
      
      // Check if this change is related to a withdrawal transaction
      let isWithdrawalChange = false;
      
      if (change.operationType === 'insert') {
        // Check if the inserted document has a pending withdrawal transaction
        const hasPendingWithdrawal = change.fullDocument?.transactions?.some(
          tx => tx.type === 'withdrawal' && tx.status === 'pending'
        );
        isWithdrawalChange = hasPendingWithdrawal;
        console.log('Insert operation, hasPendingWithdrawal:', hasPendingWithdrawal);
      } 
      else if (change.operationType === 'update') {
        // Check if the updated fields include transactions
        const updatedFields = change.updateDescription?.updatedFields || {};
        const fieldKeys = Object.keys(updatedFields);
        console.log('Update operation, updated fields:', fieldKeys);
        
        // Look for transaction updates or status changes
        isWithdrawalChange = fieldKeys.some(key => 
          key.startsWith('transactions') || 
          key === 'totalBalanceUSD' || 
          key === 'lastUpdated'
        );
      }
      
      if (isWithdrawalChange || change.operationType === 'update') {
        console.log('Potential withdrawal-related change detected, broadcasting updates...');
        try {
          // Broadcast updates to all connected admin clients
          await broadcastWithdrawalUpdates();
        } catch (err) {
          console.error('Failed to broadcast on database change:', err);
        }
      } else {
        console.log('Change not related to withdrawals, ignoring');
      }
    });
    
    console.log('Withdrawal change stream established');
    
    // Handle errors
    changeStream.on('error', (error) => {
      console.error('Change stream error:', error);
      // Attempt to reestablish the change stream after a delay
      setTimeout(() => {
        console.log('Attempting to reestablish change stream...');
        setupChangeStreams(db).catch(err => {
          console.error('Failed to reestablish change stream:', err);
        });
      }, 5000);
    });
    
    return changeStream;
  } catch (error) {
    console.error('Failed to set up withdrawal change stream:', error);
    throw error;
  }
};

// Setup MongoDB change stream to watch for game profile changes
export const setupGameProfilesChangeStream = async (db) => {
  try {
    const userGameProfileCollection = db.collection('usergameprofiles');
    
    // Create a change stream with broader filter and full document lookup
    const changeStream = userGameProfileCollection.watch([], {
      fullDocument: 'updateLookup'
    });
    
    // Handle change events
    changeStream.on('change', async (change) => {
      console.log('Detected change in user game profiles collection:', change.operationType);
      
      try {
        // Broadcast updates to all connected admin clients
        await broadcastGameProfilesUpdates();
        await broadcastGameStatisticsUpdates();
        console.log('Broadcasted game profile & statistics updates to connected admin clients');
      } catch (err) {
        console.error('Failed to broadcast on game profiles change:', err);
      }
    });
    
    console.log('Game profiles change stream established');
    
    // Handle errors
    changeStream.on('error', (error) => {
      console.error('Game profiles change stream error:', error);
      // Attempt to reestablish the change stream after a delay
      setTimeout(() => {
        console.log('Attempting to reestablish game profiles change stream...');
        setupGameProfilesChangeStream(db).catch(err => {
          console.error('Failed to reestablish game profiles change stream:', err);
        });
      }, 5000);
    });
    
    return changeStream;
  } catch (error) {
    console.error('Failed to set up game profiles change stream:', error);
    throw error;
  }
};

export { io };