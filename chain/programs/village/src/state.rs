use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ArenaError;

/// One individual: born once (a founder, or the child of a parent who earned it), lives one
/// match, and may then have children. The family tree is these accounts.
#[account]
#[derive(InitSpace)]
pub struct Contestant {
    /// Signs this individual's actions.
    pub wallet: Pubkey,
    /// Who runs it. Default = ours.
    pub owner: Pubkey,
    pub name: [u8; 24],
    /// Model and strategy, e.g. "gemma · trader".
    pub brain: [u8; 32],
    /// SHA-256 of the strategy it plays.
    pub skill_hash: [u8; 32],
    /// Parent contestant PDA; default for a founder.
    pub parent: Pubkey,
    /// The founder's name, passed down.
    pub family: [u8; 24],
    /// Founders are generation 1.
    pub generation: u16,
    pub home: u8,
    pub job: u8,
    /// Has taken its one lifetime.
    pub lived: bool,
    pub life_match: u32,
    pub score: i64,
    /// Final place in its lifetime (NONE until finalized).
    pub place: u8,
    pub survived: bool,
    pub trades: u16,
    pub children: u16,
    pub born_ts: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Default, Debug)]
pub struct AgentSlot {
    /// Contestant PDA.
    pub contestant: Pubkey,
    pub wallet: Pubkey,
    pub home: u8,
    pub job: u8,
    pub location: u8,
    pub dest: u8,
    /// While `arrive_day > day` the agent is on the road.
    pub arrive_day: u16,
    pub inv: [u32; N_GOODS],
    pub hunger: u8,
    pub alive: bool,
    /// Day the main action was used.
    pub acted_day: u16,
    pub trades: u16,
    pub tables: u16,
    pub builds: u8,
    pub eliminated_day: u16,
    /// Children born so far (after the match is finalized).
    pub children: u8,
}

impl AgentSlot {
    pub fn travelling(&self, day: u16) -> bool {
        self.arrive_day > day
    }
    pub fn take(&mut self, kind: u8, qty: u32) -> Result<()> {
        let k = kind as usize;
        require!(k < N_GOODS, ArenaError::BadAsset);
        require!(self.inv[k] >= qty, ArenaError::Insufficient);
        self.inv[k] -= qty;
        Ok(())
    }
    pub fn give(&mut self, kind: u8, qty: u32) -> Result<()> {
        let k = kind as usize;
        require!(k < N_GOODS, ArenaError::BadAsset);
        self.inv[k] = self.inv[k].checked_add(qty).ok_or(ArenaError::Overflow)?;
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Debug)]
pub struct Plot {
    pub owner: u8,
    pub kind: u8,
}
impl Default for Plot {
    fn default() -> Self {
        Plot { owner: NONE, kind: EMPTY }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Debug)]
pub struct GameEvent {
    pub kind: u8,
    /// NONE = everywhere.
    pub town: u8,
    pub start: u16,
    pub len: u8,
}
impl Default for GameEvent {
    fn default() -> Self {
        GameEvent { kind: 0, town: NONE, start: u16::MAX, len: 0 }
    }
}
impl GameEvent {
    pub fn active(&self, day: u16) -> bool {
        self.start != u16::MAX && day >= self.start && day < self.start.saturating_add(self.len as u16)
    }
}

/// Goods put on the table. What the maker wants back is NOT stored anywhere: it has to be said.
/// `maker == NONE` = empty.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Debug)]
pub struct Table {
    pub maker: u8,
    pub town: u8,
    pub give_kind: u8,
    pub give_qty: u32,
    pub opened_day: u16,
    pub rejects: u8,
}
impl Default for Table {
    fn default() -> Self {
        Table { maker: NONE, town: 0, give_kind: 0, give_qty: 0, opened_day: 0, rejects: 0 }
    }
}

