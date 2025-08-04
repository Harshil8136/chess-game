// ===================================================================================
//  CONFIG.JS
//  Central configuration and settings for the chess application.
// ===================================================================================

/** MODIFIED **/
// Updated with the new list of UI themes.
const UI_THEMES = [
    {
        name: 'charcoal',
        displayName: 'Charcoal 숯',
        colors: {
            '--bg-main': '#262522',
            '--bg-panel': '#312e2b',
            '--text-light': '#f5f5f4',
            '--text-dark': '#a8a29e',
            '--border': '#57534e',
            '--btn-primary-bg': '#2563eb',
            '--btn-primary-hover': '#1d4ed8',
            '--btn-secondary-bg': '#57534e',
            '--btn-secondary-hover': '#44403c',
        }
    },
    {
        name: 'midnight',
        displayName: 'Midnight 🌃',
        colors: {
            '--bg-main': '#1e293b',
            '--bg-panel': '#334155',
            '--text-light': '#f1f5f9',
            '--text-dark': '#94a3b8',
            '--border': '#475569',
            '--btn-primary-bg': '#be123c',
            '--btn-primary-hover': '#9f1239',
            '--btn-secondary-bg': '#475569',
            '--btn-secondary-hover': '#334155',
        }
    },
    {
        name: 'forest',
        displayName: 'Forest 🌲',
        colors: {
            '--bg-main': '#1a2e24',
            '--bg-panel': '#224030',
            '--text-light': '#e8f5e9',
            '--text-dark': '#a5d6a7',
            '--border': '#388e3c',
            '--btn-primary-bg': '#f59e0b',
            '--btn-primary-hover': '#d97706',
            '--btn-secondary-bg': '#388e3c',
            '--btn-secondary-hover': '#2e7d32',
        }
    },
    {
        name: 'ocean',
        displayName: 'Ocean 🌊',
        colors: {
            '--bg-main': '#0a2342',
            '--bg-panel': '#1d4263',
            '--text-light': '#e9f1f8',
            '--text-dark': '#86a8c4',
            '--border': '#2f5b82',
            '--btn-primary-bg': '#ffbf00',
            '--btn-primary-hover': '#e6a800',
            '--btn-secondary-bg': '#2f5b82',
            '--btn-secondary-hover': '#254e70',
        }
    },
    {
        name: 'sunset',
        displayName: 'Sunset 🌇',
        colors: {
            '--bg-main': '#2d182e',
            '--bg-panel': '#48244e',
            '--text-light': '#f2e8f1',
            '--text-dark': '#c8a8c4',
            '--border': '#704276',
            '--btn-primary-bg': '#e66b4d',
            '--btn-primary-hover': '#cc5c42',
            '--btn-secondary-bg': '#704276',
            '--btn-secondary-hover': '#5e3a64',
        }
    },
    {
        name: 'retro',
        displayName: 'Retro 💾',
        colors: {
            '--bg-main': '#212121',
            '--bg-panel': '#363636',
            '--text-light': '#f0f0f0',
            '--text-dark': '#b0b0b0',
            '--border': '#555555',
            '--btn-primary-bg': '#00ff00',
            '--btn-primary-hover': '#00cc00',
            '--btn-secondary-bg': '#555555',
            '--btn-secondary-hover': '#404040',
        }
    },
    {
        name: 'high-contrast',
        displayName: 'High Contrast 🌗',
        colors: {
            '--bg-main': '#000000',
            '--bg-panel': '#333333',
            '--text-light': '#ffffff',
            '--text-dark': '#cccccc',
            '--border': '#666666',
            '--btn-primary-bg': '#ff0000',
            '--btn-primary-hover': '#cc0000',
            '--btn-secondary-bg': '#333333',
            '--btn-secondary-hover': '#555555',
        }
    },
    {
        name: 'lavender',
        displayName: 'Lavender 💜',
        colors: {
            '--bg-main': '#e6e6fa',
            '--bg-panel': '#d8bfd8',
            '--text-light': '#363062',
            '--text-dark': '#6a5acd',
            '--border': '#b099d4',
            '--btn-primary-bg': '#8a2be2',
            '--btn-primary-hover': '#7a1be1',
            '--btn-secondary-bg': '#b099d4',
            '--btn-secondary-hover': '#a188c9',
        }
    },
    {
        name: 'mint',
        displayName: 'Mint 🌱',
        colors: {
            '--bg-main': '#f0fff0',
            '--bg-panel': '#c4d8c4',
            '--text-light': '#2f4f4f',
            '--text-dark': '#556b2f',
            '--border': '#8fbc8f',
            '--btn-primary-bg': '#3cb371',
            '--btn-primary-hover': '#32a162',
            '--btn-secondary-bg': '#8fbc8f',
            '--btn-secondary-hover': '#7a9e7a',
        }
    }
];

const APP_CONFIG = {
    STOCKFISH_URL: 'https://cdn.jsdelivr.net/gh/niklasf/stockfish.js/stockfish.js',
    DEFAULT_BOARD_THEME: 'green',
    DEFAULT_PIECE_THEME: 'alpha',
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

const DIFFICULTY_SETTINGS = {
    1: { elo: 450,  type: 'random' },
    2: { elo: 650,  type: 'greedy' },
    3: { elo: 850,  type: 'stockfish', depth: 2 },
    4: { elo: 1000, type: 'stockfish', depth: 4 },
    5: { elo: 1200, type: 'stockfish', depth: 6 },
    6: { elo: 1400, type: 'stockfish', depth: 8 },
    7: { elo: 1600, type: 'stockfish', movetime: 500 },
    8: { elo: 1800, type: 'stockfish', movetime: 800 },
    9: { elo: 2000, type: 'stockfish', movetime: 1200 },
    10: { elo: 2200, type: 'stockfish', movetime: 1600 },
    11: { elo: 2400, type: 'stockfish', movetime: 2000 },
    12: { elo: 2700, type: 'stockfish', movetime: 2500 }
};

const MATERIAL_POINTS = { p: 1, n: 3, b: 3, r: 5, q: 9 };

const SOUND_PATHS = {
    'moveSelf': 'sounds/move-self.mp3',
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
    { pgn: "1. e4 e5", name: "King's Pawn Game" },
    { pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4", name: "Italian Game" },
    { pgn: "1. e4 e5 2. Nf3 Nc6 3. Bb5", name: "Ruy López" },
    { pgn: "1. e4 c5", name: "Sicilian Defence" },
    { pgn: "1. d4 d5 2. c4", name: "Queen's Gambit" }
];
