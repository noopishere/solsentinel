use anchor_lang::prelude::*;

declare_id!("HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm");

// ============================================================================
// Constants
// ============================================================================

pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_USERNAME_LEN: usize = 20;
pub const MAX_OPERATORS: usize = 5;
pub const MAX_HISTORY: usize = 24; // 24 historical snapshots per token
pub const MAX_BATCH_SIZE: usize = 10;

pub const SENTINEL_SEED: &[u8] = b"sentinel";
pub const SENTIMENT_SEED: &[u8] = b"sentiment";
pub const HISTORY_SEED: &[u8] = b"history";
pub const USER_PROFILE_SEED: &[u8] = b"user_profile";
pub const SUBSCRIPTION_SEED: &[u8] = b"subscription";
pub const VOTE_SEED: &[u8] = b"vote";

#[program]
pub mod sol_sentinel {
    use super::*;

    // ===== Admin / Oracle Setup =====

    /// Initialize the global sentinel state. Called once.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let sentinel = &mut ctx.accounts.sentinel;
        sentinel.authority = ctx.accounts.authority.key();
        sentinel.total_updates = 0;
        sentinel.paused = false;
        sentinel.operators = Vec::new();
        sentinel.bump = ctx.bumps.sentinel;
        msg!("SolSentinel initialized");
        Ok(())
    }

    /// Transfer authority to a new admin.
    pub fn transfer_authority(ctx: Context<AdminAction>, new_authority: Pubkey) -> Result<()> {
        require!(new_authority != Pubkey::default(), SentinelError::InvalidAuthority);
        let sentinel = &mut ctx.accounts.sentinel;
        let old = sentinel.authority;
        sentinel.authority = new_authority;
        emit!(AuthorityTransferred { old_authority: old, new_authority });
        Ok(())
    }

    /// Pause or unpause the oracle.
    pub fn set_paused(ctx: Context<AdminAction>, paused: bool) -> Result<()> {
        ctx.accounts.sentinel.paused = paused;
        emit!(PauseToggled { paused });
        Ok(())
    }

    /// Add an operator who can submit sentiment updates (max 5).
    pub fn add_operator(ctx: Context<AdminAction>, operator: Pubkey) -> Result<()> {
        let sentinel = &mut ctx.accounts.sentinel;
        require!(sentinel.operators.len() < MAX_OPERATORS, SentinelError::TooManyOperators);
        require!(!sentinel.operators.contains(&operator), SentinelError::OperatorAlreadyExists);
        sentinel.operators.push(operator);
        emit!(OperatorAdded { operator });
        Ok(())
    }

    /// Remove an operator.
    pub fn remove_operator(ctx: Context<AdminAction>, operator: Pubkey) -> Result<()> {
        let sentinel = &mut ctx.accounts.sentinel;
        let idx = sentinel.operators.iter().position(|o| *o == operator)
            .ok_or(SentinelError::OperatorNotFound)?;
        sentinel.operators.remove(idx);
        emit!(OperatorRemoved { operator });
        Ok(())
    }

    // ===== Core Oracle Functions =====

    /// Store sentiment for a token (creates or updates the record).
    /// Only authority or operators may call this.
    pub fn store_sentiment(
        ctx: Context<StoreSentiment>,
        symbol: String,
        score: i8,
        confidence: u8,
        volume: u32,
        timestamp: i64,
    ) -> Result<()> {
        validate_sentiment_input(&symbol, score, confidence, timestamp)?;
        let sentinel = &ctx.accounts.sentinel;
        require!(!sentinel.paused, SentinelError::OraclePaused);

        let sentiment = &mut ctx.accounts.sentiment;
        sentiment.symbol = symbol.clone();
        sentiment.score = score;
        sentiment.confidence = confidence;
        sentiment.volume = volume;
        sentiment.timestamp = timestamp;
        sentiment.updater = ctx.accounts.authority.key();
        sentiment.update_count = 0;
        sentiment.bump = ctx.bumps.sentiment;

        let sentinel = &mut ctx.accounts.sentinel;
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

    /// Update an existing sentiment record in place (no realloc needed).
    pub fn update_sentiment(
        ctx: Context<UpdateSentiment>,
        score: i8,
        confidence: u8,
        volume: u32,
        timestamp: i64,
    ) -> Result<()> {
        let sentinel = &ctx.accounts.sentinel;
        require!(!sentinel.paused, SentinelError::OraclePaused);
        require!(score >= -100 && score <= 100, SentinelError::InvalidScore);
        require!(confidence <= 100, SentinelError::InvalidConfidence);

        let sentiment = &mut ctx.accounts.sentiment;
        require!(timestamp > sentiment.timestamp, SentinelError::StaleTimestamp);

        sentiment.score = score;
        sentiment.confidence = confidence;
        sentiment.volume = volume;
        sentiment.timestamp = timestamp;
        sentiment.updater = ctx.accounts.authority.key();
        sentiment.update_count = sentiment.update_count.saturating_add(1);

        let sentinel = &mut ctx.accounts.sentinel;
        sentinel.total_updates = sentinel.total_updates.saturating_add(1);

        emit!(SentimentUpdated {
            symbol: sentiment.symbol.clone(),
            score,
            confidence,
            volume,
            timestamp,
            updater: ctx.accounts.authority.key(),
        });

        Ok(())
    }

    /// Batch update multiple existing sentiment records in a single tx.
    /// Reduces tx count for multi-token oracles.
    pub fn batch_update_sentiments(
        ctx: Context<BatchUpdateSentiments>,
        updates: Vec<SentimentInput>,
    ) -> Result<()> {
        let sentinel_account = &ctx.accounts.sentinel;
        require!(!sentinel_account.paused, SentinelError::OraclePaused);
        require!(!updates.is_empty(), SentinelError::EmptyBatch);
        require!(updates.len() <= MAX_BATCH_SIZE, SentinelError::BatchTooLarge);

        let remaining = &ctx.remaining_accounts;
        require!(remaining.len() == updates.len(), SentinelError::AccountMismatch);

        let authority_key = ctx.accounts.authority.key();
        let mut total_applied: u64 = 0;

        for (i, update) in updates.iter().enumerate() {
            require!(update.score >= -100 && update.score <= 100, SentinelError::InvalidScore);
            require!(update.confidence <= 100, SentinelError::InvalidConfidence);

            let account_info = &remaining[i];
            // Verify the account is owned by our program
            require!(account_info.owner == ctx.program_id, SentinelError::InvalidAccount);

            let mut data = account_info.try_borrow_mut_data()?;
            // Anchor discriminator is first 8 bytes — verify it matches SentimentRecord
            let disc = &data[..8];
            let expected = SentimentRecord::DISCRIMINATOR;
            require!(disc == expected, SentinelError::InvalidAccount);

            // Deserialize, mutate, reserialize
            let mut record = SentimentRecord::try_deserialize(&mut &data[..])?;
            require!(update.timestamp > record.timestamp, SentinelError::StaleTimestamp);

            record.score = update.score;
            record.confidence = update.confidence;
            record.volume = update.volume;
            record.timestamp = update.timestamp;
            record.updater = authority_key;
            record.update_count = record.update_count.saturating_add(1);

            let mut writer = &mut data[..];
            record.try_serialize(&mut writer)?;

            emit!(SentimentUpdated {
                symbol: record.symbol.clone(),
                score: update.score,
                confidence: update.confidence,
                volume: update.volume,
                timestamp: update.timestamp,
                updater: authority_key,
            });

            total_applied += 1;
        }

        // Update global counter
        let sentinel = &mut ctx.accounts.sentinel;
        sentinel.total_updates = sentinel.total_updates.saturating_add(total_applied);

        emit!(BatchUpdateCompleted { count: total_applied as u8 });
        Ok(())
    }

    /// Take a historical snapshot of a sentiment record.
    /// Stores the last N readings in a ring buffer for historical queries.
    pub fn record_history(ctx: Context<RecordHistory>, symbol: String) -> Result<()> {
        let sentiment = &ctx.accounts.sentiment;
        let history = &mut ctx.accounts.history;
        let clock = Clock::get()?;

        // Initialize on first use
        if history.symbol.is_empty() {
            history.symbol = symbol;
            history.bump = ctx.bumps.history;
            history.count = 0;
            history.head = 0;
            history.snapshots = vec![HistoryEntry::default(); MAX_HISTORY];
        }

        let entry = HistoryEntry {
            score: sentiment.score,
            confidence: sentiment.confidence,
            volume: sentiment.volume,
            timestamp: sentiment.timestamp,
            recorded_at: clock.unix_timestamp,
        };

        let idx = history.head as usize % MAX_HISTORY;
        history.snapshots[idx] = entry;
        history.head = history.head.wrapping_add(1);
        if (history.count as usize) < MAX_HISTORY {
            history.count += 1;
        }

        emit!(HistoryRecorded {
            symbol: history.symbol.clone(),
            entries: history.count,
        });

        Ok(())
    }

    // ===== Social Functions =====

    pub fn create_profile(ctx: Context<CreateProfile>, username: String) -> Result<()> {
        require!(!username.is_empty(), SentinelError::EmptyUsername);
        require!(username.len() <= MAX_USERNAME_LEN, SentinelError::UsernameTooLong);
        require!(username.chars().all(|c| c.is_alphanumeric() || c == '_'), SentinelError::InvalidUsername);

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
        require!(!symbol.is_empty(), SentinelError::EmptySymbol);
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

    pub fn unsubscribe_token(ctx: Context<Unsubscribe>) -> Result<()> {
        // Account is closed via the close constraint
        emit!(Unsubscribed {
            user: ctx.accounts.user.key(),
            symbol: ctx.accounts.subscription.symbol.clone(),
        });
        Ok(())
    }

    pub fn vote_sentiment(
        ctx: Context<VoteSentiment>,
        symbol: String,
        score: i8,
        confidence: u8,
    ) -> Result<()> {
        require!(symbol.len() <= MAX_SYMBOL_LEN, SentinelError::SymbolTooLong);
        require!(!symbol.is_empty(), SentinelError::EmptySymbol);
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

        profile.predictions_made = profile.predictions_made.saturating_add(1);
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

    /// Admin can resolve a user's prediction (correct or not) and adjust reputation.
    pub fn resolve_prediction(
        ctx: Context<ResolvePrediction>,
        correct: bool,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;

        if correct {
            profile.correct_predictions = profile.correct_predictions.saturating_add(1);
            profile.reputation = profile.reputation.saturating_add(10).min(1000);
        } else {
            profile.reputation = profile.reputation.saturating_sub(5).max(0);
        }

        emit!(PredictionResolved {
            user: profile.owner,
            correct,
            new_reputation: profile.reputation,
        });

        Ok(())
    }

    /// Close a sentiment record and reclaim rent (admin only).
    pub fn close_sentiment(ctx: Context<CloseSentiment>, _symbol: String) -> Result<()> {
        emit!(SentimentClosed { symbol: ctx.accounts.sentiment.symbol.clone() });
        Ok(())
    }
}

// ============================================================================
// Helpers
// ============================================================================

fn validate_sentiment_input(symbol: &str, score: i8, confidence: u8, timestamp: i64) -> Result<()> {
    require!(!symbol.is_empty(), SentinelError::EmptySymbol);
    require!(symbol.len() <= MAX_SYMBOL_LEN, SentinelError::SymbolTooLong);
    require!(symbol.chars().all(|c| c.is_ascii_alphanumeric()), SentinelError::InvalidSymbol);
    require!(score >= -100 && score <= 100, SentinelError::InvalidScore);
    require!(confidence <= 100, SentinelError::InvalidConfidence);
    require!(timestamp > 0, SentinelError::InvalidTimestamp);
    Ok(())
}

fn is_authority_or_operator(sentinel: &Sentinel, signer: &Pubkey) -> bool {
    sentinel.authority == *signer || sentinel.operators.contains(signer)
}

// ============================================================================
// Data types
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SentimentInput {
    pub score: i8,
    pub confidence: u8,
    pub volume: u32,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct HistoryEntry {
    pub score: i8,
    pub confidence: u8,
    pub volume: u32,
    pub timestamp: i64,
    pub recorded_at: i64,
}

impl HistoryEntry {
    pub const LEN: usize = 1 + 1 + 4 + 8 + 8; // 22
}

// ============================================================================
// Accounts
// ============================================================================

#[account]
pub struct Sentinel {
    pub authority: Pubkey,
    pub total_updates: u64,
    pub paused: bool,
    pub operators: Vec<Pubkey>,  // up to MAX_OPERATORS
    pub bump: u8,
}

impl Sentinel {
    pub const LEN: usize = 8  // discriminator
        + 32                   // authority
        + 8                    // total_updates
        + 1                    // paused
        + 4 + (32 * MAX_OPERATORS)  // operators vec
        + 1;                   // bump
}

#[account]
pub struct SentimentRecord {
    pub symbol: String,
    pub score: i8,
    pub confidence: u8,
    pub volume: u32,
    pub timestamp: i64,
    pub updater: Pubkey,
    pub update_count: u32,
    pub bump: u8,
}

impl SentimentRecord {
    pub const LEN: usize = 8 + 4 + MAX_SYMBOL_LEN + 1 + 1 + 4 + 8 + 32 + 4 + 1;
}

#[account]
pub struct SentimentHistory {
    pub symbol: String,
    pub head: u16,
    pub count: u16,
    pub snapshots: Vec<HistoryEntry>,
    pub bump: u8,
}

impl SentimentHistory {
    pub const LEN: usize = 8
        + 4 + MAX_SYMBOL_LEN     // symbol
        + 2                       // head
        + 2                       // count
        + 4 + (HistoryEntry::LEN * MAX_HISTORY) // snapshots vec
        + 1;                      // bump
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
    pub const LEN: usize = 8 + 32 + 4 + MAX_SYMBOL_LEN + 1 + 1 + 8 + 8 + 1;
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
    pub const LEN: usize = 8 + 32 + 4 + MAX_SYMBOL_LEN + 1 + 1 + 8 + 1;
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
pub struct AdminAction<'info> {
    #[account(
        mut,
        seeds = [SENTINEL_SEED],
        bump = sentinel.bump,
        constraint = sentinel.authority == authority.key() @ SentinelError::Unauthorized
    )]
    pub sentinel: Account<'info, Sentinel>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(symbol: String)]
pub struct StoreSentiment<'info> {
    #[account(
        mut,
        seeds = [SENTINEL_SEED],
        bump = sentinel.bump,
        constraint = is_authority_or_operator(&sentinel, &authority.key()) @ SentinelError::Unauthorized
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
pub struct UpdateSentiment<'info> {
    #[account(
        mut,
        seeds = [SENTINEL_SEED],
        bump = sentinel.bump,
        constraint = is_authority_or_operator(&sentinel, &authority.key()) @ SentinelError::Unauthorized
    )]
    pub sentinel: Account<'info, Sentinel>,

    #[account(
        mut,
        seeds = [SENTIMENT_SEED, sentiment.symbol.as_bytes()],
        bump = sentiment.bump,
    )]
    pub sentiment: Account<'info, SentimentRecord>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct BatchUpdateSentiments<'info> {
    #[account(
        mut,
        seeds = [SENTINEL_SEED],
        bump = sentinel.bump,
        constraint = is_authority_or_operator(&sentinel, &authority.key()) @ SentinelError::Unauthorized
    )]
    pub sentinel: Account<'info, Sentinel>,

    #[account(mut)]
    pub authority: Signer<'info>,
    // Sentiment accounts are passed as remaining_accounts
}

