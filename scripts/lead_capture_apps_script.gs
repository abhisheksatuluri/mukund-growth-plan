/**
 * Mukund Venkat | Lead Capture Apps Script
 * Receives website form submissions, appends to Google Sheet, sends WhatsApp / Telegram notification.
 *
 * Setup:
 *   1. Open the target sheet: https://docs.google.com/spreadsheets/d/15d0sMZSOWqBuXofVg3YffoV3crSjjxHQrFbxhUJ56zw/edit
 *   2. Extensions → Apps Script
 *   3. Paste this entire file into Code.gs (replace any default code)
 *   4. Fill in CONFIG below (CallMeBot apikey, Telegram token, etc.)
 *   5. Run `setupHeaders` once (top toolbar → run icon, authorise when prompted)
 *   6. Deploy → New Deployment → type: Web app
 *      → Execute as: Me   → Who has access: Anyone   → Deploy
 *   7. Copy the Web App URL. That's the LEAD_ENDPOINT to paste into the website HTML.
 */

// ================ CONFIG ================
const CONFIG = {
  SHEET_ID: '15d0sMZSOWqBuXofVg3YffoV3crSjjxHQrFbxhUJ56zw',
  SHEET_NAME: 'Leads',

  // ---- Notification toggle: which channel do you want pings on? ----
  NOTIFY_WHATSAPP: true,   // CallMeBot, set apikey + phone below
  NOTIFY_TELEGRAM: false,  // Telegram bot, set token + chat_id below

  // CallMeBot WhatsApp (free): https://www.callmebot.com/blog/free-api-whatsapp-messages/
  // CallMeBot rotates their bot phone number occasionally. As of 2026 the active numbers are:
  //   1. +34 623 78 64 49 (current, try this first)
  //   2. +34 698 28 89 73 (fallback)
  //   3. +34 684 78 33 47 (fallback)
  // If one says "Invite to WhatsApp" or doesn't reply, try the next.
  // Setup:
  //   1. Save the number above to your phone contacts
  //   2. Open WhatsApp, send "I allow callmebot to send me messages" to the contact
  //   3. Wait for reply containing your apikey (usually under 2 min)
  //   4. Paste apikey below + your phone in international format with no + or spaces
  // If all numbers fail, the service may be down. Use Telegram below instead.
  CALLMEBOT: {
    PHONE: '447943011882',         // VERIFY: must match the WhatsApp account you registered with CallMeBot. International format, no + or spaces.
    APIKEY: '7538752',             // Filled in 2026-05-02
  },

  // Telegram bot fallback. https://core.telegram.org/bots#botfather
  // 1. /newbot in @BotFather, get token
  // 2. Send /start to your new bot from your account
  // 3. Visit https://api.telegram.org/bot<TOKEN>/getUpdates → grab chat_id
  TELEGRAM: {
    BOT_TOKEN: 'PASTE_TELEGRAM_BOT_TOKEN_HERE',
    CHAT_ID: 'PASTE_TELEGRAM_CHAT_ID_HERE',
  },
};

// ================ HEADERS ================
const HEADERS = [
  'Timestamp',
  'Source',
  'Name',
  'Email',
  'Phone',
  'Tier interest',
  'Audit score',
  'Audit band',
  'Goal / message',
  'Context',
  'UTM source',
  'UTM content',
  'Page URL',
  'User agent',
  'IP (best-effort)',
  'Notified',
];

