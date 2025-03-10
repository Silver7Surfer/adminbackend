import mongoose from 'mongoose';
import { sendEmail } from '../services/emailService.js';
import { generateGameCredentialsEmail } from '../templates/gameCredentialsEmail.js';

export const fetchAllGameProfiles = async (adminUsername, adminRole) => {
    try {
        // Access MongoDB directly through the connection
        const db = mongoose.connection.db;
        const userGameProfileCollection = db.collection('usergameprofiles');
        const usersCollection = db.collection('users');
        
        // First, if admin is not superadmin, get all users assigned to this admin
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
        
        // Build the query based on admin role
        let profileQuery = {};
        
        // If admin (not superadmin), filter by assigned users
        if (adminRole === 'admin') {
            profileQuery.userId = { 
                $in: assignedUserIds.map(id => new mongoose.Types.ObjectId(id))
            };
        }
        
        // Fetch user game profiles based on the query
        const allUserProfiles = await userGameProfileCollection.find(profileQuery).toArray();
        
        // If we need to populate user data, we can do a separate query
        const userIds = allUserProfiles.map(profile => profile.userId);
        
        // Find all users with these IDs
        const users = await usersCollection.find({ 
            _id: { $in: userIds.map(id => new mongoose.Types.ObjectId(id)) }
        }).toArray();
        
        // Create a lookup map for users
        const userMap = {};
        users.forEach(user => {
            userMap[user._id.toString()] = {
                username: user.username,
                email: user.email,
                isActive: user.isActive
            };
        });
        
        // Add user data to profiles
        const profilesWithUserData = allUserProfiles.map(profile => {
            const userId = profile.userId.toString();
            return {
                ...profile,
                userData: userMap[userId] || { username: 'Unknown', email: 'unknown' }
            };
        });
        
        return profilesWithUserData;
    } catch (error) {
        console.error('Error in fetchAllGameProfiles:', error);
        throw error;
    }
};

// Shared function to fetch game statistics (used by both REST and WebSocket)
export const fetchGameStatistics = async (adminUsername, adminRole) => {
    try {
        const db = mongoose.connection.db;
        const userGameProfileCollection = db.collection('usergameprofiles');
        const usersCollection = db.collection('users');
        
        // If admin is not superadmin, get users assigned to this admin
        let profileQuery = {};
        
        if (adminRole === 'admin') {
            // Find users assigned to this admin
            const assignedUsers = await usersCollection.find({
                assignedAdmin: adminUsername
            }).toArray();
            
            // Extract user IDs
            const assignedUserIds = assignedUsers.map(user => user._id);
            
            // If no users assigned, return empty stats
            if (assignedUserIds.length === 0) {
                return {
                    totalProfiles: 0,
                    totalActiveProfiles: 0,
                    totalPendingProfiles: 0,
                    pendingCreditRequests: 0,
                    pendingRedeemRequests: 0,
                    gameBreakdown: {}
                };
            }
            
            // Build query to filter by assigned users
            profileQuery.userId = { 
                $in: assignedUserIds.map(id => new mongoose.Types.ObjectId(id))
            };
        }
        
        // Fetch user game profiles based on the query
        const userProfiles = await userGameProfileCollection.find(profileQuery).toArray();
        
        // Initialize statistics
        const gameStats = {
            totalProfiles: 0,
            totalActiveProfiles: 0,
            totalPendingProfiles: 0,
            pendingCreditRequests: 0,
            pendingRedeemRequests: 0,
            gameBreakdown: {}
        };
        
        // Process each user's games to build stats
        userProfiles.forEach(profile => {
            if (!profile.games) return;
            
            profile.games.forEach(game => {
                // Increment total profiles
                gameStats.totalProfiles++;
                
                // Count by status
                if (game.profileStatus === 'active') {
                    gameStats.totalActiveProfiles++;
                } else if (game.profileStatus === 'pending') {
                    gameStats.totalPendingProfiles++;
                }
                
                // Count pending requests
                if (game.creditAmount && game.creditAmount.status === 'pending') {
                    gameStats.pendingCreditRequests++;
                } else if (game.creditAmount && game.creditAmount.status === 'pending_redeem') {
                    gameStats.pendingRedeemRequests++;
                }
                
                // Build breakdown by game name
                if (!gameStats.gameBreakdown[game.gameName]) {
                    gameStats.gameBreakdown[game.gameName] = {
                        total: 0,
                        active: 0,
                        pending: 0,
                        totalCredit: 0,
                        pendingCreditRequests: 0,
                        pendingRedeemRequests: 0
                    };
                }
                
                const gameData = gameStats.gameBreakdown[game.gameName];
                gameData.total++;
                
                if (game.profileStatus === 'active') {
                    gameData.active++;
                } else if (game.profileStatus === 'pending') {
                    gameData.pending++;
                }
                
                if (game.creditAmount) {
                    gameData.totalCredit += game.creditAmount.amount || 0;
                    
                    if (game.creditAmount.status === 'pending') {
                        gameData.pendingCreditRequests++;
                    } else if (game.creditAmount.status === 'pending_redeem') {
                        gameData.pendingRedeemRequests++;
                    }
                }
            });
        });
        
        return gameStats;
    } catch (error) {
        console.error('Error in fetchGameStatistics:', error);
        throw error;
    }
};