#[derive(Accounts)]
#[instruction(symbol: String)]
pub struct RecordHistory<'info> {
    #[account(
        seeds = [SENTINEL_SEED],
        bump = sentinel.bump,
        constraint = is_authority_or_operator(&sentinel, &authority.key()) @ SentinelError::Unauthorized
    )]
    pub sentinel: Account<'info, Sentinel>,

    #[account(
        seeds = [SENTIMENT_SEED, symbol.as_bytes()],
        bump = sentiment.bump,
    )]
    pub sentiment: Account<'info, SentimentRecord>,

    #[account(
        init_if_needed,
        payer = authority,
        space = SentimentHistory::LEN,
        seeds = [HISTORY_SEED, symbol.as_bytes()],
        bump
    )]
    pub history: Account<'info, SentimentHistory>,

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
pub struct Unsubscribe<'info> {
    #[account(
        mut,
        close = user,
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
        init,
        payer = user,
        space = CommunityVote::LEN,
        seeds = [VOTE_SEED, user.key().as_ref(), symbol.as_bytes()],
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
pub struct ResolvePrediction<'info> {
    #[account(
        seeds = [SENTINEL_SEED],
        bump = sentinel.bump,
        constraint = sentinel.authority == authority.key() @ SentinelError::Unauthorized
    )]
    pub sentinel: Account<'info, Sentinel>,

    #[account(mut)]
    pub profile: Account<'info, UserProfile>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(_symbol: String)]
