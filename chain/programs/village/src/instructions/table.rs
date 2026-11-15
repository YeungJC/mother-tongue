//! The trading table: the only way to get what you don't make. What you GIVE is put down where
//! everyone can see it; what you WANT is never written anywhere: you have to say it, in words
//! nobody taught you. Bidders answer with goods of their own; the maker accepts one or rejects
//! them all. Every step carries words, and every step is public.

use anchor_lang::prelude::*;

use crate::{constants::*, error::ArenaError, events::*, state::*};
use super::play::Act;

fn next_seq(m: &mut Match) -> u32 {
    m.utterances = m.utterances.wrapping_add(1);
    m.utterances
}

/// Put goods on the table and speak. `intent` = SHA-256(want_kind, want_qty, salt), revealed
/// after the lifetime so anyone can check what the maker really meant.
pub fn handle_show(ctx: Context<Act>, slot: u8, give_kind: u8, give_qty: u32, intent: [u8; 32], words: String) -> Result<()> {
    check_words(&words)?;
    let w = ctx.accounts.wallet.key();
    let m = &mut ctx.accounts.game;
    let i = m.present(slot, &w)?;
    require!(give_qty > 0, ArenaError::ZeroQty);
    require!(!m.tables.iter().any(|t| t.maker == slot), ArenaError::TableOpen);
    let k = m.tables.iter().position(|t| t.maker == NONE).ok_or(ArenaError::NoSlot)?;
    m.agents[i].take(give_kind, give_qty)?;
    let town = m.agents[i].location;
    m.tables[k] = Table { maker: slot, town, give_kind, give_qty, opened_day: m.day, rejects: 0 };
    m.agents[i].tables = m.agents[i].tables.saturating_add(1);
    let seq = next_seq(m);
    emit!(Shown { id: m.id, day: m.day, seq, table: k as u8, maker: slot, town, give_kind, give_qty, intent, words });
    Ok(())
}

/// Answer a table with goods of your own (escrowed), and speak.
pub fn handle_bid(ctx: Context<Act>, slot: u8, table: u8, kind: u8, qty: u32, words: String) -> Result<()> {
    check_words(&words)?;
    let w = ctx.accounts.wallet.key();
    let m = &mut ctx.accounts.game;
    let i = m.present(slot, &w)?;
    let k = table as usize;
    require!(k < MAX_TABLES && m.tables[k].maker != NONE && m.tables[k].maker != slot, ArenaError::BadTable);
    let t = m.tables[k];
    require!(m.agents[i].location == t.town, ArenaError::WrongPlace);
    require!(qty > 0, ArenaError::ZeroQty);
    require!(kind != t.give_kind, ArenaError::BadBid);
    require!(!m.bids.iter().any(|b| b.table == table && b.bidder == slot), ArenaError::AlreadyBid);
    let b = m.bids.iter().position(|b| b.table == NONE).ok_or(ArenaError::NoSlot)?;
    m.agents[i].take(kind, qty)?;
    m.bids[b] = Bid { table, bidder: slot, kind, qty };
    let seq = next_seq(m);
    emit!(BidPlaced { id: m.id, day: m.day, seq, table, bid: b as u8, bidder: slot, town: t.town, kind, qty, words });
    Ok(())
}

/// The maker takes one bid: the goods swap, every other bid goes back, the table closes.
pub fn handle_accept(ctx: Context<Act>, slot: u8, table: u8, bid: u8, words: String) -> Result<()> {
    check_words(&words)?;
    let w = ctx.accounts.wallet.key();
    let m = &mut ctx.accounts.game;
    let i = m.slot_of(slot, &w)?;
    let k = table as usize;
    require!(k < MAX_TABLES && m.tables[k].maker == slot, ArenaError::BadTable);
    let bi = bid as usize;
    require!(bi < MAX_BIDS && m.bids[bi].table == table, ArenaError::BadBid);
    let t = m.tables[k];
    let b = m.bids[bi];
    let who = b.bidder as usize;
    m.bids[bi] = Bid::default();
    m.agents[i].give(b.kind, b.qty)?;
    m.agents[who].give(t.give_kind, t.give_qty)?;
    m.agents[i].trades = m.agents[i].trades.saturating_add(1);
    m.agents[who].trades = m.agents[who].trades.saturating_add(1);
    m.return_bids(k)?;
    m.tables[k] = Table::default();
    let seq = next_seq(m);
    emit!(Accepted { id: m.id, day: m.day, seq, table, maker: slot, bidder: b.bidder, town: t.town, give_kind: t.give_kind, give_qty: t.give_qty, got_kind: b.kind, got_qty: b.qty, words });
    Ok(())
}

/// The maker turns down every bid (they go back to their bidders) and speaks. The table stays
/// open: bidders may try again.
pub fn handle_reject(ctx: Context<Act>, slot: u8, table: u8, words: String) -> Result<()> {
    check_words(&words)?;
    let w = ctx.accounts.wallet.key();
    let m = &mut ctx.accounts.game;
    m.slot_of(slot, &w)?;
    let k = table as usize;
    require!(k < MAX_TABLES && m.tables[k].maker == slot, ArenaError::BadTable);
    let n = m.return_bids(k)?;
    m.tables[k].rejects = m.tables[k].rejects.saturating_add(1);
    let town = m.tables[k].town;
    let seq = next_seq(m);
    emit!(Rejected { id: m.id, day: m.day, seq, table, maker: slot, town, bids: n, words });
    Ok(())
}

/// The maker takes its goods back; any bids go back too.
pub fn handle_close_table(ctx: Context<Act>, slot: u8, table: u8) -> Result<()> {
    let w = ctx.accounts.wallet.key();
    let m = &mut ctx.accounts.game;
    m.slot_of(slot, &w)?;
    let k = table as usize;
    require!(k < MAX_TABLES && m.tables[k].maker == slot, ArenaError::BadTable);
    m.close_table(k)?;
    emit!(TableClosed { id: m.id, table, maker: slot });
    Ok(())
}

/// Words without a trade.
pub fn handle_say(ctx: Context<Act>, slot: u8, words: String) -> Result<()> {
    check_words(&words)?;
    let w = ctx.accounts.wallet.key();
    let m = &mut ctx.accounts.game;
    let i = m.present(slot, &w)?;
    let town = m.agents[i].location;
    let seq = next_seq(m);
    emit!(Said { id: m.id, day: m.day, seq, slot, town, words });
    Ok(())
}
