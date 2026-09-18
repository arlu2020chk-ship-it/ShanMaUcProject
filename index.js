const fs = require("fs");
const path = require("path");
const { Bot } = require("node-telegram-bot-api");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const DATA_DIR = process.env.DATA_DIR || __dirname;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN is missing");
if (!ADMIN_ID) throw new Error("ADMIN_ID is missing");

const KBZ_NUMBER = "09781199616";
const KBZ_NAME = "SittPonenyaMaung";
const OPEN_HOUR = 9;
const CLOSE_HOUR = 23;

const PRICES = {
  "60": 4900, "120": 9800, "180": 14900, "240": 20800, "325": 24400,
  "385": 29000, "660": 47500, "720": 52000, "985": 76500,
  "1320": 93500, "1500": 112500, "1800": 119500, "2460": 178500,
  "3850": 218000, "8100": 431000
};

const PACKS = Object.keys(PRICES);
const bot = new Bot(BOT_TOKEN);
const states = new Map();
const DATA_FILE = path.join(DATA_DIR, "bot-data.json");

let db = {
  users: {},
  orders: {},
  costs: {},
  system: { lastCloseDate: null }
};

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return save();
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw.trim()) return;
    const x = JSON.parse(raw);
    db = {
      users: x.users || {},
      orders: x.orders || {},
      costs: x.costs || {},
      system: x.system || { lastCloseDate: null }
    };
  } catch (e) {
    console.error("Data load error:", e);
  }
}
load();

function mmParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const out = {};
  for (const p of parts) if (p.type !== "literal") out[p.type] = p.value;

  return {
    year: Number(out.year), month: Number(out.month), day: Number(out.day),
    hour: Number(out.hour), minute: Number(out.minute), second: Number(out.second)
  };
}

function dateKey(date = new Date()) {
  const p = mmParts(date);
  return p.year + "-" + String(p.month).padStart(2, "0") + "-" + String(p.day).padStart(2, "0");
}

function monthKey(date = new Date()) {
  const p = mmParts(date);
  return p.year + "-" + String(p.month).padStart(2, "0");
}

function displayTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).format(date);
}

function shopOpen() {
  const h = mmParts().hour;
  return h >= OPEN_HOUR && h < CLOSE_HOUR;
}

function isAdmin(id) {
  return String(id) === String(ADMIN_ID);
}

function register(ctx) {
  const id = String(ctx.from.id);
  const old = db.users[id] || {};
  db.users[id] = {
    id: ctx.from.id,
    name: ((ctx.from.first_name || "") + " " + (ctx.from.last_name || "")).trim() || "Unknown",
    username: ctx.from.username ? "@" + ctx.from.username : "",
    language: old.language || null,
    startedAt: old.startedAt || new Date().toISOString(),
    lastSeen: Date.now()
  };
  save();
}

function getLang(id) {
  return db.users[String(id)]?.language || "en";
}

function setLang(id, language) {
  const key = String(id);
  if (!db.users[key]) db.users[key] = { id, name: "Unknown", username: "", language: null };
  db.users[key].language = language;
  save();
}

