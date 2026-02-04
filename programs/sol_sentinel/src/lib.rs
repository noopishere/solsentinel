use anchor_lang::prelude::*;

declare_id!("SoLSentineLXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

/// Maximum length of token symbol (e.g., "SOL", "BONK")
pub const MAX_SYMBOL_LEN: usize = 10;

/// Seeds for PDA derivation
pub const SENTINEL_SEED: &[u8] = b"sentinel";
pub const SENTIMENT_SEED: &[u8] = b"sentiment";

#[program]
pub mod sol_sentinel {
    use super::*;

    /// Initialize the sentinel oracle authority
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let sentinel = &mut ctx.accounts.sentinel;
        sentinel.authority = ctx.accounts.authority.key();
        sentinel.total_updates = 0;
        sentinel.bump = ctx.bumps.sentinel;
        
        msg!("SolSentinel initialized. Authority: {}", sentinel.authority);
        Ok(())
    }

    /// Store sentiment data for a token
    pub fn store_sentiment(
        ctx: Context<StoreSentiment>,
        symbol: String,
        score: i8,          // -100 to +100
        confidence: u8,     // 0 to 100
        volume: u32,        // Number of mentions analyzed
        timestamp: i64,     // Unix timestamp
    ) -> Result<()> {
        require!(symbol.len() <= MAX_SYMBOL_LEN, SentinelError::SymbolTooLong);
        require!(score >= -100 && score <= 100, SentinelError::InvalidScore);
        require!(confidence <= 100, SentinelError::InvalidConfidence);

        let sentiment = &mut ctx.accounts.sentiment;
        let sentinel = &mut ctx.accounts.sentinel;

        // Update sentiment record
        sentiment.symbol = symbol.clone();
        sentiment.score = score;
        sentiment.confidence = confidence;
        sentiment.volume = volume;
        sentiment.timestamp = timestamp;
        sentiment.updater = ctx.accounts.authority.key();
        sentiment.bump = ctx.bumps.sentiment;

        // Increment global counter
        sentinel.total_updates = sentinel.total_updates.saturating_add(1);

        // Emit event for off-chain indexers
        emit!(SentimentUpdated {
            symbol,
            score,
            confidence,
            volume,
            timestamp,
            updater: ctx.accounts.authority.key(),
        });

        msg!(
            "Sentiment stored: {} = {} (confidence: {}%, volume: {})",
            sentiment.symbol,
            sentiment.score,
            sentiment.confidence,
            sentiment.volume
        );

        Ok(())
    }

    /// Batch update multiple token sentiments (more efficient)
    pub fn batch_store_sentiment(
        ctx: Context<BatchStoreSentiment>,
        updates: Vec<SentimentUpdate>,
    ) -> Result<()> {
        require!(!updates.is_empty(), SentinelError::EmptyBatch);
        require!(updates.len() <= 10, SentinelError::BatchTooLarge);

        let sentinel = &mut ctx.accounts.sentinel;
        sentinel.total_updates = sentinel.total_updates.saturating_add(updates.len() as u64);

        msg!("Batch update: {} tokens", updates.len());
        
        // Note: In a full implementation, each sentiment account would be 
        // passed in remaining_accounts and updated individually
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

    /// Transfer oracle authority to a new address
    pub fn transfer_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
        let sentinel = &mut ctx.accounts.sentinel;
        
        msg!(
            "Authority transfer: {} -> {}",
            sentinel.authority,
            new_authority
        );
        
        sentinel.authority = new_authority;
        Ok(())
    }
}

// ============================================================================
// Accounts
// ============================================================================

/// Global oracle state
#[account]
pub struct Sentinel {
    /// Authority who can update sentiment data
    pub authority: Pubkey,
    /// Total number of sentiment updates
    pub total_updates: u64,
    /// Bump seed for PDA
    pub bump: u8,
}

impl Sentinel {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        8 +  // total_updates
        1;   // bump
}

/// Sentiment data for a single token
#[account]
pub struct SentimentRecord {
    /// Token symbol (e.g., "SOL", "BONK")
    pub symbol: String,
    /// Sentiment score: -100 (very bearish) to +100 (very bullish)
    pub score: i8,
    /// Confidence level: 0-100%
    pub confidence: u8,
    /// Number of data points analyzed
    pub volume: u32,
    /// Unix timestamp of last update
    pub timestamp: i64,
    /// Pubkey of the updater
    pub updater: Pubkey,
    /// Bump seed for PDA
    pub bump: u8,
}

impl SentimentRecord {
    pub const LEN: usize = 8 +  // discriminator
        4 + MAX_SYMBOL_LEN + // symbol (String with max length)
        1 +  // score (i8)
        1 +  // confidence (u8)
        4 +  // volume (u32)
        8 +  // timestamp (i64)
        32 + // updater
        1;   // bump
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

/// Struct for batch updates
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
}
