use anchor_lang::prelude::*;

#[error_code]
pub enum ArenaError {
    #[msg("Only the admin can do this")]
    Unauthorized,
    #[msg("The match is not open for joining")]
    NotOpen,
    #[msg("The match is full")]
    MatchFull,
    #[msg("This contestant has already lived its life")]
    AlreadyLived,
    #[msg("Need at least two agents to start")]
    TooFew,
    #[msg("The match is not running")]
    NotRunning,
    #[msg("The match has not ended")]
    NotEnded,
    #[msg("The match is not finalized")]
    NotFinalized,
    #[msg("Not this agent's slot")]
    NotYourSlot,
    #[msg("This agent is dead")]
    Eliminated,
    #[msg("On the road: can't act until arrival")]
    Travelling,
    #[msg("Already used today's main action")]
    AlreadyActed,
    #[msg("Too early to end the day")]
    TooEarly,
    #[msg("Not enough of that")]
    Insufficient,
    #[msg("Unknown good")]
    BadAsset,
    #[msg("Quantity must be positive")]
    ZeroQty,
    #[msg("Overflow")]
    Overflow,
    #[msg("Can't travel there")]
    BadTravel,
    #[msg("Not here")]
    WrongPlace,
    #[msg("That job isn't done in that town")]
    BadJob,
    #[msg("Bad build")]
    BadBuild,
    #[msg("That plot is taken")]
    PlotTaken,
    #[msg("Bad parameters")]
    BadParams,
    #[msg("No free slot")]
    NoSlot,
    #[msg("Words: up to 48 lowercase letters and spaces")]
    BadWords,
    #[msg("No such table")]
    BadTable,
    #[msg("Already have an open table")]
    TableOpen,
    #[msg("No such bid")]
    BadBid,
    #[msg("Already bid at this table")]
    AlreadyBid,
    #[msg("Contestant accounts must be every agent's, in slot order")]
    BadContestants,
    #[msg("No children left for this parent")]
    NoChildrenLeft,
    #[msg("Not this contestant's parent")]
    NotParent,
}