export const getAllGameProfiles = async (req, res) => {
    try {
        // Get admin info from middleware
        const adminUsername = req.admin.username;
        const adminRole = req.admin.role;

        // Access MongoDB directly through the connection
        const db = mongoose.connection.db;
        const userGameProfileCollection = db.collection('usergameprofiles');
        const usersCollection = db.collection('users');
        
        // First, if admin is not superadmin, get all users assigned to this admin
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
                    count: 0,
                    profiles: []
                });
            }
        }
        
        // Build the query based on admin role
        let profileQuery = {};
        
        // If admin (not superadmin), filter by assigned users
        if (adminRole === 'admin') {
            profileQuery.userId = { 
                $in: assignedUserIds.map(id => new mongoose.Types.ObjectId(id))
            };
        }
        
        // Fetch user game profiles based on the query
        const allUserProfiles = await userGameProfileCollection.find(profileQuery).toArray();
        
        // If we need to populate user data, we can do a separate query
        const userIds = allUserProfiles.map(profile => profile.userId);
        
        // Find all users with these IDs
        const users = await usersCollection.find({ 
            _id: { $in: userIds.map(id => new mongoose.Types.ObjectId(id)) }
        }).toArray();
        
        // Create a lookup map for users
        const userMap = {};
        users.forEach(user => {
            userMap[user._id.toString()] = {
                username: user.username,
                email: user.email,
                isActive: user.isActive
            };
        });
        
        // Add user data to profiles
        const profilesWithUserData = allUserProfiles.map(profile => {
            const userId = profile.userId.toString();
            return {
                ...profile,
                userData: userMap[userId] || { username: 'Unknown', email: 'unknown' }
            };
        });
        
        return res.status(200).json({
            success: true,
            count: profilesWithUserData.length,
            profiles: profilesWithUserData
        });
    } catch (error) {
        console.error('Error fetching all game profiles:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching game profiles',
            error: error.message
        });
    }
};