function languageMenu() {
  return {
    keyboard: [[{ text: "မြန်မာ" }, { text: "English" }]],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

function mainMenu(id) {
  const l = getLang(id);
  const keyboard = l === "mm"
    ? [
        [{ text: "UC ဝယ်မည်" }, { text: "ဈေးနှုန်းများ" }],
        [{ text: "ကျွန်ုပ်၏အမှာစာများ" }, { text: "အကူအညီ" }]
      ]
    : [
        [{ text: "UC Menu" }, { text: "Price List" }],
        [{ text: "My Orders" }, { text: "Help" }]
      ];

  if (isAdmin(id)) {
    keyboard.push([{ text: l === "mm" ? "စီမံခန့်ခွဲမှု" : "Admin Panel" }]);
  }

  return { keyboard, resize_keyboard: true };
}

function ucMenu(id) {
  const back = getLang(id) === "mm" ? "နောက်သို့" : "Back";
  const rows = [
    ["60", "120", "180"], ["240", "325", "385"], ["660", "720", "985"],
    ["1320", "1500", "1800"], ["2460", "3850", "8100"]
  ].map(row => row.map(x => ({ text: x + " UC" })));
  rows.push([{ text: back }]);
  return { keyboard: rows, resize_keyboard: true };
}

function cancelMenu(id) {
  return {
    keyboard: [[{ text: getLang(id) === "mm" ? "အမှာစာ ပယ်ဖျက်မည်" : "Cancel Order" }]],
    resize_keyboard: true
  };
}

function adminMenu() {
  return {
    keyboard: [
      [{ text: "Pending Orders" }, { text: "Approved Orders" }],
      [{ text: "Delivered Orders" }, { text: "Rejected Orders" }],
      [{ text: "Profit Report" }, { text: "Set UC Cost" }],
      [{ text: "Main Menu" }]
    ],
    resize_keyboard: true
  };
}

function adminButtons(id) {
  return {
    inline_keyboard: [
      [
        { text: "Approve", callback_data: "approve:" + id },
        { text: "Reject", callback_data: "reject:" + id }
      ],
      [{ text: "Delivered", callback_data: "delivered:" + id }]
    ]
  };
}

function priceText(l) {
  const unit = l === "mm" ? " ကျပ်" : " Ks";
  const title = l === "mm" ? "UC ဈေးနှုန်းများ" : "UC Price List";
  return title + "\n\n" + PACKS.map(p => p + " UC - " + Number(PRICES[p]).toLocaleString() + unit).join("\n");
}

function statusText(s, l) {
  const en = {
    WAITING_SCREENSHOT: "Waiting for Screenshot",
    PENDING_ADMIN: "Pending Admin",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled"
  };
  const mm = {
    WAITING_SCREENSHOT: "ငွေလွှဲပြေစာ စောင့်နေသည်",
    PENDING_ADMIN: "စစ်ဆေးနေသည်",
    APPROVED: "အတည်ပြုပြီး",
    REJECTED: "ပယ်ချထားသည်",
    DELIVERED: "ပို့ဆောင်ပြီး",
    CANCELLED: "ပယ်ဖျက်ထားသည်"
  };
  return (l === "mm" ? mm : en)[s] || s;
}

function newOrderId() {
  return "ORD" + Date.now().toString().slice(-9) + Math.floor(Math.random() * 900 + 100);
}

function adminOrderText(o) {
  return [
    "New UC Order",
    "",
    "Order ID: " + o.id,
    "",
    "Customer Name: " + o.name,
    "Username: " + (o.username || "No username"),
    "Telegram ID: " + o.userId,
    "",
    "PUBG ID: " + o.pubgId,
    "UC Package: " + o.ucPack + " UC",
    "Amount: " + Number(o.price).toLocaleString() + " Ks",
    "",
    "Payment Method: KBZPay",
    "Payer Phone: " + o.phone,
    "",
    "Status: " + o.status,
    "Order Time: " + o.createdAt
  ].join("\n");
}

async function sendAdminOrder(o) {
  const common = {
    chat_id: ADMIN_ID,
    caption: adminOrderText(o),
    reply_markup: adminButtons(o.id)
  };
  if (o.paymentFileType === "photo") {
    await bot.api.sendPhoto({ ...common, photo: o.paymentFile });
  } else {
    await bot.api.sendDocument({ ...common, document: o.paymentFile });
  }
}

const CONTROL_TEXTS = new Set([
  "UC Menu", "UC ဝယ်မည်", "Price List", "ဈေးနှုန်းများ",
  "My Orders", "ကျွန်ုပ်၏အမှာစာများ", "Help", "အကူအညီ",
  "Admin Panel", "စီမံခန့်ခွဲမှု", "Back", "နောက်သို့",
  "Cancel Order", "အမှာစာ ပယ်ဖျက်မည်", "Main Menu",
  "Pending Orders", "Approved Orders", "Delivered Orders", "Rejected Orders",
  "Profit Report", "Set UC Cost", "မြန်မာ", "English",
  ...PACKS.map(x => x + " UC")
]);

bot.command("start", async ctx => {
  register(ctx);
  states.delete(ctx.from.id);
  await ctx.reply("ဘာသာစကားကို ရွေးချယ်ပါ။\nChoose your language.", { reply_markup: languageMenu() });
});

bot.hears(/^မြန်မာ$/, async ctx => {
  register(ctx);
  setLang(ctx.from.id, "mm");
  states.delete(ctx.from.id);
  await ctx.reply("ShanMaACxNo1 UC အရောင်းစနစ်\n\nမင်္ဂလာပါ။\nလိုအပ်သော ဝန်ဆောင်မှုကို ရွေးချယ်ပါ။", {
    reply_markup: mainMenu(ctx.from.id)
  });
});

bot.hears(/^English$/, async ctx => {
  register(ctx);
  setLang(ctx.from.id, "en");
  states.delete(ctx.from.id);
  await ctx.reply("ShanMaACxNo1 UC BOT\n\nWelcome to our UC Store.\nPlease choose an option below.", {
    reply_markup: mainMenu(ctx.from.id)
  });
});

bot.hears(/^(UC Menu|UC ဝယ်မည်)$/, async ctx => {
  register(ctx);
  const l = getLang(ctx.from.id);

  if (!shopOpen()) {
    const msg = l === "mm"
      ? "ဆိုင်ပိတ်ပါပြီ။\n\nဒီနေ့အတွက် UC အမှာစာအသစ်များ လက်မခံတော့ပါ။\n\nဆိုင်ဖွင့်ချိန်\nမနက် ၉:၀၀ မှ ည ၁၁:၀၀ အထိ\n\nမနက် ၉:၀၀ တွင် ပြန်လည်ဖွင့်ပါမည်။"
      : "The shop is currently closed.\n\nNew UC orders are not being accepted right now.\n\nOpening Hours\n9:00 AM - 11:00 PM\n\nThe shop will reopen at 9:00 AM.";
    return ctx.reply(msg, { reply_markup: mainMenu(ctx.from.id) });
  }

  states.delete(ctx.from.id);
  await ctx.reply(l === "mm" ? "ဝယ်ယူလိုသော UC ပမာဏကို ရွေးချယ်ပါ။" : "Select the UC package you want to buy.", {
    reply_markup: ucMenu(ctx.from.id)
  });
});

bot.hears(/^(Price List|ဈေးနှုန်းများ)$/, async ctx => {
  register(ctx);
  await ctx.reply(priceText(getLang(ctx.from.id)), { reply_markup: mainMenu(ctx.from.id) });
});

bot.hears(/^(60|120|180|240|325|385|660|720|985|1320|1500|1800|2460|3850|8100) UC$/, async ctx => {
  const id = ctx.from.id;
  const l = getLang(id);

  if (!shopOpen()) {
    states.delete(id);
    return ctx.reply(
      l === "mm"
        ? "ဆိုင်ပိတ်ပါပြီ။\n\nအမှာစာအသစ်များကို မနက် ၉:၀၀ မှ ပြန်လည်လက်ခံပါမည်။"
        : "The shop is closed.\n\nNew orders will be accepted again from 9:00 AM.",
      { reply_markup: mainMenu(id) }
    );
  }

  const pack = ctx.match[1];
  const price = PRICES[pack];
  states.set(id, { step: "PUBG_ID", pack, price });

  await ctx.reply(
    l === "mm"
      ? pack + " UC ကို ရွေးချယ်ထားပါသည်။\n\nကျသင့်ငွေ - " + price.toLocaleString() + " ကျပ်\n\nသင်၏ PUBG ID ကို ပို့ပေးပါ။"
      : "Selected Package\n\nUC Package: " + pack + " UC\nPrice: " + price.toLocaleString() + " Ks\n\nSend your PUBG ID.",
    { reply_markup: cancelMenu(id) }
  );
});

bot.hears(/^(Back|နောက်သို့)$/, async ctx => {
  states.delete(ctx.from.id);
  await ctx.reply(getLang(ctx.from.id) === "mm" ? "ပင်မစာမျက်နှာ" : "Main Menu", {
    reply_markup: mainMenu(ctx.from.id)
  });
});

bot.hears(/^(Cancel Order|အမှာစာ ပယ်ဖျက်မည်)$/, async ctx => {
  const id = ctx.from.id;
  const s = states.get(id);
  if (s?.orderId && db.orders[s.orderId]?.status === "WAITING_SCREENSHOT") {
    db.orders[s.orderId].status = "CANCELLED";
    save();
  }
  states.delete(id);
  await ctx.reply(getLang(id) === "mm" ? "အမှာစာကို ပယ်ဖျက်ပြီးပါပြီ။" : "Order cancelled.", {
    reply_markup: mainMenu(id)
  });
});

bot.hears(/^Help$|^အကူအညီ$/, async ctx => {
  const l = getLang(ctx.from.id);
  const msg = l === "mm"
    ? "UC ဝယ်ယူနည်း\n\n၁။ UC ဝယ်မည် ကို နှိပ်ပါ။\n၂။ UC ပမာဏကို ရွေးပါ။\n၃။ PUBG ID ကို ပို့ပါ။\n၄။ ပြထားသော KBZPay သို့ ကျသင့်ငွေအတိုင်း လွှဲပါ။\n၅။ ငွေလွှဲရာတွင် အသုံးပြုသော KBZPay ဖုန်းနံပါတ်ကို ပို့ပါ။\n၆။ ငွေလွှဲပြေစာ Screenshot ကို ပို့ပါ။\n\nခန့်မှန်းဆောင်ရွက်ချိန်\nပုံမှန်အားဖြင့် ၁၅ မိနစ်အတွင်း\n\nKBZPay\nဖုန်းနံပါတ် - " + KBZ_NUMBER + "\nအကောင့်အမည် - " + KBZ_NAME + "\n\nဆိုင်ဖွင့်ချိန်\nမနက် ၉:၀၀ မှ ည ၁၁:၀၀ အထိ"
    : "How to Buy UC\n\n1. Press UC Menu.\n2. Choose a UC package.\n3. Send your PUBG ID.\n4. Transfer the exact amount to the KBZPay account shown.\n5. Send the KBZPay phone number used for payment.\n6. Send the payment screenshot.\n\nEstimated processing time\nUsually within 15 minutes\n\nKBZPay\nNumber: " + KBZ_NUMBER + "\nAccount Name: " + KBZ_NAME + "\n\nOpening Hours\n9:00 AM - 11:00 PM";
  await ctx.reply(msg, { reply_markup: mainMenu(ctx.from.id) });
});

bot.hears(/^(My Orders|ကျွန်ုပ်၏အမှာစာများ)$/, async ctx => {
  const id = ctx.from.id;
  const l = getLang(id);
  const list = Object.values(db.orders)
    .filter(o => String(o.userId) === String(id))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 10);

  if (!list.length) {
    return ctx.reply(l === "mm" ? "အမှာစာ မရှိသေးပါ။" : "You do not have any orders yet.", {
      reply_markup: mainMenu(id)
    });
  }

  const blocks = list.map(o => l === "mm"
    ? "အမှာစာအမှတ် - " + o.id + "\nPUBG ID - " + o.pubgId + "\nUC - " + o.ucPack + "\nကျသင့်ငွေ - " + Number(o.price).toLocaleString() + " ကျပ်\nအခြေအနေ - " + statusText(o.status, l)
    : "Order ID: " + o.id + "\nPUBG ID: " + o.pubgId + "\nUC Package: " + o.ucPack + " UC\nAmount: " + Number(o.price).toLocaleString() + " Ks\nStatus: " + statusText(o.status, l)
  );

  await ctx.reply((l === "mm" ? "ကျွန်ုပ်၏အမှာစာများ" : "My Orders") + "\n\n" + blocks.join("\n\n"), {
    reply_markup: mainMenu(id)
  });
});

bot.hears(/^(Admin Panel|စီမံခန့်ခွဲမှု)$/, async ctx => {
  if (!isAdmin(ctx.from.id)) return;
  states.delete(ctx.from.id);

  const all = Object.values(db.orders);
  const count = s => all.filter(o => o.status === s).length;

  await ctx.reply(
    "Admin Panel\n\nTotal Orders: " + all.length +
    "\nPending: " + count("PENDING_ADMIN") +
    "\nApproved: " + count("APPROVED") +
    "\nDelivered: " + count("DELIVERED") +
    "\nRejected: " + count("REJECTED"),
    { reply_markup: adminMenu() }
  );
});

async function showAdminOrders(ctx, wanted) {
  if (!isAdmin(ctx.from.id)) return;
  const list = Object.values(db.orders)
    .filter(o => o.status === wanted)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 10);

  if (!list.length) return ctx.reply("No orders found.", { reply_markup: adminMenu() });

  for (const o of list) {
    const common = {
      chat_id: ctx.from.id,
      caption: adminOrderText(o),
      reply_markup: adminButtons(o.id)
    };
    if (o.paymentFileType === "photo" && o.paymentFile) {
      await bot.api.sendPhoto({ ...common, photo: o.paymentFile });
    } else if (o.paymentFile) {
      await bot.api.sendDocument({ ...common, document: o.paymentFile });
    } else {
      await ctx.reply(adminOrderText(o));
    }
  }
}

