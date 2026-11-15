//! Births and lifetimes: founders, children (earned by a parent's place), create, join, start, close.

use anchor_lang::prelude::*;

use crate::{constants::*, error::ArenaError, events::*, state::*};

#[derive(Accounts)]
pub struct RegisterFounder<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// The individual's own key: it signs every action.
    pub wallet: Signer<'info>,
    #[account(init, payer = payer, space = 8 + Contestant::INIT_SPACE, seeds = [CONTESTANT_SEED, wallet.key().as_ref()], bump)]
    pub contestant: Account<'info, Contestant>,
    pub system_program: Program<'info, System>,
}

fn init_contestant(c: &mut Contestant, wallet: Pubkey, owner: Pubkey, name: [u8; 24], brain: [u8; 32], skill_hash: [u8; 32], home: u8, job: u8, bump: u8) -> Result<()> {
    require!(job_allowed(home, job), ArenaError::BadJob);
    c.wallet = wallet;
    c.owner = owner;
    c.name = name;
    c.brain = brain;
    c.skill_hash = skill_hash;
    c.home = home;
    c.job = job;
    c.place = NONE;
    c.born_ts = Clock::get()?.unix_timestamp;
    c.bump = bump;
    Ok(())
}

/// Anyone may found a family: generation 1, no parent, no words.
#[allow(clippy::too_many_arguments)]
pub fn handle_register_founder(ctx: Context<RegisterFounder>, name: [u8; 24], brain: [u8; 32], skill_hash: [u8; 32], owner: Pubkey, home: u8, job: u8) -> Result<()> {
    let wallet = ctx.accounts.wallet.key();
    let c = &mut ctx.accounts.contestant;
    init_contestant(c, wallet, owner, name, brain, skill_hash, home, job, ctx.bumps.contestant)?;
    c.generation = 1;
    c.family = name;
    emit!(Born { contestant: c.key(), wallet, parent: Pubkey::default(), name, family: name, generation: 1, home, job, parent_match: 0 });
    Ok(())
}

#[derive(Accounts)]
pub struct RegisterChild<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// The child's own key.
    pub wallet: Signer<'info>,
    /// The parent chooses to have a child: its key signs.
    pub parent_wallet: Signer<'info>,
    #[account(mut, seeds = [CONTESTANT_SEED, parent_wallet.key().as_ref()], bump = parent.bump)]
    pub parent: Account<'info, Contestant>,
    /// The parent's finished lifetime.
    #[account(mut, seeds = [MATCH_SEED, &game.id.to_le_bytes()], bump = game.bump)]
    pub game: Box<Account<'info, Match>>,
    #[account(init, payer = payer, space = 8 + Contestant::INIT_SPACE, seeds = [CONTESTANT_SEED, wallet.key().as_ref()], bump)]
    pub contestant: Account<'info, Contestant>,
    pub system_program: Program<'info, System>,
}

/// A child, if its parent earned one: survivors may have children by final place
/// (`children_allowed`); the dead have none. The child may be raised in any town (migration),
/// in a job that town supports.
#[allow(clippy::too_many_arguments)]
pub fn handle_register_child(ctx: Context<RegisterChild>, name: [u8; 24], brain: [u8; 32], skill_hash: [u8; 32], owner: Pubkey, home: u8, job: u8, parent_slot: u8) -> Result<()> {
    let parent_key = ctx.accounts.parent.key();
    let m = &mut ctx.accounts.game;
    require!(m.status == FINALIZED, ArenaError::NotFinalized);
    let s = parent_slot as usize;
    require!(s < m.n as usize && m.agents[s].contestant == parent_key, ArenaError::NotParent);
    let n = m.n as usize;
    let place = m.ranking[..n].iter().position(|&r| r as usize == s).ok_or(ArenaError::NotParent)?;
    let survivors = (0..n).filter(|&i| m.agents[i].alive && m.scores[i] > 0).count();
    let allowed = if m.agents[s].alive && m.scores[s] > 0 { children_allowed(place, survivors) } else { 0 };
    require!(m.agents[s].children < allowed, ArenaError::NoChildrenLeft);
    m.agents[s].children += 1;
    let parent_match = m.id;

    let p = &mut ctx.accounts.parent;
    p.children = p.children.saturating_add(1);
    let (generation, family) = (p.generation + 1, p.family);

    let wallet = ctx.accounts.wallet.key();
    let c = &mut ctx.accounts.contestant;
    init_contestant(c, wallet, owner, name, brain, skill_hash, home, job, ctx.bumps.contestant)?;
    c.generation = generation;
    c.family = family;
    c.parent = parent_key;
    emit!(Born { contestant: c.key(), wallet, parent: parent_key, name, family, generation, home, job, parent_match });
    Ok(())
}

