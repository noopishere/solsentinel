use anchor_lang::prelude::*;

mod social;
mod instructions;

use social::*;
use instructions::*;

declare_id!("SoLSentineLXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

/// Maximum length of token symbol (e.g., "SOL", "BONK")
pub const MAX_SYMBOL_LEN: usize = 10;

/// Seeds for PDA derivation
pub const SENTINEL_SEED: &[u8] = b"sentinel";
pub const SENTIMENT_SEED: &[u8] = b"sentiment";

#[program]
pub mod sol_sentinel {
    use super::*;

    // ===== Core Oracle Functions =====
    
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let sentinel = &mut ctx.accounts.sentinel;
        sentinel.authority = ctx.accounts.authority.key();
        sentinel.total_updates = 0;
        sentinel.bump = ctx.bumps.sentinel;
        
        msg!("SolSentinel initialized. Authority: {}", sentinel.authority);
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

    pub fn batch_store_sentiment(
        ctx: Context<BatchStoreSentiment>,
        updates: Vec<SentimentUpdate>,
    ) -> Result<()> {
        require!(!updates.is_empty(), SentinelError::EmptyBatch);
        require!(updates.len() <= 10, SentinelError::BatchTooLarge);

        let sentinel = &mut ctx.accounts.sentinel;
        sentinel.total_updates = sentinel.total_updates.saturating_add(updates.len() as u64);

        for update in updates {
            emit!(SentimentUpdated {
                symbol: update.symbol,
                score: update.score,
                confidence: update.confidence,
                volume: update.volume,
                timestamp: update.timestamp,
                updater: ctx.accounts.authority.key(),
            });
        }

        Ok(())
    }

    pub fn transfer_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
        let sentinel = &mut ctx.accounts.sentinel;
        sentinel.authority = new_authority;
        Ok(())
    }

    // ===== Social Functions =====
    
    pub fn create_profile(ctx: Context<CreateProfile>, username: String) -> Result<()> {
        instructions::create_profile(ctx, username)
    }

    pub fn subscribe_token(
        ctx: Context<SubscribeToken>,
        symbol: String,
        direction: i8,
        alert_threshold: u8,
    ) -> Result<()> {
        instructions::subscribe_token(ctx, symbol, direction, alert_threshold)
    }

    pub fn unsubscribe_token(ctx: Context<UnsubscribeToken>) -> Result<()> {
        instructions::unsubscribe_token(ctx)
    }

    pub fn vote_sentiment(
        ctx: Context<VoteSentiment>,
        symbol: String,
        score: i8,
        confidence: u8,
    ) -> Result<()> {
        instructions::vote_sentiment(ctx, symbol, score, confidence)
    }

    pub fn record_prediction_result(
        ctx: Context<RecordPrediction>,
        was_correct: bool,
    ) -> Result<()> {
        instructions::record_prediction_result(ctx, was_correct)
    }
}

// ============================================================================
// Core Accounts
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

// ============================================================================
// Core Contexts
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
        init_if_needed,
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
pub struct BatchStoreSentiment<'info> {
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
pub struct TransferAuthority<'info> {
    #[account(
        mut,
        seeds = [SENTINEL_SEED],
        bump = sentinel.bump,
        constraint = sentinel.authority == authority.key() @ SentinelError::Unauthorized
    )]
    pub sentinel: Account<'info, Sentinel>,

    pub authority: Signer<'info>,
}

// ============================================================================
// Types
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SentimentUpdate {
    pub symbol: String,
    pub score: i8,
    pub confidence: u8,
    pub volume: u32,
    pub timestamp: i64,
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
    
    #[msg("Unauthorized: only the authority can update sentiment")]
    Unauthorized,
    
    #[msg("Batch update is empty")]
    EmptyBatch,
    
    #[msg("Batch too large (max 10 tokens per call)")]
    BatchTooLarge,
    
    #[msg("Username too long (max 20 characters)")]
    UsernameTooLong,
    
    #[msg("Invalid direction (must be -1, 0, or 1)")]
    InvalidDirection,
    
    #[msg("Invalid threshold (must be 0-100)")]
    InvalidThreshold,
}
