// Social features for SolSentinel
use anchor_lang::prelude::*;

/// Maximum tokens a user can subscribe to
pub const MAX_SUBSCRIPTIONS: usize = 20;

/// Maximum length for username
pub const MAX_USERNAME_LEN: usize = 20;

/// Seeds for social PDAs
pub const USER_PROFILE_SEED: &[u8] = b"user_profile";
pub const SUBSCRIPTION_SEED: &[u8] = b"subscription";

/// User profile account
#[account]
pub struct UserProfile {
    /// Owner of this profile
    pub owner: Pubkey,
    /// Username (optional, for display)
    pub username: String,
    /// Total predictions made
    pub predictions_made: u32,
    /// Correct predictions (within 10% accuracy)
    pub correct_predictions: u32,
    /// Reputation score (0-1000)
    pub reputation: u16,
    /// Timestamp of profile creation
    pub created_at: i64,
    /// Last activity timestamp
    pub last_active: i64,
    /// Bump seed
    pub bump: u8,
}

impl UserProfile {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        4 + MAX_USERNAME_LEN + // username
        4 + // predictions_made
        4 + // correct_predictions
        2 + // reputation
        8 + // created_at
        8 + // last_active
        1;  // bump

    /// Calculate accuracy percentage
    pub fn accuracy(&self) -> u8 {
        if self.predictions_made == 0 {
            return 0;
        }
        ((self.correct_predictions as u64 * 100) / self.predictions_made as u64) as u8
    }

    /// Update reputation based on new prediction result
    pub fn update_reputation(&mut self, was_correct: bool) {
        self.predictions_made = self.predictions_made.saturating_add(1);
        
        if was_correct {
            self.correct_predictions = self.correct_predictions.saturating_add(1);
            // Increase reputation
            self.reputation = self.reputation.saturating_add(10).min(1000);
        } else {
            // Slight reputation decrease for wrong prediction
            self.reputation = self.reputation.saturating_sub(5);
        }
    }
}

/// Token subscription
#[account]
pub struct Subscription {
    /// User who owns this subscription
    pub user: Pubkey,
    /// Token symbol being tracked
    pub symbol: String,
    /// Sentiment direction preference (1 = bullish, -1 = bearish, 0 = neutral/watching)
    pub direction: i8,
    /// Alert threshold (trigger if sentiment changes by this much)
    pub alert_threshold: u8,
    /// Subscribed timestamp
    pub subscribed_at: i64,
    /// Last alert sent timestamp
    pub last_alert: i64,
    /// Bump seed
    pub bump: u8,
}

impl Subscription {
    pub const LEN: usize = 8 + // discriminator
        32 + // user
        4 + 10 + // symbol (max 10 chars)
        1 + // direction
        1 + // alert_threshold
        8 + // subscribed_at
        8 + // last_alert
        1;  // bump
}

/// User's sentiment vote (community wisdom)
#[account]
pub struct CommunityVote {
    /// User who voted
    pub voter: Pubkey,
    /// Token symbol
    pub symbol: String,
    /// Vote score (-100 to +100)
    pub score: i8,
    /// Confidence in vote (0-100)
    pub confidence: u8,
    /// Voted timestamp
    pub timestamp: i64,
    /// Bump seed
    pub bump: u8,
}

impl CommunityVote {
    pub const LEN: usize = 8 + // discriminator
        32 + // voter
        4 + 10 + // symbol
        1 + // score
        1 + // confidence
        8 + // timestamp
        1;  // bump
}
