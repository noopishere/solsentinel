use anchor_lang::prelude::*;

declare_id!("HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm");

pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_USERNAME_LEN: usize = 20;
pub const MAX_SUBSCRIPTIONS: usize = 20;

pub const SENTINEL_SEED: &[u8] = b"sentinel";
pub const SENTIMENT_SEED: &[u8] = b"sentiment";
pub const USER_PROFILE_SEED: &[u8] = b"user_profile";
pub const SUBSCRIPTION_SEED: &[u8] = b"subscription";

#[program]
pub mod sol_sentinel {
    use super::*;

    // ===== Core Oracle Functions =====
    
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let sentinel = &mut ctx.accounts.sentinel;
        sentinel.authority = ctx.accounts.authority.key();
        sentinel.total_updates = 0;
        sentinel.bump = ctx.bumps.sentinel;
        msg!("SolSentinel initialized");
        Ok(())
    }

    pub fn store_sentiment(
        ctx: Context<StoreSentiment>,
        symbol: String,
        score: i8,
        confidence: u8,
        volume: u32,
        timestamp: i64,
    ) -> Result<()> {
        require!(symbol.len() <= MAX_SYMBOL_LEN, SentinelError::SymbolTooLong);
        require!(score >= -100 && score <= 100, SentinelError::InvalidScore);
        require!(confidence <= 100, SentinelError::InvalidConfidence);

        let sentiment = &mut ctx.accounts.sentiment;
        let sentinel = &mut ctx.accounts.sentinel;

        sentiment.symbol = symbol.clone();
        sentiment.score = score;
        sentiment.confidence = confidence;
        sentiment.volume = volume;
        sentiment.timestamp = timestamp;
        sentiment.updater = ctx.accounts.authority.key();
        sentiment.bump = ctx.bumps.sentiment;

        sentinel.total_updates = sentinel.total_updates.saturating_add(1);

        emit!(SentimentUpdated {
            symbol,
            score,
            confidence,
            volume,
            timestamp,
            updater: ctx.accounts.authority.key(),
        });

        Ok(())
    }

    // ===== Social Functions =====
    
    pub fn create_profile(ctx: Context<CreateProfile>, username: String) -> Result<()> {
        require!(username.len() <= MAX_USERNAME_LEN, SentinelError::UsernameTooLong);
        
        let profile = &mut ctx.accounts.profile;
        let clock = Clock::get()?;
        
        profile.owner = ctx.accounts.user.key();
        profile.username = username;
        profile.predictions_made = 0;
        profile.correct_predictions = 0;
        profile.reputation = 100;
        profile.created_at = clock.unix_timestamp;
        profile.last_active = clock.unix_timestamp;
        profile.bump = ctx.bumps.profile;
        
        Ok(())
    }

    pub fn subscribe_token(
        ctx: Context<SubscribeToken>,
        symbol: String,
        direction: i8,
        alert_threshold: u8,
    ) -> Result<()> {
        require!(symbol.len() <= MAX_SYMBOL_LEN, SentinelError::SymbolTooLong);
        require!(direction >= -1 && direction <= 1, SentinelError::InvalidDirection);
        require!(alert_threshold <= 100, SentinelError::InvalidThreshold);
        
        let subscription = &mut ctx.accounts.subscription;
        let clock = Clock::get()?;
        
        subscription.user = ctx.accounts.user.key();
        subscription.symbol = symbol;
        subscription.direction = direction;
        subscription.alert_threshold = alert_threshold;
        subscription.subscribed_at = clock.unix_timestamp;
        subscription.last_alert = 0;
        subscription.bump = ctx.bumps.subscription;
        
        Ok(())
    }

    pub fn vote_sentiment(
        ctx: Context<VoteSentiment>,
        symbol: String,
        score: i8,
        confidence: u8,
    ) -> Result<()> {
        require!(symbol.len() <= MAX_SYMBOL_LEN, SentinelError::SymbolTooLong);
        require!(score >= -100 && score <= 100, SentinelError::InvalidScore);
        require!(confidence <= 100, SentinelError::InvalidConfidence);
        
        let vote = &mut ctx.accounts.vote;
        let profile = &mut ctx.accounts.profile;
        let clock = Clock::get()?;
        
        vote.voter = ctx.accounts.user.key();
        vote.symbol = symbol.clone();
        vote.score = score;
        vote.confidence = confidence;
        vote.timestamp = clock.unix_timestamp;
        vote.bump = ctx.bumps.vote;
        
        profile.last_active = clock.unix_timestamp;
        
        emit!(CommunityVoteEvent {
            voter: vote.voter,
            symbol,
            score,
            confidence,
            timestamp: clock.unix_timestamp,
        });
        
        Ok(())
    }
}

