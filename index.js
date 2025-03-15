// index.js
import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import adminGameRoutes from './routes/adminGameRoutes.js';
import adminWithdrawalRoutes from './routes/adminWithdrawalRoutes.js';
import { 
  initWebSocket, 
  setupChangeStreams, 
  setupGameProfilesChangeStream 
} from './websocket.js';
import { connectDB } from './config/db.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket
const io = initWebSocket(server);

// Middlewares
app.use(cors({
  origin: '*',  // Allow any origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/admin', adminGameRoutes);
app.use('/api/admin/withdrawals', adminWithdrawalRoutes);

// Basic route
app.get('/', (req, res) => {
  res.send('Admin API is running');
});

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    const conn = await connectDB();
    
    // Set up change streams after MongoDB connection is established
    await setupChangeStreams(conn.connection.db);
    await setupGameProfilesChangeStream(conn.connection.db);
    
    // Start the server
    server.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
      console.log(`Server accessible at http://localhost:${PORT}`);
      console.log(`Also accessible at http://192.168.18.3:${PORT} (local network)`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();