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

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://kozed:Bwargyi69@cluster0.s5oybom.mongodb.net/gl99_db";
const TOKEN = process.env.BETS_API_TOKEN || "241806-4Tr2NNdfhQxz9X";
const BETS_API_URL = "https://api.b365api.com/v3"; // v3 ကို သုံးခြင်း

mongoose.connect(MONGO_URI).then(() => console.log("✅ GL99 Perfection DB Connected"));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 0 },
    history: { type: Array, default: [] } 
}));

function toMalay(decimal) {
    const d = parseFloat(decimal);
    if (!d || d <= 1.0) return "-"; 
    // Standard Malay Formula:
    // If Decimal >= 2.0: -1 / (Decimal - 1)
    // If Decimal < 2.0: (Decimal - 1)
    if (d >= 2.0) {
        return (-1 / (d - 1)).toFixed(2);
    } else {
        return (d - 1).toFixed(2);
    }
}

app.get('/odds', async (req, res) => {
    try {
        // 1. Inplay (Live) အတွက် v3 endpoint သုံးခြင်း
        const inplayRes = await axios.get(`${BETS_API_URL}/events/inplay`, { 
            params: { token: TOKEN, sport_id: 1 } 
        });
        
        // 2. Upcoming အတွက် v3 endpoint သုံးခြင်း
        const upcomingRes = await axios.get(`${BETS_API_URL}/events/upcoming`, { 
            params: { token: TOKEN, sport_id: 1, skip_esports: 'true' } 
        });

        const liveMatches = inplayRes.data.results || [];
        const upcomingMatches = upcomingRes.data.results || [];

        const allData = [...liveMatches.map(m => ({...m, isLiveFlag: true})), 
                         ...upcomingMatches.map(m => ({...m, isLiveFlag: false}))];

        // Replace the map function inside app.get('/odds') with this:
const processed = allData.map(m => {
    const matchDate = new Date(m.time * 1000); 
    
    // API v3 usually puts main market odds here:
    const sp = m.main?.sp || m.odds?.main?.sp || {};

    return {
        id: m.id,
        league: m.league.name,
        home: m.home.name,
        away: m.away.name,
        time: matchDate.toISOString(),
        isLive: m.isLiveFlag,
        score: m.ss || "0-0",
        timer: m.timer?.tm || "0",
        fullTime: {
            hdp: { label: sp.handicap || "0", h: toMalay(sp.h_odds || sp.home_odds), a: toMalay(sp.a_odds || sp.away_odds) },
            ou: { label: sp.total || "0", o: toMalay(sp.o_odds || sp.over_odds), u: toMalay(sp.u_odds || sp.under_odds) },
            xx: { h: sp.h2h_home || "2.00", a: sp.h2h_away || "2.00" }
        },
        firstHalf: {
            hdp: { label: sp.h1_handicap || "0", h: toMalay(sp.h1_h_odds), a: toMalay(sp.h1_a_odds) },
            ou: { label: sp.h1_total || "0", o: toMalay(sp.h1_o_odds), u: toMalay(sp.h1_u_odds) }
        }
    };
});

        console.log(`✅ Update: ${processed.length} matches found.`);
        res.json(processed);
    } catch (e) {
        console.error("API Error:", e.message);
        res.status(200).json([]);
    }
});

// မူလ User & Auth Routes များကို အပြည့်အစုံ ပြန်လည်ဖြည့်သွင်းပေးထားပါသည်
app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Invalid" });
    res.json({ success: true, user });
});

app.post('/user/sync', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    res.json(user || { balance: 0 });
});

app.post('/user/bet', async (req, res) => {
    const { username, stake, ticket } = req.body;
    const user = await User.findOne({ username });
    if(!user || user.balance < stake) return res.status(400).json({ error: "Low Funds" });
    user.balance -= stake;
    user.history.unshift(ticket);
    await user.save();
    res.json({ success: true });
});

const PORT = process.env.PORT || 10000; 
app.listen(PORT, () => console.log(`🚀 Perfect GL99 Live on Port ${PORT}`));