// ============================================================================
// Accounts
// ============================================================================

#[account]
pub struct Sentinel {
    pub authority: Pubkey,
    pub total_updates: u64,
    pub bump: u8,
}

impl Sentinel {
    pub const LEN: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct SentimentRecord {
    pub symbol: String,
    pub score: i8,
    pub confidence: u8,
    pub volume: u32,
    pub timestamp: i64,
    pub updater: Pubkey,
    pub bump: u8,
}

impl SentimentRecord {
    pub const LEN: usize = 8 + 4 + MAX_SYMBOL_LEN + 1 + 1 + 4 + 8 + 32 + 1;
}

#[account]
pub struct UserProfile {
    pub owner: Pubkey,
    pub username: String,
    pub predictions_made: u32,
    pub correct_predictions: u32,
    pub reputation: u16,
    pub created_at: i64,
    pub last_active: i64,
    pub bump: u8,
}

impl UserProfile {
    pub const LEN: usize = 8 + 32 + 4 + MAX_USERNAME_LEN + 4 + 4 + 2 + 8 + 8 + 1;
}

#[account]
pub struct Subscription {
    pub user: Pubkey,
    pub symbol: String,
    pub direction: i8,
    pub alert_threshold: u8,
    pub subscribed_at: i64,
    pub last_alert: i64,
    pub bump: u8,
}

impl Subscription {
    pub const LEN: usize = 8 + 32 + 4 + 10 + 1 + 1 + 8 + 8 + 1;
}

#[account]
pub struct CommunityVote {
    pub voter: Pubkey,
    pub symbol: String,
    pub score: i8,
    pub confidence: u8,
    pub timestamp: i64,
    pub bump: u8,
}

impl CommunityVote {
    pub const LEN: usize = 8 + 32 + 4 + 10 + 1 + 1 + 8 + 1;
}

// ============================================================================
// Contexts
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = Sentinel::LEN,
        seeds = [SENTINEL_SEED],
        bump
    )]
    pub sentinel: Account<'info, Sentinel>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(symbol: String)]
pub struct StoreSentiment<'info> {
    #[account(
        mut,
        seeds = [SENTINEL_SEED],
        bump = sentinel.bump,
        constraint = sentinel.authority == authority.key() @ SentinelError::Unauthorized
    )]
    pub sentinel: Account<'info, Sentinel>,

    #[account(
        init,
        payer = authority,
        space = SentimentRecord::LEN,
        seeds = [SENTIMENT_SEED, symbol.as_bytes()],
        bump
    )]
    pub sentiment: Account<'info, SentimentRecord>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateProfile<'info> {
    #[account(
        init,
        payer = user,
        space = UserProfile::LEN,
        seeds = [USER_PROFILE_SEED, user.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, UserProfile>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(symbol: String)]
pub struct SubscribeToken<'info> {
    #[account(
        init,
        payer = user,
        space = Subscription::LEN,
        seeds = [SUBSCRIPTION_SEED, user.key().as_ref(), symbol.as_bytes()],
        bump
    )]
    pub subscription: Account<'info, Subscription>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(symbol: String)]
pub struct VoteSentiment<'info> {
    #[account(
        init,
        payer = user,
        space = CommunityVote::LEN,
        seeds = [b"vote", user.key().as_ref(), symbol.as_bytes()],
        bump
    )]
    pub vote: Account<'info, CommunityVote>,
    
    #[account(
        mut,
        seeds = [USER_PROFILE_SEED, user.key().as_ref()],
        bump = profile.bump,
        constraint = profile.owner == user.key() @ SentinelError::Unauthorized
    )]
    pub profile: Account<'info, UserProfile>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct SentimentUpdated {
    pub symbol: String,
    pub score: i8,
    pub confidence: u8,
    pub volume: u32,
    pub timestamp: i64,
    pub updater: Pubkey,
}

#[event]
pub struct CommunityVoteEvent {
    pub voter: Pubkey,
    pub symbol: String,
    pub score: i8,
    pub confidence: u8,
    pub timestamp: i64,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum SentinelError {
    #[msg("Symbol too long (max 10 characters)")]
    SymbolTooLong,
    
    #[msg("Invalid sentiment score (must be -100 to +100)")]
    InvalidScore,
    
    #[msg("Invalid confidence (must be 0 to 100)")]
    InvalidConfidence,
    
    #[msg("Unauthorized")]
    Unauthorized,
    
    #[msg("Username too long (max 20 characters)")]
    UsernameTooLong,
    
    #[msg("Invalid direction (must be -1, 0, or 1)")]
    InvalidDirection,
    
    #[msg("Invalid threshold (must be 0-100)")]
    InvalidThreshold,
}
