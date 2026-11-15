// Mother Tongue: rules as constants. LANGUAGE.md explains them.

pub const MATCH_SEED: &[u8] = b"match";
pub const CONTESTANT_SEED: &[u8] = b"contestant";

pub const MAX_AGENTS: usize = 12;
pub const N_TOWNS: usize = 4;
/// Goods are the only assets: there is no money, everything is barter.
pub const N_GOODS: usize = 5;
pub const PLOTS: usize = 3;
pub const MAX_EVENTS: usize = 4;
/// One open table per agent at a time.
pub const MAX_TABLES: usize = MAX_AGENTS;
pub const MAX_BIDS: usize = 24;
/// Longest message, in bytes: lowercase letters and spaces only.
pub const MAX_WORDS: usize = 48;

pub const NONE: u8 = 255;

// ---- Goods ----
pub const FOOD: u8 = 0;
pub const WOOD: u8 = 1;
pub const ORE: u8 = 2;
/// Tool-uses: each work consumes one for +2 output.
pub const TOOLS: u8 = 3;
pub const PLANKS: u8 = 4;
/// Fixed values for the final score.
pub const VALUES: [u32; N_GOODS] = [2, 3, 4, 3, 9];

// ---- Towns ----
pub const WRENFORD: u8 = 0;
pub const OAKHOLLOW: u8 = 1;
pub const IRONCRAG: u8 = 2;
pub const SALTMERE: u8 = 3;
/// Days to travel between towns.
pub const TRAVEL: [[u8; N_TOWNS]; N_TOWNS] = [[0, 2, 2, 1], [2, 0, 3, 2], [2, 3, 0, 3], [1, 2, 3, 0]];

// ---- Jobs: what an agent makes when it works at home ----
pub const FARMER: u8 = 0;
pub const WOODCUTTER: u8 = 1;
pub const MINER: u8 = 2;
pub const SMITH: u8 = 3;
pub const CARPENTER: u8 = 4;
pub const N_JOBS: usize = 5;
pub const JOB_GOOD: [u8; N_JOBS] = [FOOD, WOOD, ORE, TOOLS, PLANKS];
pub const JOB_YIELD: [u32; N_JOBS] = [4, 3, 2, 2, 1];
/// What a day's work uses up (RESEARCH.md §9): a smith needs ore, a carpenter wood. Without it the
/// day produces nothing, so crafters depend on trade, and being understood can pay.
pub const NO_INPUT: u8 = 255;
#[cfg(not(feature = "no_crafts"))]
pub const JOB_INPUT: [u8; N_JOBS] = [NO_INPUT, NO_INPUT, NO_INPUT, ORE, WOOD];
/// `no_crafts`: the world before RESEARCH.md §9 (crafts from nothing), for the research worlds 0 and 6.
#[cfg(feature = "no_crafts")]
pub const JOB_INPUT: [u8; N_JOBS] = [NO_INPUT; N_JOBS];
/// Input a crafter starts its life with.
pub const START_INPUT: u32 = 2;
/// Jobs each town supports (bit per job). Ore is only mined in Ironcrag; planks are made in
/// Wrenford and Oakhollow; tools in Wrenford and Ironcrag.
#[cfg(feature = "balanced")]
pub const TOWN_JOBS: [u8; N_TOWNS] = [
    (1 << FARMER) | (1 << CARPENTER) | (1 << WOODCUTTER), // Wrenford: a wood town
    (1 << WOODCUTTER) | (1 << CARPENTER) | (1 << FARMER), // Oakhollow: a wood town
    (1 << MINER) | (1 << SMITH) | (1 << FARMER),          // Ironcrag: an ore town
    (1 << MINER) | (1 << SMITH) | (1 << FARMER),          // Saltmere: an ore town (salt mines)
];
#[cfg(not(feature = "balanced"))]
pub const TOWN_JOBS: [u8; N_TOWNS] = [
    (1 << FARMER) | (1 << CARPENTER) | (1 << SMITH),     // Wrenford, the hub
    (1 << WOODCUTTER) | (1 << CARPENTER) | (1 << FARMER), // Oakhollow
    (1 << MINER) | (1 << SMITH) | (1 << FARMER),          // Ironcrag
    (1 << FARMER) | (1 << WOODCUTTER),                    // Saltmere
];

// ---- Buildings ----
pub const EMPTY: u8 = 0;
/// +3 output for its owner working in that town.
pub const WORKSHOP: u8 = 1;
pub const MANOR: u8 = 2;
pub const BUILDING_VALUE: [u32; 3] = [0, 40, 150];

// ---- Survival ----
pub const START_FOOD: u32 = 6;
pub const START_TRADE_GOODS: u32 = 2;
pub const HUNGER_LIMIT: u8 = 3;

// ---- Children: how many a parent may have, by final place (the dead have none). With eight or
// more survivors this table; with fewer, see `children_allowed` (the island refills to 12). ----
pub const CHILDREN_BY_PLACE: [u8; MAX_AGENTS] = [3, 2, 2, 1, 1, 1, 1, 1, 0, 0, 0, 0];

// ---- Match status ----
pub const OPEN: u8 = 0;
pub const RUNNING: u8 = 1;
pub const ENDED: u8 = 2;
pub const FINALIZED: u8 = 3;

// ---- Events ----
pub const DROUGHT: u8 = 0;
pub const BOOM: u8 = 1;
pub const FROST: u8 = 2;
pub const STORM: u8 = 3;