// Get statistics for all games
export const getGameStatistics = async (req, res) => {
    try {
        const adminUsername = req.admin.username;
        const adminRole = req.admin.role;

        const db = mongoose.connection.db;
        const userGameProfileCollection = db.collection('usergameprofiles');
        const usersCollection = db.collection('users');
        
        // If admin is not superadmin, get users assigned to this admin
        let profileQuery = {};
        
        if (adminRole === 'admin') {
            // Find users assigned to this admin
            const assignedUsers = await usersCollection.find({
                assignedAdmin: adminUsername
            }).toArray();
            
            // Extract user IDs
            const assignedUserIds = assignedUsers.map(user => user._id);
            
            // If no users assigned, return empty stats
            if (assignedUserIds.length === 0) {
                return res.status(200).json({
                    success: true,
                    statistics: {
                        totalProfiles: 0,
                        totalActiveProfiles: 0,
                        totalPendingProfiles: 0,
                        pendingCreditRequests: 0,
                        pendingRedeemRequests: 0,
                        gameBreakdown: {}
                    }
                });
            }
            
            // Build query to filter by assigned users
            profileQuery.userId = { 
                $in: assignedUserIds.map(id => new mongoose.Types.ObjectId(id))
            };
        }
        
        // Fetch user game profiles based on the query
        const userProfiles = await userGameProfileCollection.find(profileQuery).toArray();
        
        // Initialize statistics
        const gameStats = {
            totalProfiles: 0,
            totalActiveProfiles: 0,
            totalPendingProfiles: 0,
            pendingCreditRequests: 0,
            pendingRedeemRequests: 0,
            gameBreakdown: {}
        };
        
        // Process each user's games to build stats
        userProfiles.forEach(profile => {
            if (!profile.games) return;
            
            profile.games.forEach(game => {
                // Increment total profiles
                gameStats.totalProfiles++;
                
                // Count by status
                if (game.profileStatus === 'active') {
                    gameStats.totalActiveProfiles++;
                } else if (game.profileStatus === 'pending') {
                    gameStats.totalPendingProfiles++;
                }
                
                // Count pending requests
                if (game.creditAmount && game.creditAmount.status === 'pending') {
                    gameStats.pendingCreditRequests++;
                } else if (game.creditAmount && game.creditAmount.status === 'pending_redeem') {
                    gameStats.pendingRedeemRequests++;
                }
                
                // Build breakdown by game name
                if (!gameStats.gameBreakdown[game.gameName]) {
                    gameStats.gameBreakdown[game.gameName] = {
                        total: 0,
                        active: 0,
                        pending: 0,
                        totalCredit: 0,
                        pendingCreditRequests: 0,
                        pendingRedeemRequests: 0
                    };
                }
                
                const gameData = gameStats.gameBreakdown[game.gameName];
                gameData.total++;
                
                if (game.profileStatus === 'active') {
                    gameData.active++;
                } else if (game.profileStatus === 'pending') {
                    gameData.pending++;
                }
                
                if (game.creditAmount) {
                    gameData.totalCredit += game.creditAmount.amount || 0;
                    
                    if (game.creditAmount.status === 'pending') {
                        gameData.pendingCreditRequests++;
                    } else if (game.creditAmount.status === 'pending_redeem') {
                        gameData.pendingRedeemRequests++;
                    }
                }
            });
        });
        
        return res.status(200).json({
            success: true,
            statistics: gameStats
        });
    } catch (error) {
        console.error('Error generating game statistics:', error);
        return res.status(500).json({
            success: false,
            message: 'Error generating game statistics',
            error: error.message
        });
    }
};

