use anchor_lang::prelude::*;

/// A new individual: a founder (parent = default) or a child.
#[event]
pub struct Born {
    pub contestant: Pubkey,
    pub wallet: Pubkey,
    pub parent: Pubkey,
    pub name: [u8; 24],
    pub family: [u8; 24],
    pub generation: u16,
    pub home: u8,
    pub job: u8,
    /// The match the parent lived in (0 for founders).
    pub parent_match: u32,
}

#[event]
pub struct MatchCreated {
    pub id: u32,
    pub admin: Pubkey,
    pub days: u16,
    pub seed: u64,
}

#[event]
pub struct Joined {
    pub id: u32,
    pub slot: u8,
    pub contestant: Pubkey,
    pub town: u8,
    pub job: u8,
}

#[event]
pub struct MatchStarted {
    pub id: u32,
    pub agents: u8,
    pub ts: i64,
}

#[event]
pub struct DayEnded {
    pub id: u32,
    pub day: u16,
    pub alive: u8,
    pub early: bool,
}

#[event]
pub struct Worked {
    pub id: u32,
    pub slot: u8,
    pub day: u16,
    pub town: u8,
    pub kind: u8,
    pub qty: u32,
    pub memo: [u8; 32],
}

#[event]
pub struct Built {
    pub id: u32,
    pub slot: u8,
    pub day: u16,
    pub town: u8,
    pub plot: u8,
    pub kind: u8,
    pub memo: [u8; 32],
}

#[event]
pub struct Departed {
    pub id: u32,
    pub slot: u8,
    pub day: u16,
    pub from: u8,
    pub to: u8,
    pub arrive_day: u16,
    pub memo: [u8; 32],
}

#[event]
pub struct Rested {
    pub id: u32,
    pub slot: u8,
    pub day: u16,
}

/// Goods on the table, and words meant to say what the maker wants back. `intent` is
/// SHA-256(want_kind, want_qty, salt): what it really meant, revealed after its lifetime.
#[event]
pub struct Shown {
    pub id: u32,
    pub day: u16,
    pub seq: u32,
    pub table: u8,
    pub maker: u8,
    pub town: u8,
    pub give_kind: u8,
    pub give_qty: u32,
    pub intent: [u8; 32],
    pub words: String,
}

#[event]
pub struct BidPlaced {
    pub id: u32,
    pub day: u16,
    pub seq: u32,
    pub table: u8,
    pub bid: u8,
    pub bidder: u8,
    pub town: u8,
    pub kind: u8,
    pub qty: u32,
    pub words: String,
}

#[event]
pub struct Accepted {
    pub id: u32,
    pub day: u16,
    pub seq: u32,
    pub table: u8,
    pub maker: u8,
    pub bidder: u8,
    pub town: u8,
    pub give_kind: u8,
    pub give_qty: u32,
    pub got_kind: u8,
    pub got_qty: u32,
    pub words: String,
}

#[event]
pub struct Rejected {
    pub id: u32,
    pub day: u16,
    pub seq: u32,
    pub table: u8,
    pub maker: u8,
    pub town: u8,
    pub bids: u8,
    pub words: String,
}

#[event]
pub struct TableClosed {
    pub id: u32,
    pub table: u8,
    pub maker: u8,
}

/// Words said without trading.
#[event]
pub struct Said {
    pub id: u32,
    pub day: u16,
    pub seq: u32,
    pub slot: u8,
    pub town: u8,
    pub words: String,
}

#[event]
pub struct Eliminated {
    pub id: u32,
    pub slot: u8,
    pub day: u16,
}

#[event]
pub struct MatchFinalized {
    pub id: u32,
    pub scores: [i64; 12],
    pub ranking: [u8; 12],
}
