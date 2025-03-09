// routes/adminGameRoutes.js
import express from 'express';
import { 
    assignGameId,
    approveCreditAmount, 
    approveRedeem,
    disapproveCredit,
    disapproveRedeem,
    getAllGameProfiles, // Assuming you already have this from previous code
    getGameStatistics // Assuming you already have this from previous code
} from '../controllers/adminGameController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected and only accessible to admins
router.use(protect);
router.use(restrictTo('admin'));

// Routes for game management
router.get('/games/profiles', getAllGameProfiles);
router.get('/games/statistics', getGameStatistics);
router.post('/games/assign-gameid', assignGameId);
router.post('/games/approve-credit', approveCreditAmount);
router.post('/games/approve-redeem', approveRedeem);
router.post('/games/disapprove-credit', disapproveCredit);
router.post('/games/disapprove-redeem', disapproveRedeem);

export default router;