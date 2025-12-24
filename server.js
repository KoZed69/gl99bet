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

const MONGO_URI = process.env.MONGO_URI; 
const TOKEN = process.env.BETS_API_TOKEN;
const BETS_API_URL = "https://api.b365api.com/v1";

mongoose.connect(MONGO_URI).then(() => console.log("✅ GL99 Production DB Connected"));

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

// server.js ၏ /odds route ကို အောက်ပါအတိုင်း အစားထိုးပါ
app.get('/odds', async (req, res) => {
    try {
        console.log("⏳ Fetching data from BetsAPI...");
        
        // In-play နှင့် Upcoming နှစ်ခုလုံးကို ခေါ်ယူခြင်း
        const [inplayRes, upcomingRes] = await Promise.all([
            axios.get(`${BETS_API_URL}/bet365/inplay`, { params: { token: TOKEN, sport_id: 1 } }),
            axios.get(`${BETS_API_URL}/bet365/upcoming`, { params: { token: TOKEN, sport_id: 1 } })
        ]);

        // ဒေတာများ ရှိမရှိ သေချာစွာ စစ်ဆေးခြင်း
        const inplayMatches = inplayRes.data.results || [];
        const upcomingMatches = upcomingRes.data.results || [];
        const allRawMatches = [...inplayMatches, ...upcomingMatches];

        console.log(`📊 Total Raw Matches: ${allRawMatches.length}`);

        // Esoccer ဖယ်ထုတ်ခြင်း
        const filtered = allRawMatches.filter(m => {
            if (!m.league || !m.league.name) return false;
            const name = m.league.name.toLowerCase();
            return !name.includes("esoccer") && !name.includes("mins play");
        });

        // server.js ၏ Odds mapping အပိုင်းကို ဤသို့ ပြင်ဆင်ပါ
const processed = filtered.map(m => {
    const isLive = m.timer ? true : false;
    
    // BetsAPI ၏ Odds တည်နေရာ အမျိုးမျိုးကို စစ်ဆေးခြင်း
    const sp = m.main?.sp || {};
    const o = m.odds?.main?.sp || sp; // sp မရှိလျှင် odds.main.sp ကို ကြည့်မည်

    return {
        id: m.id,
        league: m.league?.name || "Unknown",
        home: m.home?.name || "Home",
        away: m.away?.name || "Away",
        time: new Date(m.time * 1000).toISOString(),
        isLive: isLive,
        score: m.ss || "0-0",
        timer: m.timer?.tm || "0",
        fullTime: {
            hdp: { label: o.handicap || "0", h: toMalay(o.h_odds), a: toMalay(o.a_odds) },
            ou: { label: o.total || "0", o: toMalay(o.o_odds), u: toMalay(o.u_odds) },
            xx: { h: o.h2h_home || "2.00", a: o.h2h_away || "2.00", d: o.h2h_draw || "3.00" }
        },
        firstHalf: {
            hdp: { label: o.h1_handicap || "0", h: toMalay(o.h1_h_odds), a: toMalay(o.h1_a_odds) },
            ou: { label: o.h1_total || "0", o: toMalay(o.h1_o_odds), u: toMalay(o.h1_u_odds) }
        }
    };
});

        console.log(`✅ Processed Matches: ${processed.length}`);
        res.json(processed);
    } catch (e) { 
        console.error("❌ API Error Detail:", e.response?.data || e.message);
        res.status(200).json([]); 
    }
});

// Auth & User routes များ ယခင်အတိုင်း ထည့်ထားပါ
app.post('/auth/login', async (req, res) => { /*...*/ });
app.post('/auth/register', async (req, res) => { /*...*/ });
app.post('/user/sync', async (req, res) => { /*...*/ });
app.post('/user/bet', async (req, res) => { /*...*/ });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 GL99 Live on Port ${PORT}`));