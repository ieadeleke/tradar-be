import express from "express";
import Funding from "../models/fundingModel.js";
import Wallet from "../models/walletModel.js";
import fetch from "node-fetch";

const router = express.Router();

async function getOrCreateWallet(userId) {
  const w = await Wallet.findOne({ user: userId });
  return w;
}

// Raw PayPal webhook; assumes JSON body
router.post("/paypal", express.json({ type: "*/*" }), async (req, res) => {
  try {
    const event = req.body || {};
    const eventType = event?.event_type || event?.eventType;
    const pu = event?.resource?.purchase_units?.[0];
    const customId = pu?.custom_id || event?.resource?.custom_id;
    const amount = Number(pu?.amount?.value || event?.resource?.amount?.value);
    // Optional: verify webhook signature with PayPal if env configured
    const verified = await verifyPayPalSignature(req).catch(() => false);
    if (!verified) {
      console.warn("[webhooks/paypal] signature not verified; ignoring event");
      return res.sendStatus(202);
    }

    if (eventType === "PAYMENT.CAPTURE.COMPLETED" || eventType === "CHECKOUT.ORDER.APPROVED") {
      if (customId) {
        const fr = await Funding.findById(customId);
        if (fr && fr.status === "pending") {
          const wallet = await getOrCreateWallet(fr.user);
          if (wallet) {
            wallet.balance = Number(wallet.balance || 0) + (amount || fr.amount);
            await wallet.save();
          }
          fr.status = "approved";
          fr.meta = { ...(fr.meta || {}), paypal: { id: event?.id, resource: event?.resource } };
          await fr.save();
        }
      }
    }
    return res.sendStatus(200);
  } catch (e) {
    console.error("[webhooks/paypal]", e);
    return res.sendStatus(500);
  }
});

export default router;

async function verifyPayPalSignature(req) {
  const env = (process.env.PAYPAL_ENV || "live").toLowerCase();
  const base = env === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  const client = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!client || !secret || !webhookId) return false;

  // Get app access token
  const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + Buffer.from(`${client}:${secret}`).toString("base64") },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });
  if (!tokenRes.ok) return false;
  const token = (await tokenRes.json())?.access_token;
  if (!token) return false;

  // Build verification payload
  const transmissionId = req.headers["paypal-transmission-id"];
  const transmissionTime = req.headers["paypal-transmission-time"];
  const certUrl = req.headers["paypal-cert-url"];
  const authAlgo = req.headers["paypal-auth-algo"];
  const transmissionSig = req.headers["paypal-transmission-sig"];
  const webhookEvent = req.body;
  const verifyRes = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: webhookEvent,
    }),
  });
  if (!verifyRes.ok) return false;
  const v = await verifyRes.json();
  return (v?.verification_status || "").toUpperCase() === "SUCCESS";
}
