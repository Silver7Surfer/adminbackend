import express from 'express';
import { register, login, getCurrentAdmin } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Auth routes
router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getCurrentAdmin);

export default router;