// ================ MAIN HANDLER ================
function doPost(e) {
  try {
    let body = {};
    try {
      // Site posts JSON as text/plain to avoid CORS preflight
      body = JSON.parse(e.postData.contents || '{}');
    } catch (_) {
      // fallback to form-encoded
      body = e.parameter || {};
    }

    const sheet = getSheet_();
    const now = new Date();
    const row = [
      now,
      body.source || 'unknown',
      body.name || '',
      body.email || '',
      body.phone || '',
      body.tier || '',
      body.score != null ? body.score : '',
      body.band || '',
      body.goal || body.message || '',
      body.context || '',
      body.utm_source || '',
      body.utm_content || '',
      body.page_url || '',
      body.user_agent || '',
      (e && e.parameter && e.parameter.ip) || '',
      '',
    ];
    sheet.appendRow(row);

    // Notify
    let notified = '';
    try {
      const msg = formatNotification_(body, now);
      if (CONFIG.NOTIFY_WHATSAPP) notifyWhatsApp_(msg) && (notified += 'wa ');
      if (CONFIG.NOTIFY_TELEGRAM) notifyTelegram_(msg) && (notified += 'tg ');
    } catch (notifyErr) {
      notified = 'ERR: ' + (notifyErr && notifyErr.message || notifyErr);
    }
    if (notified) {
      sheet.getRange(sheet.getLastRow(), HEADERS.length).setValue(notified.trim());
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  // Simple health check: open the deployed URL in a browser to verify it's live
  return ContentService.createTextOutput(JSON.stringify({ ok: true, msg: 'Lead capture endpoint live.' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ================ HELPERS ================
function getSheet_() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function setupHeaders() {
  const sheet = getSheet_();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  // Format date column
  sheet.getRange(2, 1, 1000, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  // Auto-resize
  for (let c = 1; c <= HEADERS.length; c++) sheet.autoResizeColumn(c);
  Logger.log('Headers set up. Open the sheet to verify.');
}

function formatNotification_(body, ts) {
  const lines = [];
  const src = (body.source || 'unknown').toUpperCase();
  lines.push('🔔 NEW LEAD · ' + src);
  if (body.score != null) lines.push('Score: ' + body.score + '/20 · ' + (body.band || ''));
  if (body.tier) lines.push('Tier interest: ' + body.tier);
  if (body.name) lines.push('Name: ' + body.name);
  if (body.email) lines.push('Email: ' + body.email);
  if (body.phone) lines.push('Phone: ' + body.phone);
  if (body.goal || body.message) lines.push('Goal: ' + String(body.goal || body.message).slice(0, 240));
  lines.push('---');
  lines.push('Time: ' + ts.toLocaleString('en-GB', { timeZone: 'Europe/London' }));
  if (body.utm_source || body.utm_content) {
    lines.push('UTM: ' + [body.utm_source, body.utm_content].filter(Boolean).join(' / '));
  }
  return lines.join('\n');
}

function notifyWhatsApp_(message) {
  const c = CONFIG.CALLMEBOT;
  if (!c.APIKEY || c.APIKEY === 'PASTE_CALLMEBOT_APIKEY_HERE') return false;
  const url =
    'https://api.callmebot.com/whatsapp.php' +
    '?phone=' + encodeURIComponent(c.PHONE) +
    '&text=' + encodeURIComponent(message) +
    '&apikey=' + encodeURIComponent(c.APIKEY);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  return res.getResponseCode() < 400;
}

function notifyTelegram_(message) {
  const t = CONFIG.TELEGRAM;
  if (!t.BOT_TOKEN || t.BOT_TOKEN === 'PASTE_TELEGRAM_BOT_TOKEN_HERE') return false;
  const url = 'https://api.telegram.org/bot' + t.BOT_TOKEN + '/sendMessage';
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    payload: { chat_id: t.CHAT_ID, text: message, parse_mode: 'HTML' },
    muteHttpExceptions: true,
  });
  return res.getResponseCode() < 400;
}

// ================ TEST ================
function testNotify() {
  const msg = formatNotification_(
    {
      source: 'audit',
      name: 'Test Lead',
      email: 'test@example.com',
      score: 11,
      band: 'Building Phase',
      tier: 'Hybrid Signature (£499/mo)',
      goal: 'Trying out the lead capture flow.',
      utm_source: 'audit',
      utm_content: 'score_11',
    },
    new Date()
  );
  Logger.log(msg);
  if (CONFIG.NOTIFY_WHATSAPP) Logger.log('WhatsApp sent: ' + notifyWhatsApp_(msg));
  if (CONFIG.NOTIFY_TELEGRAM) Logger.log('Telegram sent: ' + notifyTelegram_(msg));
}