pub struct CloseSentiment<'info> {
    #[account(
        seeds = [SENTINEL_SEED],
        bump = sentinel.bump,
        constraint = sentinel.authority == authority.key() @ SentinelError::Unauthorized
    )]
    pub sentinel: Account<'info, Sentinel>,

    #[account(
        mut,
        close = authority,
        seeds = [SENTIMENT_SEED, _symbol.as_bytes()],
        bump = sentiment.bump,
    )]
    pub sentiment: Account<'info, SentimentRecord>,

    #[account(mut)]
    pub authority: Signer<'info>,
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

#[event]
pub struct AuthorityTransferred {
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct PauseToggled {
    pub paused: bool,
}

#[event]
pub struct OperatorAdded {
    pub operator: Pubkey,
}

#[event]
pub struct OperatorRemoved {
    pub operator: Pubkey,
}

#[event]
pub struct BatchUpdateCompleted {
    pub count: u8,
}

#[event]
pub struct HistoryRecorded {
    pub symbol: String,
    pub entries: u16,
}

#[event]
pub struct Unsubscribed {
    pub user: Pubkey,
    pub symbol: String,
}

#[event]
pub struct PredictionResolved {
    pub user: Pubkey,
    pub correct: bool,
    pub new_reputation: u16,
}

#[event]
pub struct SentimentClosed {
    pub symbol: String,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum SentinelError {
    #[msg("Symbol too long (max 10 characters)")]
    SymbolTooLong,

    #[msg("Symbol cannot be empty")]
    EmptySymbol,

    #[msg("Symbol must be alphanumeric")]
    InvalidSymbol,

    #[msg("Invalid sentiment score (must be -100 to +100)")]
    InvalidScore,

    #[msg("Invalid confidence (must be 0 to 100)")]
    InvalidConfidence,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Username too long (max 20 characters)")]
    UsernameTooLong,

    #[msg("Username cannot be empty")]
    EmptyUsername,

    #[msg("Username must be alphanumeric or underscore")]
    InvalidUsername,

    #[msg("Invalid direction (must be -1, 0, or 1)")]
    InvalidDirection,

    #[msg("Invalid threshold (must be 0-100)")]
    InvalidThreshold,

    #[msg("Oracle is paused")]
    OraclePaused,

    #[msg("Too many operators (max 5)")]
    TooManyOperators,

    #[msg("Operator already exists")]
    OperatorAlreadyExists,

    #[msg("Operator not found")]
    OperatorNotFound,

    #[msg("Invalid authority address")]
    InvalidAuthority,

    #[msg("Timestamp must be newer than current record")]
    StaleTimestamp,

    #[msg("Batch is empty")]
    EmptyBatch,

    #[msg("Batch too large (max 10)")]
    BatchTooLarge,

    #[msg("Account count does not match update count")]
    AccountMismatch,

    #[msg("Invalid account passed")]
    InvalidAccount,

    #[msg("Invalid timestamp")]
    InvalidTimestamp,
}
