// ===================================================================================
//  ANALYSIS-HELPERS.JS
//  Contains centralized, advanced logic for move classification and evaluation handling.
// ===================================================================================

// UPDATED: Wrapped functions in a single global namespace to ensure proper integration.
window.AnalysisHelpers = {
    /**
     * Clamps an engine evaluation score to a maximum value for stable CPL calculation.
     * Prevents mate scores from creating huge, meaningless CPL values.
     * @param {number} score - The evaluation score in centipawns.
     * @returns {number} The normalized score.
     */
    normalizeEvalForCpl: function(score) {
        const MATE_THRESHOLD = 9500; // Anything above this is treated as a forced mate
        const CPL_CAP = 1500; // Cap the eval at +/- 15 pawns for CPL purposes

        if (Math.abs(score) > MATE_THRESHOLD) {
            return score > 0 ? CPL_CAP : -CPL_CAP;
        }
        return Math.max(-CPL_CAP, Math.min(CPL_CAP, score));
    },

    /**
     * Classifies a move based on CPL and other game context.
     * @param {object} params - An object containing analysis parameters.
     * @param {number} params.cpl - The calculated Centipawn Loss for the move.
     * @param {number} params.opponentCpl - The CPL of the opponent's previous move.
     * @param {number} params.evalBefore - The board evaluation before the move.
     * @param {boolean} params.hadMate - Whether the player had a forced mate before their move.
     * @param {boolean} params.foundMate - Whether the player's move leads to a forced mate.
     * @param {number} params.bestMoveAdvantage - The difference in eval between the best and second-best move.
     * @param {string} params.pgn - The PGN of the game up to the current move.
     * @returns {string} The move classification (e.g., 'Blunder', 'Best').
     */
    classifyMove: function({ cpl, opponentCpl, evalBefore, hadMate, foundMate, bestMoveAdvantage, pgn }) {
        // 1. Handle Book Moves
        const moveNumber = pgn.split(' ').filter(p => p.includes('.')).length;
        if (moveNumber <= 10 && OPENINGS.some(o => pgn.trim().startsWith(o.pgn))) {
            return 'Book';
        }

        // 2. Handle Forced Mates
        if (foundMate && !hadMate) return 'Brilliant'; // Found a mate that wasn't there before
        if (foundMate) return 'Best'; // Kept an existing mate sequence
        if (hadMate && !foundMate) return 'Blunder'; // Lost a forced mate

        // 3. Handle Missed Opportunities
        // A "Miss" is when the opponent blunders, but you fail to capitalize significantly.
        const isOpponentBlunder = opponentCpl >= 300;
        const isResponseAMistake = cpl >= 120;
        // Don't call it a "miss" if the position was already overwhelmingly winning.
        const isOverwhelmingAdvantage = Math.abs(evalBefore) > 800;

        if (isOpponentBlunder && isResponseAMistake && !isOverwhelmingAdvantage) {
            return 'Miss';
        }

        // 4. Handle Brilliant/Great moves
        const isOnlyGoodMove = bestMoveAdvantage > 250;
        if (cpl < 15 && isOnlyGoodMove) {
            // If the best move is much better than the alternatives, and you found it, it's a great move.
            const isSacrifice = false; // More complex logic needed for this, placeholder for now.
            return isSacrifice ? 'Brilliant' : 'Great';
        }

        // 5. Standard CPL-based classification
        if (cpl >= 300) return 'Blunder';
        if (cpl >= 120) return 'Mistake';
        if (cpl >= 50) return 'Inaccuracy';
        if (cpl < 10) return 'Best';
        if (cpl < 30) return 'Excellent';
        
        return 'Good';
    }
};