// Get pending requests summary
export const getPendingRequests = async (req, res) => {
    try {
        const adminUsername = req.admin.username;
        const adminRole = req.admin.role;

        const db = mongoose.connection.db;
        const userGameProfileCollection = db.collection('usergameprofiles');
        const usersCollection = db.collection('users');
        
        // For regular admins, first get assigned users
        let assignedUsers = [];
        
        if (adminRole === 'admin') {
            // Find users assigned to this admin
            assignedUsers = await usersCollection.find({
                assignedAdmin: adminUsername
            }).toArray();
            
            // If no users assigned, return empty requests
            if (assignedUsers.length === 0) {
                return res.status(200).json({
                    success: true,
                    pendingRequests: {
                        profiles: [],
                        creditRequests: [],
                        redeemRequests: []
                    }
                });
            }
        }
        
        // Build the query based on admin role
        let profileQuery = {};
        
        // If admin (not superadmin), filter by assigned users
        if (adminRole === 'admin') {
            const assignedUserIds = assignedUsers.map(user => user._id);
            profileQuery.userId = { 
                $in: assignedUserIds.map(id => new mongoose.Types.ObjectId(id))
            };
        }
        
        // Fetch all user game profiles based on the query
        const allUserProfiles = await userGameProfileCollection.find(profileQuery).toArray();
        
        // Find all users
        const userIds = allUserProfiles.map(profile => profile.userId);
        const users = await usersCollection.find({ 
            _id: { $in: userIds.map(id => new mongoose.Types.ObjectId(id)) }
        }).toArray();
        
        // Create a lookup map for users
        const userMap = {};
        users.forEach(user => {
            userMap[user._id.toString()] = {
                username: user.username,
                email: user.email
            };
        });
        
        const pendingRequests = {
            profiles: [],
            creditRequests: [],
            redeemRequests: []
        };
        
        // Process each user's games to find pending requests
        allUserProfiles.forEach(profile => {
            if (!profile.games) return;
            
            const userInfo = userMap[profile.userId.toString()] || { username: 'Unknown', email: 'Unknown' };
            
            profile.games.forEach(game => {
                // Check profile requests
                if (game.profileStatus === 'pending') {
                    pendingRequests.profiles.push({
                        userId: profile.userId,
                        username: userInfo.username,
                        email: userInfo.email,
                        gameName: game.gameName,
                        createdAt: game.createdAt || profile.createdAt
                    });
                }
                
                // Check credit requests
                if (game.creditAmount && game.creditAmount.status === 'pending') {
                    pendingRequests.creditRequests.push({
                        userId: profile.userId,
                        username: userInfo.username,
                        email: userInfo.email,
                        gameName: game.gameName,
                        gameId: game.gameId,
                        amount: game.creditAmount.requestedAmount,
                        updatedAt: game.updatedAt || profile.updatedAt
                    });
                }
                
                // Check redeem requests
                if (game.creditAmount && game.creditAmount.status === 'pending_redeem') {
                    pendingRequests.redeemRequests.push({
                        userId: profile.userId,
                        username: userInfo.username,
                        email: userInfo.email,
                        gameName: game.gameName,
                        gameId: game.gameId,
                        amount: game.creditAmount.requestedAmount,
                        updatedAt: game.updatedAt || profile.updatedAt
                    });
                }
            });
        });
        
        // Sort by date (newest first)
        pendingRequests.profiles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        pendingRequests.creditRequests.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        pendingRequests.redeemRequests.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        return res.status(200).json({
            success: true,
            pendingRequests
        });
    } catch (error) {
        console.error('Error fetching pending requests:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching pending requests',
            error: error.message
        });
    }
};