bot.hears(/^Pending Orders$/, ctx => showAdminOrders(ctx, "PENDING_ADMIN"));
bot.hears(/^Approved Orders$/, ctx => showAdminOrders(ctx, "APPROVED"));
bot.hears(/^Delivered Orders$/, ctx => showAdminOrders(ctx, "DELIVERED"));
bot.hears(/^Rejected Orders$/, ctx => showAdminOrders(ctx, "REJECTED"));

function profitSummary(list) {
  let revenue = 0, cost = 0, profit = 0, missing = 0;
  for (const o of list) {
    revenue += Number(o.price) || 0;
    if (o.costPrice === null || o.costPrice === undefined) {
      missing++;
      continue;
    }
    cost += Number(o.costPrice) || 0;
    profit += Number(o.profit) || 0;
  }
  return { orders: list.length, revenue, cost, profit, missing };
}

function profitBlock(title, x) {
  return title +
    "\nOrders: " + x.orders +
    "\nRevenue: " + x.revenue.toLocaleString() + " Ks" +
    "\nCost: " + x.cost.toLocaleString() + " Ks" +
    "\nProfit: " + x.profit.toLocaleString() + " Ks" +
    "\nOrders without cost: " + x.missing;
}

bot.hears(/^Profit Report$/, async ctx => {
  if (!isAdmin(ctx.from.id)) return;

  const delivered = Object.values(db.orders).filter(o => o.status === "DELIVERED" && o.deliveredAt);
  const today = dateKey();
  const month = monthKey();

  const td = profitSummary(delivered.filter(o => dateKey(new Date(o.deliveredAt)) === today));
  const mo = profitSummary(delivered.filter(o => monthKey(new Date(o.deliveredAt)) === month));
  const all = profitSummary(delivered);

  await ctx.reply(
    "Profit Report\n\n" +
    profitBlock("Today", td) + "\n\n" +
    profitBlock("This Month", mo) + "\n\n" +
    profitBlock("All Time", all),
    { reply_markup: adminMenu() }
  );
});

