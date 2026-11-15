//! An agent's day: one main action (work, build, travel or rest). Trading at the table is free
//! (instructions/table.rs).

use anchor_lang::prelude::*;

use crate::{constants::*, error::ArenaError, events::*, state::*};

#[derive(Accounts)]
pub struct Act<'info> {
    pub wallet: Signer<'info>,
    #[account(mut, seeds = [MATCH_SEED, &game.id.to_le_bytes()], bump = game.bump)]
    pub game: Box<Account<'info, Match>>,
}

/// Work at your trade. Only at home: a farmer abroad is just a traveller.
pub fn handle_work(ctx: Context<Act>, slot: u8, memo: [u8; 32]) -> Result<()> {
    let w = ctx.accounts.wallet.key();
    let m = &mut ctx.accounts.game;
    let i = m.main_action(slot, &w)?;
    require!(m.agents[i].location == m.agents[i].home, ArenaError::WrongPlace);
    let (kind, qty) = m.work_yield(i);
    m.agents[i].give(kind, qty)?;
    emit!(Worked { id: m.id, slot, day: m.day, town: m.agents[i].location, kind, qty, memo });
    Ok(())
}

pub fn handle_build(ctx: Context<Act>, slot: u8, plot: u8, kind: u8, memo: [u8; 32]) -> Result<()> {
    let w = ctx.accounts.wallet.key();
    let m = &mut ctx.accounts.game;
    let i = m.main_action(slot, &w)?;
    let cost = build_cost(kind).ok_or(ArenaError::BadBuild)?;
    let t = m.agents[i].location as usize;
    require!((plot as usize) < PLOTS, ArenaError::BadBuild);
    require!(m.plots[t][plot as usize].kind == EMPTY, ArenaError::PlotTaken);
    for (k, c) in cost.iter().enumerate() {
        m.agents[i].take(k as u8, *c)?;
    }
    m.plots[t][plot as usize] = Plot { owner: slot, kind };
    m.agents[i].builds += 1;
    emit!(Built { id: m.id, slot, day: m.day, town: t as u8, plot, kind, memo });
    Ok(())
}

pub fn handle_travel(ctx: Context<Act>, slot: u8, dest: u8, memo: [u8; 32]) -> Result<()> {
    let w = ctx.accounts.wallet.key();
    let m = &mut ctx.accounts.game;
    let i = m.main_action(slot, &w)?;
    let from = m.agents[i].location;
    require!((dest as usize) < N_TOWNS && dest != from, ArenaError::BadTravel);
    // Can't leave with goods still on a table or under a bid.
    require!(!m.tables.iter().any(|t| t.maker as usize == i) && !m.bids.iter().any(|b| b.table != NONE && b.bidder as usize == i), ArenaError::TableOpen);
    let storm = m.event_on(STORM, NONE) as u16;
    let arrive_day = m.day + TRAVEL[from as usize][dest as usize] as u16 + storm;
    let day = m.day;
    let a = &mut m.agents[i];
    a.dest = dest;
    a.arrive_day = arrive_day;
    emit!(Departed { id: m.id, slot, day, from, to: dest, arrive_day, memo });
    Ok(())
}

/// Ends the agent's day without a main action (lets the day end early).
pub fn handle_rest(ctx: Context<Act>, slot: u8) -> Result<()> {
    let w = ctx.accounts.wallet.key();
    let m = &mut ctx.accounts.game;
    let i = m.slot_of(slot, &w)?;
    m.agents[i].acted_day = m.day;
    emit!(Rested { id: m.id, slot, day: m.day });
    Ok(())
}
