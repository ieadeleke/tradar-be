import mongoose from "mongoose";

const pricePointSchema = new mongoose.Schema({ t: Date, p: Number }, { _id: false });

const overrideSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true },
    leverage: { type: Number },
    slPct: { type: Number },
    tpPct: { type: Number },
    atrEnabled: { type: Boolean },
    atrPeriod: { type: Number },
    atrSlMult: { type: Number },
    atrTpMult: { type: Number },
  },
  { _id: false }
);

const autoTradeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, unique: true, required: true },
    enabled: { type: Boolean, default: false },
    // Basic strategy/config
    assetType: { type: String, enum: ["crypto", "stock", "commodity", "forex"], default: "crypto" },
    symbols: { type: [String], default: ["bitcoin"] },
    leverage: { type: Number, default: 1 },
    riskPerTradePct: { type: Number, default: 1 }, // % of wallet balance used as margin per trade
    maxConcurrentPositions: { type: Number, default: 1 },
    intervalSec: { type: Number, default: 60 },
    // Sizing
    sizingMode: { type: String, enum: ["percent", "fixed", "kelly"], default: "percent" },
    fixedNotionalUSD: { type: Number, default: 0 },
    kellyFractionPct: { type: Number, default: 5 },
    // Strategy specifics
    signalType: { type: String, enum: ["momentum"], default: "momentum" },
    lookbackShort: { type: Number, default: 3 },
    lookbackLong: { type: Number, default: 8 },
    slPct: { type: Number, default: 0.5 }, // stop loss percent
    tpPct: { type: Number, default: 1 },   // take profit percent
    // ATR-based SL/TP (optional)
    atrEnabled: { type: Boolean, default: false },
    atrPeriod: { type: Number, default: 14 },
    atrSlMult: { type: Number, default: 1.5 },
    atrTpMult: { type: Number, default: 2 },
    // Risk controls
    minFreeMarginPct: { type: Number, default: 10 }, // min free wallet balance as % of dailyRefEquity to allow new trades
    dailyMaxLossPct: { type: Number, default: 20 },  // daily drawdown cap vs reference equity
    avoidDuplicateSide: { type: Boolean, default: true },
    // Runtime/meta
    startedAt: { type: Date },
    lastRunAt: { type: Date },
    nextRunAt: { type: Date },
    lockedUntil: { type: Date },
    lastPrices: { type: [pricePointSchema], default: [] },
    dailyRefEquity: { type: Number },
    dailyDate: { type: Date },
    // Pause control
    pausedUntil: { type: Date },
    pausedReason: { type: String },
    // Per-symbol overrides
    overrides: { type: [overrideSchema], default: [] },
  },
  { timestamps: true }
);

const AutoTradeConfig = mongoose.models.AutoTradeConfig || mongoose.model("AutoTradeConfig", autoTradeSchema);

export default AutoTradeConfig;
