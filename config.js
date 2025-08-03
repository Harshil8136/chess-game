// ===================================================================================
//  CONFIG.JS
//  Central configuration and settings for the chess application.
// ===================================================================================

const APP_CONFIG = {
    STOCKFISH_URL: 'https://cdn.jsdelivr.net/gh/niklasf/stockfish.js/stockfish.js',
    DEFAULT_BOARD_THEME: 'green',
    DEFAULT_PIECE_THEME: 'cburnett',
    MATE_SCORE: 10000
};

const THEMES = [
    { name: 'green', displayName: 'Green 🟩', colors: { light: '#eaefd2', dark: '#769656' } },
    { name: 'brown', displayName: 'Brown 🟫', colors: { light: '#f0d9b5', dark: '#b58863' } },
    { name: 'blue',  displayName: 'Blue 🟦',  colors: { light: '#dee3e6', dark: '#8ca2ad' } },
    { name: 'stone', displayName: 'Stone 🗿', colors: { light: '#d1d1d1', dark: '#a7a7a7' } }
];

const PIECE_THEMES = {
    alpha: 'img/alpha/{piece}.png', anarcandy: 'img/anarcandy/{piece}.png', caliente: 'img/caliente/{piece}.png', 
    california: 'img/california/{piece}.png', cardinal: 'img/cardinal/{piece}.png', cburnett: 'img/cburnett/{piece}.png', 
    celtic: 'img/celtic/{piece}.png', chess7: 'img/chess7/{piece}.png', chessnut: 'img/chessnut/{piece}.png', 
    companion: 'img/companion/{piece}.png', cooke: 'img/cooke/{piece}.png', dubrovny: 'img/dubrovny/{piece}.png', 
    fantasy: 'img/fantasy/{piece}.png', firi: 'img/firi/{piece}.png', fresca: 'img/fresca/{piece}.png', 
    gioco: 'img/gioco/{piece}.png', governor: 'img/governor/{piece}.png', horsey: 'img/horsey/{piece}.png', 
    icpieces: 'img/icpieces/{piece}.png', kosal: 'img/kosal/{piece}.png', leipzig: 'img/leipzig/{piece}.png', 
    letter: 'img/letter/{piece}.png', maestro: 'img/maestro/{piece}.png', merida: 'img/merida/{piece}.png', 
    monarchy: 'img/monarchy/{piece}.png', mpchess: 'img/mpchess/{piece}.png', pirouetti: 'img/pirouetti/{piece}.png', 
    pixel: 'img/pixel/{piece}.png', reillycraig: 'img/reillycraig/{piece}.png', rhosgfx: 'img/rhosgfx/{piece}.png', 
    riohacha: 'img/riohacha/{piece}.png', shapes: 'img/shapes/{piece}.png', spatial: 'img/spatial/{piece}.png', 
    staunty: 'img/staunty/{piece}.png', tatiana: 'img/tatiana/{piece}.png', wikipedia: 'img/wikipedia/{piece}.png', 
    xkcd: 'img/xkcd/{piece}.png'
};

const ELO_MAP = { 
    1: 450, 2: 600, 3: 750, 4: 900, 5: 1050, 6: 1200, 
    7: 1400, 8: 1600, 9: 1800, 10: 2100, 11: 2400, 12: 2700 
};

const MATERIAL_POINTS = { p: 1, n: 3, b: 3, r: 5, q: 9 };

// Storing sound paths here. The main script will load them.
const SOUND_PATHS = {
    'move': 'sounds/move-self.mp3',
    'capture': 'sounds/capture.mp3',
    'check': 'sounds/move-check.mp3',
    'gameEnd': 'sounds/game-end.mp3',
    'gameStart': 'sounds/game-start.mp3',
    'castle': 'sounds/castle.mp3',
    'promote': 'sounds/promote.mp3',
    'notify': 'sounds/notify.mp3'
};

const OPENINGS = [
    { pgn: "1. e4", name: "King's Pawn Opening" }, { pgn: "1. d4", name: "Queen's Pawn Opening" },
    { pgn: "1. c4", name: "English Opening" }, { pgn: "1. Nf3", name: "Zukertort Opening" },
    { pgn: "1. f4", name: "Bird's Opening" }, { pgn: "1. e4 e5", name: "King's Pawn Game" },
    { pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4", name: "Italian Game" }, { pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5", name: "Giuoco Piano" },
    { pgn: "1. e4 e5 2. Nf3 Nc6 3. Bb5", name: "Ruy López" }, { pgn: "1. e4 e5 2. Nf3 Nc6 3. d4", name: "Scotch Game" },
    { pgn: "1. e4 e5 2. Nf3 d6", name: "Philidor Defence" }, { pgn: "1. e4 e5 2. f4", name: "King's Gambit" },
    { pgn: "1. e4 c5", name: "Sicilian Defence" }, { pgn: "1. e4 c6", name: "Caro-Kann Defence" },
    { pgn: "1. e4 d5", name: "Scandinavian Defence" }, { pgn: "1. e4 e6", name: "French Defence" },
    { pgn: "1. d4 d5", name: "Queen's Pawn Game" }, { pgn: "1. d4 d5 2. c4", name: "Queen's Gambit" },
    { pgn: "1. d4 d5 2. c4 dxc4", name: "Queen's Gambit Accepted" }, { pgn: "1. d4 d5 2. c4 e6", name: "Queen's Gambit Declined" },
    { pgn: "1. d4 Nf6", name: "Indian Defence" }, { pgn: "1. d4 Nf6 2. c4 g6", name: "King's Indian Defence" },
    { pgn: "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4", name: "Nimzo-Indian Defence" }, { pgn: "1. d4 Nf6 2. c4 e6 3. Nf3 b6", name: "Queen's Indian Defence" },
    { pgn: "1. d4 f5", name: "Dutch Defence" }
];