// Assign Game ID
export const assignGameId = async (req, res) => {
    try {
        const { userId, gameName, gameId, gamePassword } = req.body;
        const adminUsername = req.admin.username;
        const adminRole = req.admin.role;

        // Validate inputs
        if (!userId || !gameName || !gameId) {
            return res.status(400).json({
                success: false,
                message: 'userId, gameName, and gameId are required'
            });
        }

        // Access MongoDB directly
        const db = mongoose.connection.db;
        const userGameProfileCollection = db.collection('usergameprofiles');
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
                    message: 'You do not have permission to manage game profiles for this user'
                });
            }
        }

        // Find the user profile
        const userProfile = await userGameProfileCollection.findOne({ 
            userId: new mongoose.Types.ObjectId(userId) 
        });

        if (!userProfile) {
            return res.status(404).json({
                success: false,
                message: 'User profile not found'
            });
        }

        // Find the game in the profile
        const games = userProfile.games || [];
        const gameIndex = games.findIndex(game => game.gameName === gameName);

        if (gameIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Game profile not found'
            });
        }

        // Check if game profile is already active
        if (games[gameIndex].profileStatus === 'active') {
            return res.status(400).json({
                success: false,
                message: 'Game profile is already active with an assigned gameId',
                existingGameId: games[gameIndex].gameId
            });
        }

        // Update object with the fields to set
        const updateFields = {
            "games.$.gameId": gameId,
            "games.$.profileStatus": 'active'
        };
        
        // Add password if provided
        if (gamePassword) {
            updateFields["games.$.gamePassword"] = gamePassword;
        }

        // Update game profile
        const result = await userGameProfileCollection.updateOne(
            { 
                userId: new mongoose.Types.ObjectId(userId),
                "games.gameName": gameName
            },
            { 
                $set: updateFields
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Game profile not found'
            });
        }

        // Get the updated profile
        const updatedProfile = await userGameProfileCollection.findOne({ 
            userId: new mongoose.Types.ObjectId(userId) 
        });

        // Get user details to send email
        const user = await usersCollection.findOne({ 
            _id: new mongoose.Types.ObjectId(userId) 
        });

        // Send email with credentials if the user has an email
        if (user && user.email) {
            console.log("herer : ", user.email)
            try {
                const emailSent = await sendEmail(
                    user.email,
                    `Your ${gameName} Game Credentials`,
                    generateGameCredentialsEmail(user.username || 'User', gameName, gameId, gamePassword || '')
                );
                
                if (emailSent) {
                    console.log(`Game credentials email sent to ${user.email}`);
                } else {
                    console.error(`Failed to send credentials email to ${user.email}`);
                }
            } catch (emailError) {
                console.error('Failed to send credentials email:', emailError);
                // We don't want to fail the entire operation if just the email fails
            }
        }

        res.json({
            success: true,
            message: 'Game ID assigned and profile activated successfully',
            userProfile: updatedProfile
        });
    } catch (error) {
        console.error('Game ID assignment error:', error);
        res.status(500).json({
            success: false,
            message: 'Error assigning game ID',
            error: error.message
        });
    }
};

// Approve Credit Amount
export const approveCreditAmount = async (req, res) => {
    try {
        const { userId, gameName } = req.body;
        const adminUsername = req.admin.username;
        const adminRole = req.admin.role;

        // Validate inputs
        if (!userId || !gameName) {
            return res.status(400).json({
                success: false,
                message: 'userId and gameName are required'
            });
        }

        // Access MongoDB directly
        const db = mongoose.connection.db;
        const userGameProfileCollection = db.collection('usergameprofiles');
        const walletCollection = db.collection('wallets');
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
                    message: 'You do not have permission to approve credit for this user'
                });
            }
        }

        // Start a session for transaction
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Find the user profile
            const userProfile = await userGameProfileCollection.findOne(
                { userId: new mongoose.Types.ObjectId(userId) },
                { session }
            );

            if (!userProfile) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: 'User profile not found'
                });
            }

            // Find the game in the profile
            const games = userProfile.games || [];
            const gameIndex = games.findIndex(game => game.gameName === gameName);

            if (gameIndex === -1) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: 'Game profile not found'
                });
            }

            const gameProfile = games[gameIndex];

            if (!gameProfile.creditAmount || gameProfile.creditAmount.status !== 'pending') {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: 'No pending credit request found'
                });
            }

            // Find and update wallet transaction
            const userWallet = await walletCollection.findOne(
                { userId: new mongoose.Types.ObjectId(userId) },
                { session }
            );

            if (!userWallet) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: 'User wallet not found'
                });
            }

            // Find the most recent pending transaction for this game
            const transactions = userWallet.transactions || [];
            const transactionIndex = transactions.findIndex(tx => 
                tx.type === 'game_credit' && 
                tx.gameName === gameName && 
                tx.status === 'pending'
            );

            if (transactionIndex !== -1) {
                // Update transaction status
                await walletCollection.updateOne(
                    { 
                        _id: userWallet._id,
                        "transactions.type": "game_credit",
                        "transactions.gameName": gameName,
                        "transactions.status": "pending"
                    },
                    { 
                        $set: { 
                            "transactions.$.status": "completed",
                        }
                    },
                    { session }
                );
            }

            // Update game profile credit amount
            await userGameProfileCollection.updateOne(
                { 
                    _id: userProfile._id,
                    "games.gameName": gameName
                },
                { 
                    $set: { 
                        "games.$.creditAmount.amount": gameProfile.creditAmount.requestedAmount,
                        "games.$.creditAmount.status": "success",
                        "games.$.creditAmount.requestedAmount": 0
                    }
                },
                { session }
            );

            await session.commitTransaction();

            // Get updated data
            const updatedProfile = await userGameProfileCollection.findOne({ 
                userId: new mongoose.Types.ObjectId(userId) 
            });
            const updatedWallet = await walletCollection.findOne({ 
                userId: new mongoose.Types.ObjectId(userId) 
            });

            // Record admin action
            const adminAction = {
                action: 'approve_credit',
                adminUsername: adminUsername,
                adminRole: adminRole,
                userId: userId,
                gameName: gameName,
                creditAmount: gameProfile.creditAmount.requestedAmount,
                timestamp: new Date()
            };

            // You might want to store this in an adminActions collection
            // await db.collection('adminActions').insertOne(adminAction);

            res.json({
                success: true,
                message: 'Credit amount approved successfully',
                data: {
                    gameProfile: updatedProfile.games.find(g => g.gameName === gameName),
                    transaction: updatedWallet.transactions[transactionIndex]
                }
            });
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }

    } catch (error) {
        console.error('Credit approval error:', error);
        res.status(500).json({
            success: false,
            message: 'Error approving credit amount',
            error: error.message
        });
    }
};

