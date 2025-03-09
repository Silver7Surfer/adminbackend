import express from 'express';
import { 
  getPendingWithdrawals,
  approveWithdrawal,
  disapproveWithdrawal
} from '../controllers/adminWithdrawlController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected and only accessible to admins
router.use(protect);
router.use(restrictTo('admin'));

// Withdrawal management routes
router.get('/pending', getPendingWithdrawals);
router.post('/approve', approveWithdrawal);
router.post('/disapprove', disapproveWithdrawal);

export default router;