/// Goods put down in answer to a table. `table == NONE` = empty.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Debug)]
pub struct Bid {
    pub table: u8,
    pub bidder: u8,
    pub kind: u8,
    pub qty: u32,
}
impl Default for Bid {
    fn default() -> Self {
        Bid { table: NONE, bidder: NONE, kind: 0, qty: 0 }
    }
}

/// One lifetime: a whole match in one account.
#[account]
#[derive(InitSpace)]
pub struct Match {
    pub id: u32,
    pub admin: Pubkey,
    pub seed: u64,
    pub status: u8,
    pub day: u16,
    pub days: u16,
    /// A day may also end early, once every living agent has acted.
    pub day_secs: u32,
    pub last_ts: i64,
    pub n: u8,
    pub agents: [AgentSlot; MAX_AGENTS],
    pub plots: [[Plot; PLOTS]; N_TOWNS],
    pub events: [GameEvent; MAX_EVENTS],
    pub tables: [Table; MAX_TABLES],
    pub bids: [Bid; MAX_BIDS],
    /// Messages so far (every show, bid, accept, reject and say).
    pub utterances: u32,
    pub scores: [i64; MAX_AGENTS],
    /// Agent slot per place (NONE past `n`).
    pub ranking: [u8; MAX_AGENTS],
    pub bump: u8,
}

/// Deterministic randomness from the match seed (xorshift64*).
pub struct Rng(pub u64);
impl Rng {
    pub fn next(&mut self) -> u64 {
        let mut x = self.0.max(1);
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
    pub fn below(&mut self, n: u64) -> u64 {
        self.next() % n.max(1)
    }
}

/// Messages are lowercase letters and single spaces: invented words, nothing else.
pub fn check_words(w: &str) -> Result<()> {
    require!(w.len() <= MAX_WORDS, ArenaError::BadWords);
    require!(w.bytes().all(|c| c.is_ascii_lowercase() || c == b' '), ArenaError::BadWords);
    Ok(())
}

/// Children a survivor may have, by final place among `survivors` (who hold the top places: the
/// dead score 0). Eight or more survivors: CHILDREN_BY_PLACE. Fewer: one each, and the spare
/// seats go to the best three, so the island is back to MAX_AGENTS while the best still have most.
pub fn children_allowed(place: usize, survivors: usize) -> u8 {
    if place >= survivors {
        return 0;
    }
    if survivors >= 8 {
        return CHILDREN_BY_PLACE[place];
    }
    let spare = MAX_AGENTS - survivors;
    let top = survivors.min(3);
    let extra = if place < top { spare / top + usize::from(place < spare % top) } else { 0 };
    (1 + extra) as u8
}

/// Standing within your trade: wealth relative to the mean wealth of the living agents with the
/// same job, ×1000 (an agent alone in its trade scores 1000). Children go by this, not by raw
/// wealth, so a carpenter isn't favoured just for being a carpenter: what separates agents within a
/// trade is mostly how well they traded, and so how well they were understood. The dead, and the
/// living with nothing, stand at 0, so survivors still hold the top places.
pub fn standing(scores: &[i64], jobs: &[u8], alive: &[bool]) -> Vec<i64> {
    let n = scores.len();
    (0..n)
        .map(|i| {
            if !alive[i] || scores[i] <= 0 {
                return 0;
            }
            let (mut sum, mut cnt) = (0i64, 0i64);
            for j in 0..n {
                if alive[j] && jobs[j] == jobs[i] {
                    sum += scores[j].max(0);
                    cnt += 1;
                }
            }
            scores[i] * 1000 * cnt / sum
        })
        .collect()
}

/// Places, best first: by standing within trade, then raw wealth, then slot.
pub fn rank_by_standing(scores: &[i64], jobs: &[u8], alive: &[bool]) -> Vec<usize> {
    let st = standing(scores, jobs, alive);
    let mut order: Vec<usize> = (0..scores.len()).collect();
    order.sort_by(|&a, &b| st[b].cmp(&st[a]).then(scores[b].cmp(&scores[a])).then(a.cmp(&b)));
    order
}

pub fn job_allowed(town: u8, job: u8) -> bool {
    (town as usize) < N_TOWNS && (job as usize) < N_JOBS && TOWN_JOBS[town as usize] & (1 << job) != 0
}

impl Match {
    /// Events for the lifetime, from the seed: three, each three days long, except frost (two:
    /// cold on top of hunger kills, but a frost alone can't kill a fed agent).
    pub fn generate(&mut self) {
        self.plots = [[Plot::default(); PLOTS]; N_TOWNS];
        let mut r = Rng(self.seed);
        let days = self.days.max(4);
        for i in 0..3usize {
            let start = 4 + (i as u16) * (days.saturating_sub(7).max(3) / 3) + r.below(2) as u16;
            let kind = r.below(4) as u8;
            let town = if kind == BOOM { r.below(N_TOWNS as u64) as u8 } else { NONE };
            let len = if kind == FROST { 2 } else { 3 };
            self.events[i] = GameEvent { kind, town, start, len };
        }
    }

