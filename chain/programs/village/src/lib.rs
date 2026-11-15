//! Mother Tongue: AI agents born speaking nothing, on a small island where the only way to get
//! what you lack is to make yourself understood. Rules: LANGUAGE.md. One `Match` account is one
//! lifetime; `Contestant` accounts are individuals, and their `parent` links are the family tree.

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("GzNn1p3Vc5wg1KVY4aEWWnxXBj6qKD823sr5nNhmmB9a");

#[program]
pub mod village {
    use super::*;

    // ---- births and lifetimes ----
    #[allow(clippy::too_many_arguments)]
    pub fn register_founder(ctx: Context<RegisterFounder>, name: [u8; 24], brain: [u8; 32], skill_hash: [u8; 32], owner: Pubkey, home: u8, job: u8) -> Result<()> {
        crate::instructions::setup::handle_register_founder(ctx, name, brain, skill_hash, owner, home, job)
    }
    #[allow(clippy::too_many_arguments)]
    pub fn register_child(ctx: Context<RegisterChild>, name: [u8; 24], brain: [u8; 32], skill_hash: [u8; 32], owner: Pubkey, home: u8, job: u8, parent_slot: u8) -> Result<()> {
        crate::instructions::setup::handle_register_child(ctx, name, brain, skill_hash, owner, home, job, parent_slot)
    }
    pub fn create_match(ctx: Context<CreateMatch>, id: u32, seed: u64, days: u16, day_secs: u32) -> Result<()> {
        crate::instructions::setup::handle_create_match(ctx, id, seed, days, day_secs)
    }
    pub fn join_match(ctx: Context<JoinMatch>) -> Result<()> {
        crate::instructions::setup::handle_join_match(ctx)
    }
    pub fn start_match(ctx: Context<HostOnly>) -> Result<()> {
        crate::instructions::setup::handle_start_match(ctx)
    }
    pub fn close_match(ctx: Context<CloseMatch>) -> Result<()> {
        crate::instructions::setup::handle_close_match(ctx)
    }

    // ---- a day's main action ----
    pub fn work(ctx: Context<Act>, slot: u8, memo: [u8; 32]) -> Result<()> {
        crate::instructions::play::handle_work(ctx, slot, memo)
    }
    pub fn build(ctx: Context<Act>, slot: u8, plot: u8, kind: u8, memo: [u8; 32]) -> Result<()> {
        crate::instructions::play::handle_build(ctx, slot, plot, kind, memo)
    }
    pub fn travel(ctx: Context<Act>, slot: u8, dest: u8, memo: [u8; 32]) -> Result<()> {
        crate::instructions::play::handle_travel(ctx, slot, dest, memo)
    }
    pub fn rest(ctx: Context<Act>, slot: u8) -> Result<()> {
        crate::instructions::play::handle_rest(ctx, slot)
    }

    // ---- the table (free actions) ----
    pub fn show(ctx: Context<Act>, slot: u8, give_kind: u8, give_qty: u32, intent: [u8; 32], words: String) -> Result<()> {
        crate::instructions::table::handle_show(ctx, slot, give_kind, give_qty, intent, words)
    }
    pub fn bid(ctx: Context<Act>, slot: u8, table: u8, kind: u8, qty: u32, words: String) -> Result<()> {
        crate::instructions::table::handle_bid(ctx, slot, table, kind, qty, words)
    }
    pub fn accept(ctx: Context<Act>, slot: u8, table: u8, bid: u8, words: String) -> Result<()> {
        crate::instructions::table::handle_accept(ctx, slot, table, bid, words)
    }
    pub fn reject(ctx: Context<Act>, slot: u8, table: u8, words: String) -> Result<()> {
        crate::instructions::table::handle_reject(ctx, slot, table, words)
    }
    pub fn close_table(ctx: Context<Act>, slot: u8, table: u8) -> Result<()> {
        crate::instructions::table::handle_close_table(ctx, slot, table)
    }
    pub fn say(ctx: Context<Act>, slot: u8, words: String) -> Result<()> {
        crate::instructions::table::handle_say(ctx, slot, words)
    }

    // ---- clock and end of life (permissionless) ----
    pub fn advance_day(ctx: Context<AdvanceDay>) -> Result<()> {
        crate::instructions::clock::handle_advance_day(ctx)
    }
    pub fn finalize_match<'info>(ctx: Context<'info, FinalizeMatch<'info>>) -> Result<()> {
        crate::instructions::clock::handle_finalize_match(ctx)
    }
}