bot.hears(/^Set UC Cost$/, async ctx => {
  if (!isAdmin(ctx.from.id)) return;
  states.set(ctx.from.id, { step: "SET_COST" });
  await ctx.reply(
    "Set your UC buying cost.\n\nSend one or more lines like:\n\n60 4500\n120 9000\n660 43000\n\nSend cancel to stop.",
    { reply_markup: { remove_keyboard: true } }
  );
});

bot.hears(/^Main Menu$/, async ctx => {
  if (!isAdmin(ctx.from.id)) return;
  states.delete(ctx.from.id);
  await ctx.reply("Main Menu", { reply_markup: mainMenu(ctx.from.id) });
});

bot.on("message", async ctx => {
  const msg = ctx.message;
  if (!msg) return;

  const id = ctx.from.id;
  const s = states.get(id);
  if (!s) return;

  const text = typeof msg.text === "string" ? msg.text.trim() : null;
  if (text && CONTROL_TEXTS.has(text)) return;

  if (s.step === "SET_COST" && isAdmin(id)) {
    if (!text) return;

    if (text.toLowerCase() === "cancel") {
      states.delete(id);
      return ctx.reply("Cost update cancelled.", { reply_markup: adminMenu() });
    }

    const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const saved = [];
    const failed = [];

    for (const line of lines) {
      const m = line.match(/^(\d+)\s+(\d+)$/);
      if (!m || !Object.prototype.hasOwnProperty.call(PRICES, m[1])) {
        failed.push(line);
        continue;
      }
      const cost = Number(m[2]);
      if (!Number.isFinite(cost) || cost < 0) {
        failed.push(line);
        continue;
      }
      db.costs[m[1]] = cost;
      saved.push(m[1] + " UC = " + cost.toLocaleString() + " Ks");
    }

    save();
    if (!saved.length) return ctx.reply("No valid cost was found. Example: 660 43000");

    states.delete(id);
    let reply = "Saved UC Costs\n\n" + saved.join("\n");
    if (failed.length) reply += "\n\nCould not read:\n" + failed.join("\n");
    return ctx.reply(reply, { reply_markup: adminMenu() });
  }

  const l = getLang(id);

  if (s.step === "PUBG_ID") {
    if (!text || !/^\d{5,20}$/.test(text)) {
      return ctx.reply(l === "mm" ? "PUBG ID မမှန်ပါ။ နံပါတ်များသာ ပို့ပေးပါ။" : "Invalid PUBG ID. Send numbers only.");
    }

    s.pubgId = text;
    s.step = "PHONE";
    states.set(id, s);

    const message = l === "mm"
      ? "PUBG ID - " + s.pubgId +
        "\nUC - " + s.pack +
        "\nကျသင့်ငွေ - " + s.price.toLocaleString() + " ကျပ်" +
        "\n\nKBZPay" +
        "\nဖုန်းနံပါတ် - " + KBZ_NUMBER +
        "\nအကောင့်အမည် - " + KBZ_NAME +
        "\n\n" + s.price.toLocaleString() + " ကျပ် တိတိကျကျ လွှဲပေးပါ။" +
        "\n\nခန့်မှန်းဆောင်ရွက်ချိန်\nပုံမှန်အားဖြင့် ၁၅ မိနစ်အတွင်း" +
        "\n\nငွေလွှဲပြီးပါက ငွေလွှဲရာတွင် အသုံးပြုခဲ့သော KBZPay ဖုန်းနံပါတ်ကို ပို့ပေးပါ။"
      : "PUBG ID: " + s.pubgId +
        "\nUC Package: " + s.pack + " UC" +
        "\nAmount to Pay: " + s.price.toLocaleString() + " Ks" +
        "\n\nKBZPay" +
        "\nNumber: " + KBZ_NUMBER +
        "\nAccount Name: " + KBZ_NAME +
        "\n\nPlease transfer exactly " + s.price.toLocaleString() + " Ks." +
        "\n\nEstimated processing time\nUsually within 15 minutes" +
        "\n\nAfter payment, send the KBZPay phone number used for this payment.";

    return ctx.reply(message, { reply_markup: cancelMenu(id) });
  }

  if (s.step === "PHONE") {
    if (!text) return;

    const phone = text.replace(/[\s-]/g, "");
    if (!/^\+?\d{7,20}$/.test(phone)) {
      return ctx.reply(l === "mm" ? "ဖုန်းနံပါတ် မမှန်ပါ။ ပြန်လည်ပို့ပေးပါ။" : "Invalid phone number. Please send it again.");
    }

    const oid = newOrderId();
    s.phone = phone;
    s.orderId = oid;
    s.step = "SCREENSHOT";
    states.set(id, s);

    const user = db.users[String(id)] || {};
    db.orders[oid] = {
      id: oid,
      userId: id,
      name: user.name || "Unknown",
      username: user.username || "",
      language: l,
      pubgId: s.pubgId,
      ucPack: s.pack,
      price: s.price,
      paymentMethod: "KBZPay",
      phone,
      paymentFile: null,
      paymentFileType: null,
      status: "WAITING_SCREENSHOT",
      createdAt: displayTime(),
      createdAtIso: new Date().toISOString(),
      timestamp: Date.now(),
      costPrice: null,
      profit: null,
      deliveredAt: null
    };
    save();

    const message = l === "mm"
      ? "အမှာစာအမှတ် - " + oid +
        "\n\nPUBG ID - " + s.pubgId +
        "\nUC - " + s.pack +
        "\nကျသင့်ငွေ - " + s.price.toLocaleString() + " ကျပ်" +
        "\nငွေလွှဲဖုန်းနံပါတ် - " + phone +
        "\n\nငွေလွှဲပြေစာ Screenshot ကို ပို့ပေးပါ။" +
        "\n\nခန့်မှန်းဆောင်ရွက်ချိန်\nပုံမှန်အားဖြင့် ၁၅ မိနစ်အတွင်း"
      : "Order ID: " + oid +
        "\n\nPUBG ID: " + s.pubgId +
        "\nUC Package: " + s.pack + " UC" +
        "\nAmount: " + s.price.toLocaleString() + " Ks" +
        "\nPayer Phone: " + phone +
        "\n\nSend your payment screenshot here." +
        "\n\nEstimated processing time\nUsually within 15 minutes";

    return ctx.reply(message, { reply_markup: cancelMenu(id) });
  }

  if (s.step === "SCREENSHOT") {
    let fileId = null;
    let fileType = null;

    if (msg.photo?.length) {
      fileId = msg.photo[msg.photo.length - 1].file_id;
      fileType = "photo";
    } else if (msg.document) {
      fileId = msg.document.file_id;
      fileType = "document";
    } else {
      return ctx.reply(l === "mm" ? "ငွေလွှဲပြေစာ Screenshot ကို ဓာတ်ပုံ သို့မဟုတ် ဖိုင်အဖြစ် ပို့ပေးပါ။" : "Please send the payment screenshot as a photo or document.");
    }

    const o = db.orders[s.orderId];
    if (!o) {
      states.delete(id);
      return ctx.reply(l === "mm" ? "အမှာစာကို ရှာမတွေ့ပါ။ ပြန်လည်စတင်ပေးပါ။" : "Order not found. Please start again.", {
        reply_markup: mainMenu(id)
      });
    }

    o.paymentFile = fileId;
    o.paymentFileType = fileType;
    o.status = "PENDING_ADMIN";
    o.submittedAt = new Date().toISOString();
    save();
    states.delete(id);

    const message = l === "mm"
      ? "ငွေလွှဲပြေစာကို လက်ခံရရှိပါပြီ။" +
        "\n\nအမှာစာအမှတ် - " + o.id +
        "\nPUBG ID - " + o.pubgId +
        "\nUC - " + o.ucPack +
        "\nကျသင့်ငွေ - " + Number(o.price).toLocaleString() + " ကျပ်" +
        "\n\nအခြေအနေ - စစ်ဆေးနေသည်" +
        "\n\nခန့်မှန်းဆောင်ရွက်ချိန်\nပုံမှန်အားဖြင့် ၁၅ မိနစ်အတွင်း" +
        "\n\nအမှာစာကို စစ်ဆေးပြီး ဆောင်ရွက်ပေးနေပါသည်။"
      : "Payment screenshot received." +
        "\n\nOrder ID: " + o.id +
        "\nPUBG ID: " + o.pubgId +
        "\nUC Package: " + o.ucPack + " UC" +
        "\nAmount: " + Number(o.price).toLocaleString() + " Ks" +
        "\n\nStatus: Pending Admin" +
        "\n\nEstimated processing time\nUsually within 15 minutes" +
        "\n\nPlease wait while we verify and process your order.";

    await ctx.reply(message, { reply_markup: mainMenu(id) });

    try {
      await sendAdminOrder(o);
    } catch (e) {
      console.error("Admin notification error:", e);
      await ctx.reply(l === "mm"
        ? "အမှာစာကို သိမ်းဆည်းထားပြီးဖြစ်သော်လည်း စီမံခန့်ခွဲသူထံ အကြောင်းကြားချက် မပို့နိုင်ခဲ့ပါ။"
        : "Your order was saved, but the admin notification could not be sent.");
    }
  }
});

