const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- CONFIG ---
const MONGO_URI = "mongodb+srv://kozed:Bwargyi69@cluster0.s5oybom.mongodb.net/gl99_db?appName=Cluster0";
const ODDS_API_KEY = "d2bc1c4ec065e75e7d5fe54d38914dcc"; // ✅ NEW KEY

// --- WIDE LEAGUE LIST (For Many Matches) ---
const TARGET_LEAGUES = [
    'soccer_epl', 'soccer_england_efl_cup', 'soccer_efl_champ', 'soccer_england_league1',
    'soccer_spain_la_liga', 'soccer_spain_segunda_division', 'soccer_spain_copa_del_rey',
    'soccer_italy_serie_a', 'soccer_italy_serie_b',
    'soccer_germany_bundesliga', 'soccer_germany_bundesliga2',
    'soccer_france_ligue_one', 'soccer_france_ligue_two',
    'soccer_uefa_champs_league', 'soccer_uefa_europa_league', 'soccer_uefa_conf_league',
    'soccer_netherlands_eredivisie', 'soccer_portugal_primeira_liga', 'soccer_turkey_super_league',
    'soccer_intl_friendlies', 'soccer_uefa_nations_league', 
    'soccer_australia_aleague', 'soccer_japan_j_league', 'soccer_china_superleague',
    'soccer_usa_mls', 'soccer_mexico_ligamx', 'soccer_brazil_campeonato', 'soccer_argentina_primera'
];

mongoose.connect(MONGO_URI).then(() => console.log("✅ GL99 DB Connected"));

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 0 },
    history: { type: Array, default: [] } 
});
const User = mongoose.model('User', userSchema);

// --- ODDS HELPERS ---
function toMalay(decimal) {
    if (!decimal || decimal === 1) return ""; 
    return decimal <= 2.0 ? (decimal - 1).toFixed(2) : (-1 / (decimal - 1)).toFixed(2);
}

function getHandicapLabel(point) {
    if(point === undefined || point === null) return "0";
    const p = Math.abs(point);
    if (p % 1 === 0) return p.toFixed(1); 
    if (p % 0.5 === 0) return p.toFixed(2); 
    const lower = Math.floor(p * 2) / 2;
    return `${lower}-${lower + 0.5}`; 
}

let cachedMatches = [];
let lastFetch = 0;

app.get('/odds', async (req, res) => {
    // ✅ 10-MINUTE CACHE LOGIC
    // If request comes within 10 mins (600,000 ms) of last fetch, serve CACHE.
    if (Date.now() - lastFetch < 600000 && cachedMatches.length > 0) {
        console.log("Serving from Cache (No API Cost) - Last fetch was: " + new Date(lastFetch).toLocaleTimeString());
        return res.json(cachedMatches);
    }

    try {
        console.log("⏳ Fetching FRESH Odds from API (Costing Quota)...");
        
        // Fetch all leagues
        const requests = TARGET_LEAGUES.map(league => 
            axios.get(`https://api.the-odds-api.com/v4/sports/${league}/odds`, {
                params: { 
                    apiKey: ODDS_API_KEY, 
                    regions: 'eu', 
                    markets: 'h2h,totals,spreads', 
                    oddsFormat: 'decimal'
                }
            }).catch(e => ({ data: [] })) // If a league fails, just return empty for that one
        );

        const results = await Promise.all(requests);
        let allGames = results.flatMap(r => r.data);

        console.log(`Fetched ${allGames.length} Raw Matches`);

        let processed = [];
        allGames.forEach(match => {
            // Accept ANY Bookmaker (Bet365, 1xBet, Unibet, etc.)
            const bookie = match.bookmakers[0]; 
            if (!bookie) return;

            const h2h = bookie.markets.find(m => m.key === 'h2h');
            const spreads = bookie.markets.find(m => m.key === 'spreads');
            const totals = bookie.markets.find(m => m.key === 'totals');

            let hdpVal = spreads?.outcomes[0]?.point;
            let ouVal = totals?.outcomes[0]?.point;
            let favTeam = (hdpVal && hdpVal < 0) ? 'home' : 'away';

            processed.push({
                id: match.id,
                league: match.sport_title.replace("Soccer ", ""),
                time: match.commence_time,
                home: match.home_team,
                away: match.away_team,
                lines: [{
                    hdp: { 
                        label: getHandicapLabel(hdpVal), 
                        h: spreads ? toMalay(spreads.outcomes.find(o => o.name === match.home_team)?.price) : '-', 
                        a: spreads ? toMalay(spreads.outcomes.find(o => o.name === match.away_team)?.price) : '-',
                        fav: favTeam
                    },
                    ou: { 
                        label: getHandicapLabel(ouVal), 
                        o: totals ? toMalay(totals.outcomes.find(o => o.name === 'Over')?.price) : '-', 
                        u: totals ? toMalay(totals.outcomes.find(o => o.name === 'Under')?.price) : '-' 
                    },
                    xx: { 
                        h: h2h ? h2h.outcomes.find(o => o.name === match.home_team)?.price.toFixed(2) : '-', 
                        a: h2h ? h2h.outcomes.find(o => o.name === match.away_team)?.price.toFixed(2) : '-', 
                        d: h2h ? h2h.outcomes.find(o => o.name === 'Draw')?.price.toFixed(2) : '-' 
                    }
                }]
            });
        });

        // Filter: Keep games from last 3 hours (Live) + Future
        const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000);
        processed = processed.filter(m => new Date(m.time) > cutoff);
        processed.sort((a,b) => new Date(a.time) - new Date(b.time));

        console.log(`Sending ${processed.length} Valid Matches`);
        
        // Update Cache
        if (processed.length > 0) {
            cachedMatches = processed;
            lastFetch = Date.now();
        }
        
        res.json(processed);

    } catch (e) { console.error("Server Error:", e.message); res.json([]); }
});

// AUTH
app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Invalid Login" });
    res.json({ success: true, user });
});
app.post('/auth/register', async (req, res) => {
    const { username, password } = req.body;
    const user = new User({ username, password: await bcrypt.hash(password, 10), balance: 0 });
    await user.save();
    res.json({ success: true });
});
app.post('/user/sync', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    res.json(user || {});
});
app.post('/user/bet', async (req, res) => {
    const { username, stake, ticket } = req.body;
    const user = await User.findOne({ username });
    if(user.balance < stake) return res.status(400).json({ error: "Insufficient Balance" });
    user.balance -= stake;
    user.history.unshift(ticket);
    await user.save();
    res.json({ success: true });
});
app.get('/admin/users', async (req, res) => { const users = await User.find({}); res.json(users); });
app.post('/admin/balance', async (req, res) => { const { username, amount, type } = req.body; const user = await User.findOne({ username }); if(type === 'add') user.balance += amount; if(type === 'sub') user.balance -= amount; await user.save(); res.json({ success: true }); });
app.post('/admin/settle', async (req, res) => { const { username, betIndex, result } = req.body; const user = await User.findOne({ username }); let bet = user.history[betIndex]; if(!bet) return res.json({error: "Bet not found"}); bet.status = result; if(result === 'Win') { let winAmount = parseInt(bet.win.replace(/[^0-9]/g, '')); if(!isNaN(winAmount)) user.balance += winAmount; } user.markModified('history'); await user.save(); res.json({ success: true }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GL99 Running on ${PORT}`));