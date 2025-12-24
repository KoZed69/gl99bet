require('dotenv').config();
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
const MONGO_URI = process.env.MONGO_URI; 
const TOKEN = process.env.BETS_API_TOKEN;
const BETS_API_URL = "https://api.b365api.com/v1";

if (!MONGO_URI) {
    console.error("❌ ERROR: Cloud Variables ထဲတွင် MONGO_URI မရှိပါ။");
    process.exit(1); 
}

mongoose.connect(MONGO_URI).then(() => console.log("✅ GL99 Production DB Connected"));

// --- USER SCHEMA ---
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 0 },
    history: { type: Array, default: [] } 
});
const User = mongoose.model('User', userSchema);

// --- ODDS HELPERS ---
function toMalay(decimal) {
    if (!decimal || decimal === 1 || decimal === "-") return "-"; 
    const d = parseFloat(decimal);
    return d <= 2.0 ? (d - 1).toFixed(2) : (-1 / (d - 1)).toFixed(2);
}

// --- FETCH ODDS (Filtered for Real Pro Soccer) ---
app.get('/odds', async (req, res) => {
    try {
        const response = await axios.get(`${BETS_API_URL}/bet365/upcoming`, {
            params: { token: TOKEN, sport_id: 1 } 
        });
        
        const rawMatches = response.data.results || [];
        
        // Esoccer နှင့် ဂိမ်းပွဲစဉ်များကို ဖယ်ထုတ်ခြင်း
        const filteredMatches = rawMatches.filter(m => {
            const leagueName = m.league.name.toLowerCase();
            return !leagueName.includes("esoccer") && !leagueName.includes("mins play");
        });

        const processed = filteredMatches.map(m => ({
            id: m.id, 
            league: m.league.name, 
            home: m.home.name, 
            away: m.away.name,
            time: new Date(m.time * 1000).toISOString(),
            lines: [{
                hdp: { label: m.main?.sp?.handicap || "0", h: toMalay(m.main?.sp?.h_odds), a: toMalay(m.main?.sp?.a_odds) },
                ou: { label: m.main?.sp?.total || "0", o: toMalay(m.main?.sp?.o_odds), u: toMalay(m.main?.sp?.u_odds) },
                xx: { h: m.main?.sp?.h2h_home || "2.00", a: m.main?.sp?.h2h_away || "2.00", d: m.main?.sp?.h2h_draw || "3.00" }
            }]
        }));
        res.json(processed);
    } catch (e) { res.status(500).json([]); }
});

// --- AUTH & USER ROUTES (Login, Register, Syn, Bet) ---
app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Invalid Login" });
    res.json({ success: true, user });
});

app.post('/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (await User.findOne({ username })) return res.status(400).json({ error: "User Exists" });
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

// --- ADMIN ROUTES ---
app.get('/admin/users', async (req, res) => { res.json(await User.find({})); });
app.post('/admin/balance', async (req, res) => {
    const { username, amount, type } = req.body;
    const user = await User.findOne({ username });
    if(type === 'add') user.balance += amount; else user.balance -= amount;
    await user.save();
    res.json({ success: true });
});

app.post('/admin/settle', async (req, res) => {
    const { username, betIndex, result } = req.body;
    const user = await User.findOne({ username });
    let bet = user.history[betIndex];
    bet.status = result;
    if(result === 'Win') {
        let winAmount = parseInt(bet.win.replace(/[^0-9]/g, ''));
        if(!isNaN(winAmount)) user.balance += winAmount;
    }
    user.markModified('history');
    await user.save();
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 GL99 Real Soccer Live on Port ${PORT}`));