    pub fn event_on(&self, kind: u8, town: u8) -> bool {
        self.events.iter().any(|e| e.kind == kind && e.active(self.day) && (e.town == NONE || e.town == town))
    }

    /// Checks the signer owns a living agent in this running match, and returns its index.
    pub fn slot_of(&self, slot: u8, wallet: &Pubkey) -> Result<usize> {
        require!(self.status == RUNNING, ArenaError::NotRunning);
        let i = slot as usize;
        require!(i < self.n as usize && self.agents[i].wallet == *wallet, ArenaError::NotYourSlot);
        require!(self.agents[i].alive, ArenaError::Eliminated);
        Ok(i)
    }

    /// As `slot_of`, and the agent is in town (not travelling).
    pub fn present(&self, slot: u8, wallet: &Pubkey) -> Result<usize> {
        let i = self.slot_of(slot, wallet)?;
        require!(!self.agents[i].travelling(self.day), ArenaError::Travelling);
        Ok(i)
    }

    /// As `present`, and today's main action is still unused.
    pub fn main_action(&mut self, slot: u8, wallet: &Pubkey) -> Result<usize> {
        let i = self.present(slot, wallet)?;
        require!(self.agents[i].acted_day != self.day, ArenaError::AlreadyActed);
        self.agents[i].acted_day = self.day;
        Ok(i)
    }

    /// Output of a day's work at home: the job's good, +2 with a tool-use, +3 with a workshop.
    /// A craft uses up one of its input (JOB_INPUT); without it the day yields nothing.
    pub fn work_yield(&mut self, i: usize) -> (u8, u32) {
        let t = self.agents[i].location;
        let job = self.agents[i].job as usize;
        let kind = JOB_GOOD[job];
        let input = JOB_INPUT[job];
        if input != NO_INPUT {
            if self.agents[i].inv[input as usize] == 0 {
                return (kind, 0);
            }
            self.agents[i].inv[input as usize] -= 1;
        }
        let mut q = JOB_YIELD[job];
        if self.agents[i].inv[TOOLS as usize] > 0 && kind != TOOLS {
            self.agents[i].inv[TOOLS as usize] -= 1;
            q += 2;
        }
        if self.plots[t as usize].iter().any(|p| p.kind == WORKSHOP && p.owner as usize == i) {
            q += 3;
        }
        if kind == FOOD && self.event_on(DROUGHT, t) {
            q /= 2;
        }
        if self.event_on(BOOM, t) {
            q *= 2;
        }
        (kind, q)
    }

    /// Returns every bid on table `k` to its bidder. Returns how many there were.
    pub fn return_bids(&mut self, k: usize) -> Result<u8> {
        let mut n = 0u8;
        for b in 0..MAX_BIDS {
            let bid = self.bids[b];
            if bid.table as usize == k {
                let who = bid.bidder as usize;
                if self.agents[who].alive {
                    self.agents[who].give(bid.kind, bid.qty)?;
                }
                self.bids[b] = Bid::default();
                n += 1;
            }
        }
        Ok(n)
    }