// Approve Redeem
export const approveRedeem = async (req, res) => {
    try {
        const { userId, gameName } = req.body;
        const adminUsername = req.admin.username;
        const adminRole = req.admin.role;

        // Validate inputs
        if (!userId || !gameName) {
            return res.status(400).json({
                success: false,
                message: 'userId and gameName are required'
            });
        }

        // Access MongoDB directly
        const db = mongoose.connection.db;
        const userGameProfileCollection = db.collection('usergameprofiles');
        const walletCollection = db.collection('wallets');
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
                    message: 'You do not have permission to approve redeem requests for this user'
                });
            }
        }

        // Start a session for transaction
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Find the user profile
            const userProfile = await userGameProfileCollection.findOne(
                { userId: new mongoose.Types.ObjectId(userId) },
                { session }
            );

            if (!userProfile) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: 'User profile not found'
                });
            }

            // Find the game in the profile
            const games = userProfile.games || [];
            const gameIndex = games.findIndex(game => game.gameName === gameName);

            if (gameIndex === -1) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: 'Game profile not found'
                });
            }

            const gameProfile = games[gameIndex];

            if (!gameProfile.creditAmount || gameProfile.creditAmount.status !== 'pending_redeem') {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: 'No pending redeem request found'
                });
            }

            // Find and update wallet
            const userWallet = await walletCollection.findOne(
                { userId: new mongoose.Types.ObjectId(userId) },
                { session }
            );

            if (!userWallet) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: 'User wallet not found'
                });
            }

            // Find the pending redeem transaction
            const transactions = userWallet.transactions || [];
            const transactionIndex = transactions.findIndex(tx => 
                tx.type === 'game_withdrawal' && 
                tx.gameName === gameName && 
                tx.status === 'pending'
            );

            if (transactionIndex !== -1) {
                // Get the transaction
                const transaction = transactions[transactionIndex];
                const redeemAmount = transaction.amount || 0;
                const tips = transaction.tips || 0;
                const finalAmount = redeemAmount - tips;
                
                // Update transaction status and wallet balance
                await walletCollection.updateOne(
                    { _id: userWallet._id },
                    { 
                        $set: { 
                            [`transactions.${transactionIndex}.status`]: "completed",
                            "totalBalanceUSD": userWallet.totalBalanceUSD + finalAmount,
                            "lastUpdated": new Date()
                        }
                    },
                    { session }
                );
            }

            // Reset game profile credit amount
            await userGameProfileCollection.updateOne(
                { 
                    _id: userProfile._id,
                    "games.gameName": gameName
                },
                { 
                    $set: { 
                        "games.$.creditAmount.amount": 0,
                        "games.$.creditAmount.status": "none",
                        "games.$.creditAmount.requestedAmount": 0
                    }
                },
                { session }
            );

            await session.commitTransaction();

            // Get updated data
            const updatedProfile = await userGameProfileCollection.findOne({ 
                userId: new mongoose.Types.ObjectId(userId) 
            });
            const updatedWallet = await walletCollection.findOne({ 
                userId: new mongoose.Types.ObjectId(userId) 
            });

            res.json({
                success: true,
                message: 'Redeem request approved successfully',
                data: {
                    gameProfile: updatedProfile.games.find(g => g.gameName === gameName),
                    transaction: updatedWallet.transactions[transactionIndex],
                    wallet: {
                        currentBalance: updatedWallet.totalBalanceUSD,
                        lastUpdated: updatedWallet.lastUpdated
                    }
                }
            });
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }

    } catch (error) {
        console.error('Redeem approval error:', error);
        res.status(500).json({
            success: false,
            message: 'Error approving redeem request',
            error: error.message
        });
    }
};

