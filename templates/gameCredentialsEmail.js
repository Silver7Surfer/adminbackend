// templates/gameCredentialsEmail.js

export const generateGameCredentialsEmail = (username, gameName, gameId, gamePassword) => {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
            <h2 style="color: #333; text-align: center;">Your Game Credentials</h2>
            <p>Hello ${username},</p>
            <p>Your game account has been activated! Here are your login credentials for ${gameName}:</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Game:</strong> ${gameName}</p>
                <p><strong>Game ID:</strong> ${gameId}</p>
                ${gamePassword ? `<p><strong>Password:</strong> ${gamePassword}</p>` : ''}
            </div>
            <p>Keep these credentials safe and do not share them with anyone.</p>
            <p>Happy gaming!</p>
            <p>Best regards,<br>The BigWin Gaming Team</p>
        </div>
    `;
};