bot.on("callback_query", async ctx => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCallbackQuery({ text: "Access denied." });
  }

  const raw = ctx.callbackQuery?.data;
  if (!raw) return;

  const [action, oid] = raw.split(":");
  const o = db.orders[oid];
  if (!o) return ctx.answerCallbackQuery({ text: "Order not found." });

  if (action === "approve") {
    if (o.status !== "PENDING_ADMIN") {
      return ctx.answerCallbackQuery({ text: "Cannot approve: " + o.status });
    }

    o.status = "APPROVED";
    o.approvedAt = new Date().toISOString();
    save();

    await ctx.answerCallbackQuery({ text: "Order approved." });
    await bot.api.sendMessage({
      chat_id: o.userId,
      text: o.language === "mm"
        ? "ငွေပေးချေမှု အတည်ပြုပြီးပါပြီ။\n\nအမှာစာအမှတ် - " + o.id + "\nPUBG ID - " + o.pubgId + "\nUC - " + o.ucPack + "\n\nသင့်အမှာစာကို ဆက်လက်ဆောင်ရွက်နေပါသည်။"
        : "Payment Approved\n\nOrder ID: " + o.id + "\nPUBG ID: " + o.pubgId + "\nUC Package: " + o.ucPack + " UC\n\nYour order is now being processed."
    });
    return;
  }

  if (action === "reject") {
    if (o.status !== "PENDING_ADMIN") {
      return ctx.answerCallbackQuery({ text: "Cannot reject: " + o.status });
    }

    o.status = "REJECTED";
    o.rejectedAt = new Date().toISOString();
    save();

    await ctx.answerCallbackQuery({ text: "Order rejected." });
    await bot.api.sendMessage({
      chat_id: o.userId,
      text: o.language === "mm"
        ? "အမှာစာကို အတည်မပြုနိုင်ပါ။\n\nအမှာစာအမှတ် - " + o.id + "\nPUBG ID - " + o.pubgId + "\nUC - " + o.ucPack + "\n\nငွေပေးချေမှုကို စစ်ဆေးရန် ဆိုင်ကို ဆက်သွယ်ပေးပါ။"
        : "Order Rejected\n\nOrder ID: " + o.id + "\nPUBG ID: " + o.pubgId + "\nUC Package: " + o.ucPack + " UC\n\nPlease contact support."
    });
    return;
  }

  if (action === "delivered") {
    if (o.status !== "APPROVED") {
      return ctx.answerCallbackQuery({ text: "Approve the order first." });
    }

    const cost = db.costs[o.ucPack] !== undefined ? Number(db.costs[o.ucPack]) : null;
    o.status = "DELIVERED";
    o.deliveredAt = new Date().toISOString();
    o.costPrice = cost;
    o.profit = cost === null ? null : Number(o.price) - cost;
    save();

    await ctx.answerCallbackQuery({ text: "Order marked delivered." });
    await bot.api.sendMessage({
      chat_id: o.userId,
      text: o.language === "mm"
        ? "အမှာစာ ပို့ဆောင်ပြီးပါပြီ။\n\nအမှာစာအမှတ် - " + o.id + "\nPUBG ID - " + o.pubgId + "\nUC - " + o.ucPack + "\n\nဝယ်ယူအားပေးမှုအတွက် ကျေးဇူးတင်ပါသည်။"
        : "Order Delivered\n\nOrder ID: " + o.id + "\nPUBG ID: " + o.pubgId + "\nUC Package: " + o.ucPack + " UC\n\nYour UC order has been completed.\nThank you for your purchase."
    });
  }
});