// Disapprove Credit
export const disapproveCredit = async (req, res) => {
    try {
        const { userId, gameName } = req.body;
        const adminUsername = req.admin.username;
        const adminRole = req.admin.role;

        // Validate inputs
        if (!userId || !gameName) {
            return res.status(400).json({
                success: false,
                message: 'userId and gameName are required'
            });
        }

        // Access MongoDB directly
        const db = mongoose.connection.db;
        const userGameProfileCollection = db.collection('usergameprofiles');
        const walletCollection = db.collection('wallets');
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
                    message: 'You do not have permission to disapprove credit requests for this user'
                });
            }
        }

        // Find the user profile
        const userProfile = await userGameProfileCollection.findOne({ 
            userId: new mongoose.Types.ObjectId(userId) 
        });

        if (!userProfile) {
            return res.status(404).json({
                success: false,
                message: 'User profile not found'
            });
        }

        // Find the game in the profile
        const games = userProfile.games || [];
        const gameIndex = games.findIndex(game => game.gameName === gameName);

        if (gameIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Game profile not found'
            });
        }

        const gameProfile = games[gameIndex];

        if (!gameProfile.creditAmount || gameProfile.creditAmount.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'No pending credit request found'
            });
        }

        // Find wallet
        const userWallet = await walletCollection.findOne({ 
            userId: new mongoose.Types.ObjectId(userId) 
        });

        if (!userWallet) {
            return res.status(404).json({
                success: false,
                message: 'User wallet not found'
            });
        }

        // Start a session for transaction
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Find the pending credit transaction
            const transactions = userWallet.transactions || [];
            const transactionIndex = transactions.findIndex(tx => 
                tx.type === 'game_credit' && 
                tx.gameName === gameName && 
                tx.status === 'pending'
            );

            let refundedAmount = 0;
            if (transactionIndex !== -1) {
                // Get the amount to refund (stored as negative in the transaction)
                refundedAmount = Math.abs(transactions[transactionIndex].amount || 0);
                
                // Update transaction status and refund amount to wallet balance
                await walletCollection.updateOne(
                    { _id: userWallet._id },
                    { 
                        $set: { 
                            [`transactions.${transactionIndex}.status`]: "rejected",
                            "totalBalanceUSD": userWallet.totalBalanceUSD + refundedAmount,
                            "lastUpdated": new Date()
                        }
                    },
                    { session }
                );
            }

            // Reset game profile credit request
            await userGameProfileCollection.updateOne(
                { 
                    _id: userProfile._id,
                    "games.gameName": gameName
                },
                { 
                    $set: { 
                        "games.$.creditAmount.requestedAmount": 0,
                        "games.$.creditAmount.status": "none"
                    }
                },
                { session }
            );

            await session.commitTransaction();

            // Get updated data
            const updatedProfile = await userGameProfileCollection.findOne({ 
                userId: new mongoose.Types.ObjectId(userId) 
            });
            const updatedWallet = await walletCollection.findOne({ 
                userId: new mongoose.Types.ObjectId(userId) 
            });

            res.json({
                success: true,
                message: 'Credit request disapproved and funds refunded',
                data: {
                    gameProfile: updatedProfile.games.find(g => g.gameName === gameName),
                    refundedAmount,
                    wallet: {
                        currentBalance: updatedWallet.totalBalanceUSD,
                        lastUpdated: updatedWallet.lastUpdated
                    }
                }
            });
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    } catch (error) {
        console.error('Credit disapproval error:', error);
        res.status(500).json({
            success: false,
            message: 'Error disapproving credit request',
            error: error.message
        });
    }
};

