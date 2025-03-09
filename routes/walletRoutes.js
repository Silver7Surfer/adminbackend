import express from 'express';
import { 
  getAllWallets, 
  getWalletByUserId, 
  updateWalletBalance 
} from '../controllers/walletController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected and only accessible to admins
router.use(protect);
router.use(restrictTo('admin'));

// Routes for wallets
router.get('/', getAllWallets);
router.get('/:userId', getWalletByUserId);
router.put('/:userId/balance', updateWalletBalance);

export default router;