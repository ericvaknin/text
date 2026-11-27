// Finance — Scriptable widget
// Shows Amex checking 7897, upcoming bills, and card balances from:
// the private Finance-Widget-Data repo (finance.json and cards.json)
// This is a snapshot. It does not update itself until those files are republished.
//
// Sizes: small, medium, and large keep the existing compact layouts.
// extraLargePortrait (iOS / iPadOS 27, Scriptable 1.8.3+) is the full-height
// 4x6 Home Screen widget and shows the complete dashboard.
// extraLarge (iPad landscape) uses the same content in two columns.
// Unrecognized families fall back to the large layout.

// Paste your Finance-Widget-Data token between the quotes below:
const MY_TOKEN = "PASTE_TOKEN_HERE"

const FEED_URL = "https://api.github.com/repos/ericvaknin/Finance-Widget-Data/contents/finance.json"
const CARDS_URL = "https://api.github.com/repos/ericvaknin/Finance-Widget-Data/contents/cards.json"
const CACHE_NAME = "finance-widget-cache.json"
const CARDS_CACHE_NAME = "finance-widget-cards-cache.json"
const TOKEN_KEY = "financeDataToken"

const COLORS = {
  bg: new Color("#0E0E10"),
  card: new Color("#1C1C1E"),
  divider: new Color("#3A3A3C", 0.55),
  title: Color.white(),
  meta: new Color("#8E8E93"),
  name: Color.white(),
  positive: new Color("#30D158"),
  moneyIn: new Color("#30D158"),
  moneyOut: new Color("#FF453A"),
  error: new Color("#FF9F0A")
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// --- helpers (pure) ---

function formatMoney(n) {
  const num = Number(n)
  if (!isFinite(num)) return "—"
  const sign = num < 0 ? "-" : ""
  const parts = Math.abs(num).toFixed(2).split(".")
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  if (parts[1] === "00") return sign + "$" + parts[0]
  return sign + "$" + parts[0] + "." + parts[1]
}

function combinedBalance(checking) {
  if (!checking) return 0
  return (Number(checking.posted) || 0) + (Number(checking.pending) || 0)
}

function sortBills(bills) {
  return (bills || []).slice().sort((a, b) => {
    const da = (a && (a.due_sort || a.due_iso)) || ""
    const db = (b && (b.due_sort || b.due_iso)) || ""
    if (da !== db) return da < db ? -1 : 1
    return String((a && a.bill) || "").localeCompare(String((b && b.bill) || ""))
  })
}

function billsOfKind(bills, kind) {
  return sortBills((bills || []).filter((b) => b && b.kind === kind))
}

function isScheduled(bill) {
  if (!bill) return false
  if (bill.scheduled === true) return true
  return /^\s*scheduled\b/i.test(String(bill.note || ""))
}

function visibleBills(bills) {
  return (bills || []).filter((b) => !isScheduled(b))
}

function billsInTotals(bills) {
  return (bills || []).filter((b) => b && b.in_totals !== false)
}

function sumAmounts(items, key) {
  return (items || []).reduce((n, item) => n + (Number(item && item[key]) || 0), 0)
}

function leftoverColor(n) {
  const num = Number(n)
  if (!isFinite(num)) return COLORS.meta
  if (num < 0) return COLORS.moneyOut
  return COLORS.moneyIn
}

function formatDue(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ""
  const month = MONTHS[Number(m[2]) - 1]
  if (!month) return ""
  return month + " " + Number(m[3])
}

function sortCards(cards) {
  return (cards || []).slice().sort((a, b) => {
    const ba = Number(a && a.balance)
    const bb = Number(b && b.balance)
    const na = isFinite(ba) ? ba : 0
    const nb = isFinite(bb) ? bb : 0
    if (na !== nb) return nb - na
    const name = String((a && a.name) || "").localeCompare(String((b && b.name) || ""))
    if (name) return name
    return String((a && a.last4) || "").localeCompare(String((b && b.last4) || ""))
  })
}

function cardLabel(card) {
  const name = String((card && card.name) || "Card")
  const last4 = card && card.last4 ? String(card.last4) : ""
  return last4 ? name + " " + last4 : name
}

function isTallFamily(family) {
  return family === "extraLargePortrait" || family === "systemExtraLargePortrait"
}

function isWideFamily(family) {
  return family === "extraLarge" || family === "systemExtraLarge"
}

function isFullFamily(family) {
  return isTallFamily(family) || isWideFamily(family)
}

function billLimit(family) {
  if (family === "small") return 1
  if (family === "large") return 4
  if (isFullFamily(family)) return 24
  return 3
}

function updatedLabel(data, fromCache, family) {
  if (!data) return family === "small" ? "Unavailable" : "Updated —"
  const stamp = data.updated ? String(data.updated) : ""
  if (family === "small") {
    if (!stamp) return fromCache ? "cached" : ""
    return stamp + (fromCache ? " · cached" : "")
  }
  if (!stamp) return fromCache ? "Updated · cached" : "Updated —"
  return "Updated " + stamp + (fromCache ? " · cached" : "")
}

function isValidFeed(json) {
  return !!(json && json.checking && typeof json.checking === "object" && Array.isArray(json.bills))
}

function isValidCardsFeed(json) {
  return !!(json && Array.isArray(json.cards))
}

function contentWidth(family) {
  const screen = Device.screenSize()
  const short = Math.min(screen.width, screen.height)
  const long = Math.max(screen.width, screen.height)
  const key = Math.round(short) + "x" + Math.round(long)
  const tall = {
    "430x932": 364,
    "428x926": 364,
    "414x896": 360,
    "414x736": 348,
    "393x852": 338,
    "390x844": 338,
    "375x812": 329,
    "375x667": 321,
    "360x780": 329,
    "320x568": 292
  }
  if (isWideFamily(family)) return Math.max(600, Math.round(short - 40))
  const width = tall[key]
  if (width) return width
  return 338
}

// --- end helpers ---

async function getToken() {
  const own = MY_TOKEN.replace(/\s+/g, "")
  if (own && own !== "PASTE_TOKEN_HERE") return own
  let saved = null
  try { if (Keychain.contains(TOKEN_KEY)) saved = Keychain.get(TOKEN_KEY) } catch (e) {}
  if (saved) return saved
  if (!config.runsInApp) return null
  const a = new Alert()
  a.title = "GitHub token"
  a.message = "Copy your Finance-Widget-Data token first (from Notes), then tap Use Copied Token. It is saved on this phone only."
  a.addAction("Use Copied Token")
  a.addCancelAction("Cancel")
  if ((await a.presentAlert()) === -1) return null
  const t = String(Pasteboard.pasteString() || "").replace(/\s+/g, "")
  if (!t || t.length < 20) {
    await showMsg("No token found", "Your clipboard doesn't have the token. Copy it from Notes and run again.")
    return null
  }
  try { Keychain.set(TOKEN_KEY, t) } catch (e) { await showMsg("Could not save token", String(e)) }
  return t
}

async function showMsg(title, msg) {
  if (!config.runsInApp) return
  const b = new Alert()
  b.title = title
  b.message = msg
  b.addAction("OK")
  await b.presentAlert()
}

async function loadGithubJson(token, fm, url, cacheName, validate, opts) {
  const cachePath = fm.joinPath(fm.documentsDirectory(), cacheName)
  let data = null
  let fromCache = false
  try {
    if (!token) throw new Error("No token")
    const req = new Request(url + "?t=" + Date.now())
    req.headers = { "Authorization": "Bearer " + token, "Accept": "application/vnd.github.raw+json" }
    req.timeoutInterval = 8
    const raw = await req.loadString()
    const code = req.response ? req.response.statusCode : 0
    if (code === 401 || code === 403 || (opts && opts.clearOn404 && code === 404)) {
      try { Keychain.remove(TOKEN_KEY) } catch (e) {}
      throw new Error("GitHub said " + code + ". The token was rejected or can't see Finance-Widget-Data. Run again and paste the Finance-Widget-Data token.")
    }
    if (code === 404) throw new Error("GitHub said 404.")
    const json = JSON.parse(raw)
    if (!validate(json)) throw new Error("Bad data (status " + code + ")")
    data = json
    fm.writeString(cachePath, JSON.stringify(json))
  } catch (e) {
    if (opts && opts.alert) {
      await showMsg("Couldn't load fresh data", String(e && e.message ? e.message : e))
    }
    if (fm.fileExists(cachePath)) {
      try {
        data = JSON.parse(fm.readString(cachePath))
        fromCache = true
      } catch (e2) {
        data = null
      }
    }
  }
  return { data, fromCache }
}

async function loadFeeds() {
  const fm = FileManager.local()
  const token = await getToken()
  const finance = await loadGithubJson(token, fm, FEED_URL, CACHE_NAME, isValidFeed, {
    alert: true,
    clearOn404: true
  })
  const cards = await loadGithubJson(token, fm, CARDS_URL, CARDS_CACHE_NAME, isValidCardsFeed, {
    alert: false,
    clearOn404: false
  })
  return { finance, cards }
}

function addMetricColumn(parent, label, value, fontSize) {
  const col = parent.addStack()
  col.layoutVertically()
  const l = col.addText(label)
  l.font = Font.systemFont(10)
  l.textColor = COLORS.meta
  l.lineLimit = 1
  const v = col.addText(value)
  v.font = Font.semiboldSystemFont(fontSize)
  v.textColor = COLORS.title
  v.lineLimit = 1
  v.minimumScaleFactor = 0.7
  return col
}

function addInlineMetric(parent, label, value) {
  const row = parent.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()
  const l = row.addText(label)
  l.font = Font.systemFont(10)
  l.textColor = COLORS.meta
  l.lineLimit = 1
  l.minimumScaleFactor = 0.8
  row.addSpacer(8)
  const v = row.addText(value)
  v.font = Font.semiboldSystemFont(13)
  v.textColor = COLORS.title
  v.lineLimit = 1
  v.minimumScaleFactor = 0.7
  return row
}

function addPendingLine(parent, checking, size) {
  const pendingAmt = Number(checking.pending) || 0
  const text = pendingAmt !== 0
    ? "+" + formatMoney(pendingAmt) + " pending"
    : "No pending deposits"
  const p = parent.addText(text)
  p.font = Font.systemFont(size)
  p.textColor = pendingAmt !== 0 ? COLORS.positive : COLORS.meta
  p.lineLimit = 1
  p.minimumScaleFactor = 0.8
  return p
}

function addPostedLine(parent, checking, size) {
  const posted = parent.addText(formatMoney(checking.posted))
  posted.font = Font.boldSystemFont(size)
  posted.textColor = COLORS.title
  posted.lineLimit = 1
  posted.minimumScaleFactor = 0.7
  return posted
}

function addBillRow(parent, bill, compact) {
  const row = parent.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  const dueStack = row.addStack()
  dueStack.layoutHorizontally()
  dueStack.centerAlignContent()
  dueStack.size = new Size(compact ? 68 : 82, 14)
  const due = dueStack.addText(bill.due || "")
  due.font = Font.systemFont(compact ? 11 : 12)
  due.textColor = COLORS.meta
  due.lineLimit = 1
  due.minimumScaleFactor = 0.7

  row.addSpacer(6)

  const name = row.addText(bill.bill || "Bill")
  name.font = Font.semiboldSystemFont(compact ? 11 : 12)
  name.textColor = COLORS.name
  name.lineLimit = 1
  name.minimumScaleFactor = 0.8

  row.addSpacer()

  const amt = row.addText(formatMoney(bill.amount))
  amt.font = Font.semiboldSystemFont(compact ? 11 : 12)
  amt.textColor = COLORS.title
  amt.lineLimit = 1
  amt.minimumScaleFactor = 0.8
  return row
}

function addPanel(parent) {
  const panel = parent.addStack()
  panel.layoutVertically()
  panel.backgroundColor = COLORS.card
  panel.cornerRadius = 12
  panel.setPadding(10, 12, 10, 12)
  return panel
}

function addSectionHeader(parent, title, trailing, trailingColor) {
  const row = parent.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()
  const t = row.addText(title)
  t.font = Font.semiboldSystemFont(11)
  t.textColor = COLORS.meta
  t.lineLimit = 1
  if (trailing != null && trailing !== "") {
    row.addSpacer()
    const r = row.addText(String(trailing))
    r.font = Font.semiboldSystemFont(11)
    r.textColor = trailingColor || COLORS.meta
    r.lineLimit = 1
    r.minimumScaleFactor = 0.7
  }
  return row
}

function addDivider(parent, width) {
  parent.addSpacer(8)
  const line = parent.addStack()
  line.backgroundColor = COLORS.divider
  line.cornerRadius = 1
  line.size = new Size(width, 1)
  parent.addSpacer(8)
}

function addFlowBar(parent, inAmt, outAmt, width) {
  const inVal = Math.max(0, Number(inAmt) || 0)
  const outVal = Math.max(0, Number(outAmt) || 0)
  const total = inVal + outVal
  const barW = Math.max(80, width)
  const barH = 6

  const labels = parent.addStack()
  labels.layoutHorizontally()
  labels.centerAlignContent()
  const inL = labels.addText("In  " + formatMoney(inVal))
  inL.font = Font.semiboldSystemFont(11)
  inL.textColor = COLORS.moneyIn
  inL.lineLimit = 1
  inL.minimumScaleFactor = 0.7
  labels.addSpacer()
  const outL = labels.addText("Out  " + formatMoney(outVal))
  outL.font = Font.semiboldSystemFont(11)
  outL.textColor = COLORS.moneyOut
  outL.lineLimit = 1
  outL.minimumScaleFactor = 0.7

  parent.addSpacer(6)
  const bar = parent.addStack()
  bar.layoutHorizontally()
  bar.cornerRadius = 3
  bar.size = new Size(barW, barH)
  if (total <= 0) {
    const empty = bar.addStack()
    empty.backgroundColor = COLORS.divider
    empty.size = new Size(barW, barH)
    return
  }
  const inW = Math.max(3, Math.round((barW - 2) * (inVal / total)))
  const outW = Math.max(3, barW - 2 - inW)
  const inSeg = bar.addStack()
  inSeg.backgroundColor = COLORS.moneyIn
  inSeg.size = new Size(inW, barH)
  bar.addSpacer(2)
  const outSeg = bar.addStack()
  outSeg.backgroundColor = COLORS.moneyOut
  outSeg.size = new Size(outW, barH)
}

function addLeftoverRow(parent, label, value) {
  const row = parent.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()
  const l = row.addText(label)
  l.font = Font.systemFont(11)
  l.textColor = COLORS.meta
  l.lineLimit = 1
  row.addSpacer()
  const v = row.addText(formatMoney(value))
  v.font = Font.semiboldSystemFont(14)
  v.textColor = leftoverColor(value)
  v.lineLimit = 1
  v.minimumScaleFactor = 0.7
  return row
}

function billMarker(bill) {
  if (!bill) return ""
  if (bill.in_totals === false) return "excl"
  return ""
}

function addFullBillRow(parent, bill, dueWidth) {
  const row = parent.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  const dueStack = row.addStack()
  dueStack.layoutHorizontally()
  dueStack.centerAlignContent()
  dueStack.size = new Size(dueWidth, 13)
  const due = dueStack.addText(bill.due || "")
  due.font = Font.systemFont(10)
  due.textColor = COLORS.meta
  due.lineLimit = 1
  due.minimumScaleFactor = 0.6

  row.addSpacer(5)

  const name = row.addText(bill.bill || "Bill")
  name.font = Font.mediumSystemFont(11)
  name.textColor = COLORS.name
  name.lineLimit = 1
  name.minimumScaleFactor = 0.7

  const marker = billMarker(bill)
  if (marker) {
    row.addSpacer(4)
    const tag = row.addText(marker)
    tag.font = Font.systemFont(9)
    tag.textColor = COLORS.meta
    tag.lineLimit = 1
  }

  row.addSpacer()

  const amt = row.addText(formatMoney(bill.amount))
  amt.font = Font.semiboldSystemFont(11)
  amt.textColor = COLORS.moneyOut
  amt.lineLimit = 1
  amt.minimumScaleFactor = 0.7
  return row
}

function billColumnTrail(bills) {
  const count = (bills || []).length
  const total = sumAmounts(billsInTotals(bills), "amount")
  return count + "  ·  " + formatMoney(total)
}

function addBillColumn(parent, title, bills, maxRows, dueWidth, trailing, trailingColor) {
  const col = parent.addStack()
  col.layoutVertically()
  addSectionHeader(col, title, trailing, trailingColor)
  col.addSpacer(6)
  const shown = (bills || []).slice(0, Math.max(0, maxRows))
  const more = (bills || []).length - shown.length
  if (!shown.length) {
    const empty = col.addText("None")
    empty.font = Font.systemFont(11)
    empty.textColor = COLORS.meta
    empty.lineLimit = 1
    return col
  }
  shown.forEach((bill, i) => {
    if (i) col.addSpacer(3)
    addFullBillRow(col, bill, dueWidth)
  })
  if (more > 0) {
    col.addSpacer(4)
    const rest = col.addText("+" + more + " more")
    rest.font = Font.systemFont(10)
    rest.textColor = COLORS.meta
    rest.lineLimit = 1
  }
  return col
}

function addSplitBills(parent, manuals, autopay, maxRows, dueWidth, split) {
  const manualTrail = billColumnTrail(manuals)
  const autopayTrail = billColumnTrail(autopay)
  if (split) {
    const grid = parent.addStack()
    grid.layoutHorizontally()
    grid.topAlignContent()
    addBillColumn(grid, "You pay", manuals, maxRows, dueWidth, manualTrail, COLORS.moneyOut)
    grid.addSpacer(10)
    addBillColumn(grid, "Autopay", autopay, maxRows, dueWidth, autopayTrail, COLORS.meta)
  } else {
    addBillColumn(parent, "You pay", manuals, maxRows, dueWidth, manualTrail, COLORS.moneyOut)
    parent.addSpacer(8)
    addBillColumn(parent, "Autopay", autopay, maxRows, dueWidth, autopayTrail, COLORS.meta)
  }
}

function addFullCardRow(parent, card) {
  const row = parent.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  const left = row.addStack()
  left.layoutVertically()
  const title = left.addText(cardLabel(card))
  title.font = Font.mediumSystemFont(12)
  title.textColor = COLORS.name
  title.lineLimit = 1
  title.minimumScaleFactor = 0.7

  const details = []
  const pending = Number(card.pending)
  if (isFinite(pending) && pending !== 0) details.push(formatMoney(pending) + " pending")
  if (card.min_due != null) details.push("min " + formatMoney(card.min_due))
  const due = formatDue(card.due_iso)
  if (due) details.push("due " + due)
  const note = card && card.status_note ? String(card.status_note).trim() : ""
  if (/no payment due/i.test(note)) details.push("none due")
  else if (/scheduled/i.test(note)) details.push("scheduled")
  if (details.length) {
    const sub = left.addText(details.join("  ·  "))
    sub.font = Font.systemFont(10)
    sub.textColor = COLORS.meta
    sub.lineLimit = 1
    sub.minimumScaleFactor = 0.7
  }

  row.addSpacer()

  const bal = Number(card.balance)
  const amt = row.addText(formatMoney(card.balance))
  amt.font = Font.semiboldSystemFont(13)
  amt.textColor = !isFinite(bal) || bal === 0 ? COLORS.meta : COLORS.moneyOut
  amt.lineLimit = 1
  amt.minimumScaleFactor = 0.7
  return row
}

function makeFullWidget(data, fromCache, family, cardsData, cardsFromCache) {
  const widget = new ListWidget()
  widget.backgroundColor = COLORS.bg
  widget.setPadding(12, 14, 12, 14)

  const wide = isWideFamily(family)
  const innerWidth = Math.max(200, contentWidth(family) - (wide ? 48 : 40))
  const bills = data ? sortBills(visibleBills(data.bills)) : []
  const manuals = billsOfKind(bills, "Manual")
  const autopay = billsOfKind(bills, "Autopay")
  const outTotal = sumAmounts(billsInTotals(bills), "amount")
  const cards = cardsData ? sortCards(cardsData.cards) : []
  const maxBillRows = wide ? 8 : 12
  const dueWidth = 52
  const panelWidth = wide ? Math.floor((innerWidth - 10) / 2) : innerWidth

  const header = widget.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()
  const title = header.addText("Checking 7897")
  title.font = Font.boldSystemFont(15)
  title.textColor = COLORS.title
  title.lineLimit = 1
  title.minimumScaleFactor = 0.8
  header.addSpacer()
  const metaText = updatedLabel(data, fromCache, family)
  if (metaText) {
    const meta = header.addText(metaText)
    meta.font = Font.systemFont(10)
    meta.textColor = COLORS.meta
    meta.lineLimit = 1
    meta.minimumScaleFactor = 0.7
  }

  const checking = data && data.checking ? data.checking : null
  if (!data || !checking) {
    widget.addSpacer(8)
    const msg = widget.addText(data ? "No checking data." : "Couldn't load finance data.")
    msg.font = Font.systemFont(12)
    msg.textColor = COLORS.error
    msg.lineLimit = 4
    widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
    return widget
  }

  widget.addSpacer(8)

  function addCheckingBody(parent, width) {
    const posted = parent.addText(formatMoney(checking.posted))
    posted.font = Font.boldSystemFont(wide ? 26 : 28)
    posted.textColor = COLORS.moneyIn
    posted.lineLimit = 1
    posted.minimumScaleFactor = 0.7

    const pendingAmt = Number(checking.pending) || 0
    const pending = parent.addText(pendingAmt !== 0
      ? "+" + formatMoney(pendingAmt) + " pending"
      : "No pending deposits")
    pending.font = Font.systemFont(12)
    pending.textColor = pendingAmt !== 0 ? COLORS.moneyIn : COLORS.meta
    pending.lineLimit = 1
    pending.minimumScaleFactor = 0.8

    if (Array.isArray(checking.pending_items) && checking.pending_items.length > 0) {
      parent.addSpacer(4)
      checking.pending_items.forEach((item) => {
        const line = parent.addStack()
        line.layoutHorizontally()
        line.centerAlignContent()
        const amt = line.addText("+" + formatMoney(item.amount))
        amt.font = Font.semiboldSystemFont(11)
        amt.textColor = COLORS.moneyIn
        amt.lineLimit = 1
        amt.minimumScaleFactor = 0.7
        line.addSpacer(8)
        const label = line.addText(item.label || "Pending deposit")
        label.font = Font.systemFont(11)
        label.textColor = COLORS.meta
        label.lineLimit = 1
        label.minimumScaleFactor = 0.7
      })
    }

    addDivider(parent, width)
    addLeftoverRow(parent, "After scheduled", checking.after_scheduled)
    parent.addSpacer(3)
    addLeftoverRow(parent, "After rent", checking.after_rent)
    addDivider(parent, width)
    addFlowBar(parent, combinedBalance(checking), outTotal, width)
  }

  function addBillsPanel(parent, rows, width) {
    const panel = addPanel(parent)
    addSectionHeader(panel, "Bills")
    panel.addSpacer(8)
    const split = width >= 280
    addSplitBills(panel, manuals, autopay, rows, dueWidth, split)
    return panel
  }

  function addCardsPanel(parent) {
    const panel = addPanel(parent)
    const totalText = cardsData && cardsData.total_balance != null
      ? formatMoney(cardsData.total_balance)
      : ""
    const trailColor = totalText && Number(cardsData.total_balance) > 0 ? COLORS.moneyOut : COLORS.meta
    const stamp = cardsFromCache && cardsData ? "cached" : ""
    addSectionHeader(panel, stamp ? "Cards  ·  cached" : "Cards", totalText, trailColor)
    panel.addSpacer(8)
    if (!cardsData) {
      const msg = panel.addText("Couldn't load card data.")
      msg.font = Font.systemFont(11)
      msg.textColor = COLORS.error
      msg.lineLimit = 2
      return panel
    }
    if (!cards.length) {
      const msg = panel.addText("No card data.")
      msg.font = Font.systemFont(11)
      msg.textColor = COLORS.meta
      return panel
    }
    const cardCap = 6
    const shown = cards.slice(0, cardCap)
    shown.forEach((card, i) => {
      if (i) panel.addSpacer(7)
      addFullCardRow(panel, card)
    })
    if (cards.length > shown.length) {
      panel.addSpacer(4)
      const rest = panel.addText("+" + (cards.length - shown.length) + " more")
      rest.font = Font.systemFont(10)
      rest.textColor = COLORS.meta
      rest.lineLimit = 1
    }
    return panel
  }

  if (wide) {
    const body = widget.addStack()
    body.layoutHorizontally()
    body.topAlignContent()

    const left = addPanel(body)
    addCheckingBody(left, panelWidth)

    body.addSpacer(10)

    const right = body.addStack()
    right.layoutVertically()
    addBillsPanel(right, maxBillRows, panelWidth)
    right.addSpacer(10)
    addCardsPanel(right)
  } else {
    const checkingPanel = addPanel(widget)
    addCheckingBody(checkingPanel, panelWidth)
    widget.addSpacer(10)
    addBillsPanel(widget, maxBillRows, panelWidth)
    widget.addSpacer(10)
    addCardsPanel(widget)
  }

  widget.addSpacer()
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  return widget
}

function makeWidget(data, fromCache, family, cardsData, cardsFromCache) {
  if (isFullFamily(family)) {
    return makeFullWidget(data, fromCache, family, cardsData, cardsFromCache)
  }

  const widget = new ListWidget()
  widget.backgroundColor = COLORS.bg
  const isSmall = family === "small"
  const isMedium = family === "medium"
  const isLarge = !isSmall && !isMedium
  // Unknown families fall back to the large layout.
  // Medium is as short as small (~155pt). Keep that layout tight.
  if (isLarge) widget.setPadding(14, 16, 14, 16)
  else widget.setPadding(8, 12, 8, 12)

  const header = widget.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()

  const title = header.addText(isSmall ? "Checking" : "Checking 7897")
  title.font = Font.boldSystemFont(isSmall ? 14 : 15)
  title.textColor = COLORS.title
  title.lineLimit = 1
  title.minimumScaleFactor = 0.8
  header.addSpacer()

  const metaText = updatedLabel(data, fromCache, family)
  if (metaText) {
    const meta = header.addText(metaText)
    meta.font = Font.systemFont(isSmall ? 9 : 10)
    meta.textColor = COLORS.meta
    meta.lineLimit = 1
    meta.minimumScaleFactor = 0.7
  }

  const checking = data && data.checking ? data.checking : null
  if (!data || !checking) {
    widget.addSpacer(8)
    const msg = widget.addText(data ? "No checking data." : "Couldn't load finance data.")
    msg.font = Font.systemFont(12)
    msg.textColor = COLORS.error
    msg.lineLimit = 4
    widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
    return widget
  }

  widget.addSpacer(isLarge ? 8 : 5)

  if (isLarge) {
    addPostedLine(widget, checking, 28)
    addPendingLine(widget, checking, 13)
    if (Array.isArray(checking.pending_items) && checking.pending_items.length > 0) {
      widget.addSpacer(4)
      checking.pending_items.forEach((item) => {
        const line = widget.addText(formatMoney(item.amount) + "  " + (item.label || ""))
        line.font = Font.systemFont(12)
        line.textColor = COLORS.meta
        line.lineLimit = 1
        line.minimumScaleFactor = 0.8
      })
    }
    widget.addSpacer(10)
    const metrics = widget.addStack()
    metrics.layoutHorizontally()
    metrics.topAlignContent()
    addMetricColumn(metrics, "After scheduled", formatMoney(checking.after_scheduled), 18)
    metrics.addSpacer()
    addMetricColumn(metrics, "After rent", formatMoney(checking.after_rent), 18)
  } else if (isSmall) {
    addPostedLine(widget, checking, 22)
    addPendingLine(widget, checking, 11)
    widget.addSpacer(5)
    addMetricColumn(widget, "After rent", formatMoney(checking.after_rent), 16)
  } else {
    // Medium: balance on the left, leftover figures on the right, bills below.
    const body = widget.addStack()
    body.layoutHorizontally()
    body.topAlignContent()

    const left = body.addStack()
    left.layoutVertically()
    addPostedLine(left, checking, 22)
    addPendingLine(left, checking, 11)

    body.addSpacer(12)

    const right = body.addStack()
    right.layoutVertically()
    addInlineMetric(right, "After scheduled", formatMoney(checking.after_scheduled))
    right.addSpacer(4)
    addInlineMetric(right, "After rent", formatMoney(checking.after_rent))
  }

  const manuals = billsOfKind(visibleBills(data.bills), "Manual")
  const limit = billLimit(family)
  const shown = manuals.slice(0, limit)
  const more = manuals.length - shown.length

  widget.addSpacer(isLarge ? 10 : 6)
  if (isLarge) {
    const label = widget.addText("You pay")
    label.font = Font.semiboldSystemFont(11)
    label.textColor = COLORS.meta
    label.lineLimit = 1
    widget.addSpacer(4)
  }

  shown.forEach((bill, i) => {
    if (i > 0) widget.addSpacer(2)
    addBillRow(widget, bill, isSmall)
  })

  if (more > 0) {
    widget.addSpacer(2)
    const rest = widget.addText("+" + more + " more")
    rest.font = Font.systemFont(11)
    rest.textColor = COLORS.meta
    rest.lineLimit = 1
  }

  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  return widget
}

async function showTable(data, fromCache) {
  const table = new UITable()
  table.showSeparators = true
  const checking = data && data.checking ? data.checking : null
  const bills = sortBills(visibleBills(data && Array.isArray(data.bills) ? data.bills : []))

  const header = new UITableRow()
  header.isHeader = true
  let heading = "Finance"
  if (data && data.updated) {
    heading = "Finance  ·  " + data.updated + (fromCache ? "  (cached)" : "")
  } else if (!data) {
    heading = "Finance  ·  couldn't load"
  }
  header.addText(heading)
  table.addRow(header)

  if (checking) {
    const pendingAmt = Number(checking.pending) || 0
    const summary = new UITableRow()
    summary.height = 52
    const left = summary.addText(
      checking.name || "Amex checking 7897",
      formatMoney(checking.posted) + " posted" +
        (pendingAmt !== 0 ? "  ·  +" + formatMoney(pendingAmt) + " pending" : "")
    )
    left.titleFont = Font.semiboldSystemFont(16)
    left.subtitleFont = Font.systemFont(12)
    table.addRow(summary)

    const leftover = new UITableRow()
    leftover.height = 44
    const leftoverCell = leftover.addText(
      "After scheduled  " + formatMoney(checking.after_scheduled),
      "After rent  " + formatMoney(checking.after_rent)
    )
    leftoverCell.titleFont = Font.systemFont(15)
    leftoverCell.subtitleFont = Font.systemFont(15)
    table.addRow(leftover)

    if (Array.isArray(checking.pending_items) && checking.pending_items.length > 0) {
      for (const item of checking.pending_items) {
        const row = new UITableRow()
        row.height = 40
        const cell = row.addText(item.label || "Pending deposit", "+" + formatMoney(item.amount))
        cell.titleFont = Font.systemFont(14)
        cell.subtitleFont = Font.systemFont(12)
        table.addRow(row)
      }
    }
  } else {
    const empty = new UITableRow()
    empty.addText(data ? "No checking data." : "Couldn't load finance data. Check your internet and try again.")
    table.addRow(empty)
  }

  const section = new UITableRow()
  section.isHeader = true
  const manualCount = billsOfKind(bills, "Manual").length
  const autopayCount = billsOfKind(bills, "Autopay").length
  section.addText("Upcoming bills  ·  " + manualCount + " you pay  ·  " + autopayCount + " autopay")
  table.addRow(section)

  if (bills.length === 0 && data) {
    const empty = new UITableRow()
    empty.addText("No upcoming bills.")
    table.addRow(empty)
  }

  for (const bill of bills) {
    const row = new UITableRow()
    row.height = 52
    row.dismissOnSelect = false
    const kindLabel = bill.kind === "Manual" ? "You pay" : "Autopay"
    const extras = []
    if (bill.note) extras.push(bill.note)
    if (bill.in_totals === false) extras.push("not in totals")
    const subtitleParts = [bill.due || "", kindLabel, bill.from || ""]
    if (extras.length) subtitleParts.push(extras.join(" · "))
    const title = bill.bill || "Bill"
    const cell = row.addText(title, subtitleParts.filter(Boolean).join("  ·  "))
    cell.titleFont = Font.semiboldSystemFont(16)
    cell.subtitleFont = Font.systemFont(12)
    cell.widthWeight = 70
    const amt = row.addText(formatMoney(bill.amount))
    amt.titleFont = Font.semiboldSystemFont(16)
    amt.rightAligned = true
    amt.widthWeight = 30
    table.addRow(row)
  }

  await table.present()
}

const { finance, cards } = await loadFeeds()

if (config.runsInWidget) {
  Script.setWidget(makeWidget(finance.data, finance.fromCache, config.widgetFamily, cards.data, cards.fromCache))
} else {
  await showTable(finance.data, finance.fromCache)
}

Script.complete()
