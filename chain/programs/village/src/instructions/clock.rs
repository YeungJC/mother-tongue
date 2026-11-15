//! The clock and the end of a lifetime. Both cranks are permissionless.

use anchor_lang::prelude::*;

use crate::{constants::*, error::ArenaError, events::*, state::*};

#[derive(Accounts)]
pub struct AdvanceDay<'info> {
    #[account(mut, seeds = [MATCH_SEED, &game.id.to_le_bytes()], bump = game.bump)]
    pub game: Box<Account<'info, Match>>,
}

/// Ends the day once every living agent has acted (or is on the road), or after `day_secs`.
/// Then: tables close (goods go back), arrivals, eating (and burning wood in a frost), hunger
/// and death.
pub fn handle_advance_day(ctx: Context<AdvanceDay>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let m = &mut ctx.accounts.game;
    require!(m.status == RUNNING, ArenaError::NotRunning);
    let day = m.day;
    let n = m.n as usize;
    let all_done = m.agents[..n].iter().all(|a| !a.alive || a.acted_day == day || a.travelling(day));
    let timed_out = now >= m.last_ts + m.day_secs as i64;
    require!(all_done || timed_out, ArenaError::TooEarly);

    // Markets are daily: whatever is still on a table goes home.
    for k in 0..MAX_TABLES {
        if m.tables[k].maker != NONE {
            let maker = m.tables[k].maker;
            m.close_table(k)?;
            emit!(TableClosed { id: m.id, table: k as u8, maker });
        }
    }
    let next = day + 1;
    let frost = m.event_on(FROST, NONE);
    for i in 0..n {
        let a = &mut m.agents[i];
        if !a.alive {
            continue;
        }
        if a.arrive_day > 0 && a.arrive_day <= next && a.location != a.dest {
            a.location = a.dest;
        }
        let mut hungry = false;
        if a.inv[FOOD as usize] > 0 {
            a.inv[FOOD as usize] -= 1;
        } else {
            hungry = true;
        }
        if frost {
            if a.inv[WOOD as usize] > 0 {
                a.inv[WOOD as usize] -= 1;
            } else {
                hungry = true;
            }
        }
        a.hunger = if hungry { a.hunger + 1 } else { 0 };
        if a.hunger >= HUNGER_LIMIT {
            a.alive = false;
            a.eliminated_day = day;
            a.inv = [0; N_GOODS];
            emit!(Eliminated { id: m.id, slot: i as u8, day });
        }
    }
    m.day = next;
    m.last_ts = now;
    let alive = m.agents[..n].iter().filter(|a| a.alive).count() as u8;
    if next > m.days || alive == 0 {
        m.status = ENDED;
    }
    emit!(DayEnded { id: m.id, day, alive, early: all_done && !timed_out });
    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeMatch<'info> {
    #[account(mut, seeds = [MATCH_SEED, &game.id.to_le_bytes()], bump = game.bump)]
    pub game: Box<Account<'info, Match>>,
}

/// Permissionless once the lifetime has ended. `remaining_accounts`: every agent's Contestant
/// account (writable), in slot order. Fixes scores (wealth) and places (standing within trade), which
/// decide who may have children.
pub fn handle_finalize_match<'info>(ctx: Context<'info, FinalizeMatch<'info>>) -> Result<()> {
    let m = &mut ctx.accounts.game;
    require!(m.status == ENDED, ArenaError::NotEnded);
    let n = m.n as usize;
    let rem = ctx.remaining_accounts;
    require!(rem.len() == n, ArenaError::BadContestants);

    for i in 0..n {
        m.scores[i] = m.score(i);
    }
    // Scores stay wealth (for display); places go by standing within each trade (state.rs), so
    // children reward beating your peers, not picking a lucrative job.
    let jobs: Vec<u8> = m.agents[..n].iter().map(|a| a.job).collect();
    let alive: Vec<bool> = m.agents[..n].iter().map(|a| a.alive).collect();
    let order = rank_by_standing(&m.scores[..n], &jobs, &alive);
    for (place, &i) in order.iter().enumerate() {
        m.ranking[place] = i as u8;
    }
    for (i, info) in rem.iter().enumerate() {
        require!(info.key() == m.agents[i].contestant && info.is_writable, ArenaError::BadContestants);
        let mut c: Account<Contestant> = Account::try_from(info)?;
        let a = m.agents[i];
        c.score = m.scores[i];
        c.place = order.iter().position(|&o| o == i).unwrap_or(n) as u8;
        c.survived = a.alive;
        c.trades = a.trades;
        c.exit(&crate::ID)?;
    }
    m.status = FINALIZED;
    emit!(MatchFinalized { id: m.id, scores: m.scores, ranking: m.ranking });
    Ok(())
}