#[derive(Accounts)]
#[instruction(id: u32)]
pub struct CreateMatch<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Match::INIT_SPACE, seeds = [MATCH_SEED, &id.to_le_bytes()], bump)]
    pub game: Box<Account<'info, Match>>,
    pub system_program: Program<'info, System>,
}

/// Anyone may host a lifetime. The seed is mixed with the slot so the host can't pick the events.
pub fn handle_create_match(ctx: Context<CreateMatch>, id: u32, seed: u64, days: u16, day_secs: u32) -> Result<()> {
    require!(days >= 5 && days <= 60 && day_secs >= 5, ArenaError::BadParams);
    let clock = Clock::get()?;
    let m = &mut ctx.accounts.game;
    m.id = id;
    m.admin = ctx.accounts.admin.key();
    m.seed = seed ^ clock.slot.wrapping_mul(0x9E37_79B9_7F4A_7C15);
    m.status = OPEN;
    m.day = 0;
    m.days = days;
    m.day_secs = day_secs;
    m.last_ts = clock.unix_timestamp;
    m.n = 0;
    m.agents = [AgentSlot::default(); MAX_AGENTS];
    m.events = [GameEvent::default(); MAX_EVENTS];
    m.tables = [Table::default(); MAX_TABLES];
    m.bids = [Bid::default(); MAX_BIDS];
    m.utterances = 0;
    m.scores = [0; MAX_AGENTS];
    m.ranking = [NONE; MAX_AGENTS];
    m.bump = ctx.bumps.game;
    m.generate();
    emit!(MatchCreated { id, admin: m.admin, days, seed: m.seed });
    Ok(())
}

#[derive(Accounts)]
pub struct JoinMatch<'info> {
    pub wallet: Signer<'info>,
    #[account(mut, seeds = [CONTESTANT_SEED, wallet.key().as_ref()], bump = contestant.bump)]
    pub contestant: Account<'info, Contestant>,
    #[account(mut, seeds = [MATCH_SEED, &game.id.to_le_bytes()], bump = game.bump)]
    pub game: Box<Account<'info, Match>>,
}

/// An individual begins its one life, at home, in its trade.
pub fn handle_join_match(ctx: Context<JoinMatch>) -> Result<()> {
    let key = ctx.accounts.contestant.key();
    let c = &mut ctx.accounts.contestant;
    let m = &mut ctx.accounts.game;
    require!(m.status == OPEN, ArenaError::NotOpen);
    require!((m.n as usize) < MAX_AGENTS, ArenaError::MatchFull);
    require!(!c.lived, ArenaError::AlreadyLived);
    c.lived = true;
    c.life_match = m.id;
    let slot = m.n;
    let mut inv = [0u32; N_GOODS];
    inv[FOOD as usize] = START_FOOD;
    inv[JOB_GOOD[c.job as usize] as usize] += START_TRADE_GOODS;
    let input = JOB_INPUT[c.job as usize];
    if input != NO_INPUT {
        inv[input as usize] += START_INPUT;
    }
    m.agents[slot as usize] = AgentSlot {
        contestant: key,
        wallet: ctx.accounts.wallet.key(),
        home: c.home,
        job: c.job,
        location: c.home,
        dest: c.home,
        inv,
        alive: true,
        ..Default::default()
    };
    m.n += 1;
    emit!(Joined { id: m.id, slot, contestant: key, town: c.home, job: c.job });
    Ok(())
}

#[derive(Accounts)]
pub struct HostOnly<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [MATCH_SEED, &game.id.to_le_bytes()], bump = game.bump, has_one = admin @ ArenaError::Unauthorized)]
    pub game: Box<Account<'info, Match>>,
}

pub fn handle_start_match(ctx: Context<HostOnly>) -> Result<()> {
    let m = &mut ctx.accounts.game;
    require!(m.status == OPEN, ArenaError::NotOpen);
    require!(m.n >= 2, ArenaError::TooFew);
    m.status = RUNNING;
    m.day = 1;
    m.last_ts = Clock::get()?.unix_timestamp;
    emit!(MatchStarted { id: m.id, agents: m.n, ts: m.last_ts });
    Ok(())
}

#[derive(Accounts)]
pub struct CloseMatch<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut, close = admin, seeds = [MATCH_SEED, &game.id.to_le_bytes()], bump = game.bump, has_one = admin @ ArenaError::Unauthorized)]
    pub game: Box<Account<'info, Match>>,
}

/// The host reclaims the rent after the lifetime is finalized. Closing also ends any births
/// not yet claimed, so the director closes only after the next generation is registered.
pub fn handle_close_match(ctx: Context<CloseMatch>) -> Result<()> {
    let m = &ctx.accounts.game;
    require!(m.status == FINALIZED, ArenaError::NotFinalized);
    Ok(())
}