// Disapprove Redeem
export const disapproveRedeem = async (req, res) => {
    try {
        const { userId, gameName } = req.body;
        const adminUsername = req.admin.username;
        const adminRole = req.admin.role;

        // Validate inputs
        if (!userId || !gameName) {
            return res.status(400).json({
                success: false,
                message: 'userId and gameName are required'
            });
        }

        // Access MongoDB directly
        const db = mongoose.connection.db;
        const userGameProfileCollection = db.collection('usergameprofiles');
        const walletCollection = db.collection('wallets');
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
                    message: 'You do not have permission to disapprove redeem requests for this user'
                });
            }
        }

        // Find the user profile
        const userProfile = await userGameProfileCollection.findOne({ 
            userId: new mongoose.Types.ObjectId(userId) 
        });

        if (!userProfile) {
            return res.status(404).json({
                success: false,
                message: 'User profile not found'
            });
        }

        // Find the game in the profile
        const games = userProfile.games || [];
        const gameIndex = games.findIndex(game => game.gameName === gameName);

        if (gameIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Game profile not found'
            });
        }

        const gameProfile = games[gameIndex];

        if (!gameProfile.creditAmount || gameProfile.creditAmount.status !== 'pending_redeem') {
            return res.status(400).json({
                success: false,
                message: 'No pending redeem request found'
            });
        }

        // Find wallet
        const userWallet = await walletCollection.findOne({ 
            userId: new mongoose.Types.ObjectId(userId) 
        });

        if (!userWallet) {
            return res.status(404).json({
                success: false,
                message: 'User wallet not found'
            });
        }

        // Start a session for transaction
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Find the pending redeem transaction
            const transactions = userWallet.transactions || [];
            const transactionIndex = transactions.findIndex(tx => 
                tx.type === 'game_withdrawal' && 
                tx.gameName === gameName && 
                tx.status === 'pending'
            );

            // Reset game profile redeem request but keep the credit amount
            await userGameProfileCollection.updateOne(
                { 
                    _id: userProfile._id,
                    "games.gameName": gameName
                },
                { 
                    $set: { 
                        "games.$.creditAmount.requestedAmount": 0,
                        "games.$.creditAmount.status": "none"
                    }
                },
                { session }
            );

            if (transactionIndex !== -1) {
                // Mark transaction as rejected
                await walletCollection.updateOne(
                    { _id: userWallet._id },
                    { 
                        $set: { 
                            [`transactions.${transactionIndex}.status`]: "rejected"
                        }
                    },
                    { session }
                );
            }

            await session.commitTransaction();

            // Get updated data
            const updatedProfile = await userGameProfileCollection.findOne({ 
                userId: new mongoose.Types.ObjectId(userId) 
            });

            res.json({
                success: true,
                message: 'Redeem request disapproved successfully',
                data: {
                    gameProfile: {
                        ...updatedProfile.games[gameIndex],
                        creditAmount: {
                            ...updatedProfile.games[gameIndex].creditAmount,
                            requestedAmount: 0,
                            status: 'none'
                        }
                    }
                }
            });
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    } catch (error) {
        console.error('Redeem disapproval error:', error);
        res.status(500).json({
            success: false,
            message: 'Error disapproving redeem request',
            error: error.message
        });
    }
};