async function broadcastClose() {
  for (const u of Object.values(db.users)) {
    if (isAdmin(u.id)) continue;
    const message = u.language === "mm"
      ? "ဆိုင်ပိတ်ပါပြီ။\n\nဒီနေ့အတွက် UC အမှာစာအသစ်များ လက်မခံတော့ပါ။\n\nဆိုင်ဖွင့်ချိန်\nမနက် ၉:၀၀ မှ ည ၁၁:၀၀ အထိ\n\nမနက် ၉:၀၀ တွင် ပြန်လည်ဖွင့်ပါမည်။"
      : "The shop is now closed.\n\nNew UC orders are closed for today.\n\nOpening Hours\n9:00 AM - 11:00 PM\n\nThe shop will reopen at 9:00 AM.";
    try {
      await bot.api.sendMessage({ chat_id: u.id, text: message });
    } catch (e) {
      console.error("Closing message failed for", u.id);
    }
  }
}

async function checkClosing() {
  const now = mmParts();
  const today = dateKey();

  if (
    now.hour === CLOSE_HOUR &&
    now.minute < 5 &&
    db.system.lastCloseDate !== today
  ) {
    db.system.lastCloseDate = today;
    save();
    await broadcastClose();
  }
}

setInterval(() => checkClosing().catch(console.error), 30000);
checkClosing().catch(console.error);

bot.catch(error => console.error("Bot error:", error));

bot.startPolling()
  .then(() => {
    console.log("ShanMaACxNo1 UC BOT is running.");
    console.log("Bot online 24/7. New orders: 9:00 AM - 11:00 PM Myanmar time.");
  })
  .catch(error => console.error("Polling failed:", error));