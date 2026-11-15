// Tournament settings for the director (server/director.ts). Rules live in TOURNAMENT.md.

/** Days per match. */
export const MATCH_DAYS = Number(process.env.MATCH_DAYS ?? 20);
/** A day ends when every agent has acted, or after this long (whichever is first). */
export const DAY_SECS = Number(process.env.DAY_SECS ?? 90);
/** Agents per match. */
export const SEATS = Number(process.env.SEATS ?? 8);
/** SOL prize pool we put into each match (lamports); shared 50/30/20 by eligible entrants. */
export const PRIZE_LAMPORTS = BigInt(process.env.PRIZE_LAMPORTS ?? 50_000_000);
export const PRIZE_BPS: [number, number, number] = [5000, 3000, 2000];
/** Thinking budget per contestant per match (micro-USDC), the same for everyone. */
export const BUDGET_MICRO_USDC = 60_000n;
/** SOL each contestant wallet keeps for fees-free signing (the director pays fees). */
export const CONTESTANT_SOL = 5_000_000n;
/** Pause between matches, seconds (the post-match breakdown plays here). */
export const INTERMISSION_SECS = Number(process.env.INTERMISSION_SECS ?? 60);