    /// Closes table `k`: goods back to the maker, bids back to the bidders.
    pub fn close_table(&mut self, k: usize) -> Result<()> {
        let t = self.tables[k];
        if t.maker == NONE {
            return Ok(());
        }
        self.return_bids(k)?;
        let mk = t.maker as usize;
        if self.agents[mk].alive {
            self.agents[mk].give(t.give_kind, t.give_qty)?;
        }
        self.tables[k] = Table::default();
        Ok(())
    }

    /// Final score: goods at fixed values plus buildings. The dead score 0.
    pub fn score(&self, i: usize) -> i64 {
        let a = &self.agents[i];
        if !a.alive {
            return 0;
        }
        let mut s: i64 = 0;
        for g in 0..N_GOODS {
            s += a.inv[g] as i64 * VALUES[g] as i64;
        }
        for t in &self.plots {
            for p in t {
                if p.owner as usize == i {
                    s += BUILDING_VALUE[p.kind as usize] as i64;
                }
            }
        }
        s
    }
}

pub fn build_cost(kind: u8) -> Option<[u32; N_GOODS]> {
    match kind {
        WORKSHOP => Some([0, 0, 0, 2, 4]),
        MANOR => Some([0, 0, 6, 6, 8]),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn words_are_letters_and_spaces() {
        assert!(check_words("tavo kel rii").is_ok());
        assert!(check_words("").is_ok());
        assert!(check_words("Tavo").is_err());
        assert!(check_words("give me 3 fish").is_err());
        assert!(check_words(&"a".repeat(MAX_WORDS + 1)).is_err());
    }

    #[test]
    fn children_refill_the_island() {
        for survivors in 1..=MAX_AGENTS {
            let total: u32 = (0..MAX_AGENTS).map(|p| children_allowed(p, survivors) as u32).sum();
            assert_eq!(total, MAX_AGENTS as u32, "{survivors} survivors");
            for p in 1..survivors {
                assert!(children_allowed(p, survivors) <= children_allowed(p - 1, survivors), "better place, more children");
            }
            assert_eq!(children_allowed(survivors, survivors), 0, "the dead have none");
        }
        assert_eq!(children_allowed(0, 12), 3);
        assert_eq!((0..7).map(|p| children_allowed(p, 7)).collect::<Vec<_>>(), vec![3, 3, 2, 1, 1, 1, 1]);
    }

    #[test]
    fn children_go_by_standing_within_trade() {
        // A rich carpenter among richer carpenters vs. a modest farmer who beat the other farmers.
        let scores = [90, 120, 20, 10, 0, 30];
        let jobs = [CARPENTER, CARPENTER, FARMER, FARMER, FARMER, SMITH];
        let alive = [true, true, true, true, false, true];
        let st = standing(&scores, &jobs, &alive);
        assert_eq!(st, vec![857, 1142, 1333, 666, 0, 1000]);
        // The farmer (slot 2) ranks above both carpenters; the smith, alone in her trade, at 1000.
        assert_eq!(rank_by_standing(&scores, &jobs, &alive), vec![2, 1, 5, 0, 3, 4]);
        // Survivors with something hold the top places, the dead come last.
        let poor = [0, 50, 0];
        let order = rank_by_standing(&poor, &[FARMER, FARMER, SMITH], &[true, true, false]);
        assert_eq!(order, vec![1, 0, 2]);
        // Equal standing: the wealthier first.
        assert_eq!(rank_by_standing(&[10, 40], &[FARMER, SMITH], &[true, true]), vec![1, 0]);
    }

    #[test]
    fn jobs_by_town() {
        assert!(job_allowed(SALTMERE, FARMER));
        assert!(job_allowed(IRONCRAG, MINER));
        assert!(!job_allowed(SALTMERE, MINER), "ore is only mined in Ironcrag");
        assert!(!job_allowed(9, FARMER));
    }
}
