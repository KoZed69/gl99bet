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
        console.log("⏳ Fetching Live & 7-Day Upcoming...");
        // ၁။ Live ပွဲစဉ်များ ဆွဲယူခြင်း
        const inplayRes = await axios.get(`${BETS_API_URL}/bet365/inplay`, { params: { token: TOKEN, sport_id: 1 } });
        
        // ၂။ ၇ ရက်စာ Upcoming ဒေတာများကို Loop ဖြင့် ဆွဲယူခြင်း
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
        let allRaw = inplayRes.data.results || [];
        upcomingResults.forEach(r => { if(r.data && r.data.results) allRaw = [...allRaw, ...r.data.results]; });

        const processed = allRaw
            .filter(m => m.league && !m.league.name.toLowerCase().includes("esoccer"))
            .map(m => {
                const sp = m.main?.sp || m.odds?.main?.sp || {};
                return {
                    id: m.id, league: m.league.name, home: m.home.name, away: m.away.name,
                    time: new Date(m.time * 1000).toISOString(), 
                    isLive: !!(m.timer || m.ss), // Live Status သတ်မှတ်ခြင်း
                    score: m.ss || "0-0", timer: m.timer?.tm || "0",
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
        console.log(`✅ Success: Total ${processed.length} matches found.`);
        res.json(processed);
    } catch (e) { res.status(200).json([]); }
});

// Admin, Auth, User Routes များ သင်၏ server (1).js အတိုင်း ဆက်လက်ထားရှိပါ
app.post('/auth/login', async (req, res) => { /* logic */ });
app.post('/user/sync', async (req, res) => { /* logic */ });
app.post('/user/bet', async (req, res) => { /* logic */ });

const PORT = process.env.PORT || 10000; 
app.listen(PORT, () => console.log(`🚀 Perfect GL99 Live on Port ${PORT}`));