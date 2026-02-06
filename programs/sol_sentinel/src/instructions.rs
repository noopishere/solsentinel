// Social feature instructions
use anchor_lang::prelude::*;
use crate::social::*;
use crate::*;

/// Create a user profile
pub fn create_profile(ctx: Context<CreateProfile>, username: String) -> Result<()> {
    require!(username.len() <= MAX_USERNAME_LEN, SentinelError::UsernameTooLong);
    
    let profile = &mut ctx.accounts.profile;
    let clock = Clock::get()?;
    
    profile.owner = ctx.accounts.user.key();
    profile.username = username.clone();
    profile.predictions_made = 0;
    profile.correct_predictions = 0;
    profile.reputation = 100; // Start with 100 rep
    profile.created_at = clock.unix_timestamp;
    profile.last_active = clock.unix_timestamp;
    profile.bump = ctx.bumps.profile;
    
    msg!("Profile created: {} ({})", profile.username, profile.owner);
    Ok(())
}

/// Subscribe to a token
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
    subscription.symbol = symbol.clone();
    subscription.direction = direction;
    subscription.alert_threshold = alert_threshold;
    subscription.subscribed_at = clock.unix_timestamp;
    subscription.last_alert = 0;
    subscription.bump = ctx.bumps.subscription;
    
    msg!("User {} subscribed to {}", subscription.user, symbol);
    Ok(())
}

/// Unsubscribe from a token (close account)
pub fn unsubscribe_token(_ctx: Context<UnsubscribeToken>) -> Result<()> {
    // Account will be closed automatically via close constraint
    msg!("Subscription closed");
    Ok(())
}

/// Cast a community vote on sentiment
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
    
    // Update user's last activity
    profile.last_active = clock.unix_timestamp;
    
    emit!(CommunityVoteEvent {
        voter: vote.voter,
        symbol: symbol.clone(),
        score,
        confidence,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Vote cast: {} voted {} on {}", vote.voter, score, symbol);
    Ok(())
}

/// Record prediction outcome (for reputation)
pub fn record_prediction_result(
    ctx: Context<RecordPrediction>,
    was_correct: bool,
) -> Result<()> {
    let profile = &mut ctx.accounts.profile;
    profile.update_reputation(was_correct);
    
    let clock = Clock::get()?;
    profile.last_active = clock.unix_timestamp;
    
    emit!(ReputationUpdated {
        user: profile.owner,
        reputation: profile.reputation,
        accuracy: profile.accuracy(),
        total_predictions: profile.predictions_made,
    });
    
    msg!(
        "Prediction recorded for {}: accuracy now {}%",
        profile.owner,
        profile.accuracy()
    );
    Ok(())
}

// ============================================================================
// Contexts
// ============================================================================

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
pub struct UnsubscribeToken<'info> {
    #[account(
        mut,
        close = user,
        seeds = [SUBSCRIPTION_SEED, user.key().as_ref(), subscription.symbol.as_bytes()],
        bump = subscription.bump,
        constraint = subscription.user == user.key() @ SentinelError::Unauthorized
    )]
    pub subscription: Account<'info, Subscription>,
    
    #[account(mut)]
    pub user: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(symbol: String)]
pub struct VoteSentiment<'info> {
    #[account(
        init_if_needed,
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

#[derive(Accounts)]
pub struct RecordPrediction<'info> {
    #[account(
        mut,
        seeds = [USER_PROFILE_SEED, user.key().as_ref()],
        bump = profile.bump,
        constraint = profile.owner == user.key() @ SentinelError::Unauthorized
    )]
    pub profile: Account<'info, UserProfile>,
    
    pub user: Signer<'info>,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct CommunityVoteEvent {
    pub voter: Pubkey,
    pub symbol: String,
    pub score: i8,
    pub confidence: u8,
    pub timestamp: i64,
}

#[event]
pub struct ReputationUpdated {
    pub user: Pubkey,
    pub reputation: u16,
    pub accuracy: u8,
    pub total_predictions: u32,
}
