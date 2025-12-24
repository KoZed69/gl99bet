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
const BETS_API_URL = "https://api.b365api.com/v1";

mongoose.connect(MONGO_URI).then(() => console.log("✅ GL99 Perfection DB Connected"));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 0 },
    history: { type: Array, default: [] } 
}));

function toMalay(decimal) {
    if (!decimal || decimal === 1 || decimal === "-") return "-"; 
    const d = parseFloat(decimal);
    return d <= 2.0 ? (d - 1).toFixed(2) : (-1 / (d - 1)).toFixed(2);
}

app.get('/odds', async (req, res) => {
    try {
        const inplayRes = await axios.get(`${BETS_API_URL}/bet365/inplay`, { params: { token: TOKEN, sport_id: 1 } });
        
        const upcomingPromises = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
            upcomingPromises.push(
                axios.get(`${BETS_API_URL}/bet365/upcoming`, { params: { token: TOKEN, sport_id: 1, day: dateStr } })
                .catch(() => ({ data: { results: [] } }))
            );
        }

        const upcomingResults = await Promise.all(upcomingPromises);
        const liveMatches = (inplayRes.data.results || []).map(m => ({ ...m, isLiveFlag: true }));
        let upcomingRaw = [];
        upcomingResults.forEach(r => { if(r.data && r.data.results) upcomingRaw = [...upcomingRaw, ...r.data.results]; });
        const upcomingMatches = upcomingRaw.map(m => ({ ...m, isLiveFlag: false }));

        const processed = [...liveMatches, ...upcomingMatches]
            .filter(m => m.league && !m.league.name.toLowerCase().includes("esoccer"))
            .map(m => {
                const sp = m.main?.sp || m.odds?.main?.sp || {};
                return {
                    id: m.id, league: m.league.name, home: m.home.name, away: m.away.name,
                    time: new Date(m.time * 1000).toISOString(),
                    isLive: m.isLiveFlag,
                    score: m.ss || "0-0",
                    timer: m.timer?.tm || "0",
                    fullTime: {
                        hdp: { label: sp.handicap || "0", h: toMalay(sp.h_odds), a: toMalay(sp.a_odds) },
                        ou: { label: sp.total || "0", o: toMalay(sp.o_odds), u: toMalay(sp.u_odds) },
                        xx: { h: sp.h2h_home || "2.00", a: sp.h2h_away || "2.00" }
                    },
                    firstHalf: {
                        hdp: { label: sp.h1_handicap || "0", h: toMalay(sp.h1_h_odds), a: toMalay(sp.h1_a_odds) },
                        ou: { label: sp.h1_total || "0", o: toMalay(sp.h1_o_odds), u: toMalay(sp.h1_u_odds) }
                    }
                };
            });
        res.json(processed);
    } catch (e) { res.status(200).json([]); }
});

// Full Logic Restoration
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
app.listen(PORT, () => console.log(`🚀 Final GL99 Server Live on ${PORT}`));