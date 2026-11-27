// Cards — Scriptable widget
// Shows credit card balances from:
// the private Finance-Widget-Data repo (cards.json)
// This is a snapshot. It does not update itself until that file is republished.

// Paste your Finance-Widget-Data token between the quotes below:
const MY_TOKEN = "PASTE_TOKEN_HERE"

const FEED_URL = "https://api.github.com/repos/ericvaknin/Finance-Widget-Data/contents/cards.json"
const CACHE_NAME = "cards-widget-cache.json"
const TOKEN_KEY = "financeDataToken"

const COLORS = {
  bg: new Color("#0E0E10"),
  title: Color.white(),
  meta: new Color("#8E8E93"),
  name: Color.white(),
  positive: new Color("#30D158"),
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

function cardNote(card) {
  const note = card && card.status_note ? String(card.status_note).trim() : ""
  if (/scheduled/i.test(note)) return "scheduled"
  if (/no payment due/i.test(note)) return "none due"
  if (card && card.due_iso) return formatDue(card.due_iso)
  return ""
}

function isScheduled(card) {
  return /scheduled/i.test(String((card && card.status_note) || ""))
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
  return !!(json && Array.isArray(json.cards) && json.cards.length > 0)
}

function cardLimit(family) {
  if (family === "small") return 2
  return 5
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
  a.message = "Copy your Finance-Widget-Data token first (from Notes), then tap Use Copied Token. It is saved on this phone only and reused by the finance widget."
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

async function loadCards() {
  const fm = FileManager.local()
  const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_NAME)
  let data = null
  let fromCache = false
  try {
    const token = await getToken()
    if (!token) throw new Error("No token")
    const req = new Request(FEED_URL + "?t=" + Date.now())
    req.headers = { "Authorization": "Bearer " + token, "Accept": "application/vnd.github.raw+json" }
    req.timeoutInterval = 8
    const raw = await req.loadString()
    const code = req.response ? req.response.statusCode : 0
    if (code === 401 || code === 403) {
      try { Keychain.remove(TOKEN_KEY) } catch (e) {}
      throw new Error("GitHub said " + code + ". The token was rejected. Run again and paste the Finance-Widget-Data token.")
    }
    if (code === 404) {
      throw new Error("GitHub said 404. The token may not have access to Finance-Widget-Data, or cards.json is not in that repo yet. Add Finance-Widget-Data to the token's repository access, then run again.")
    }
    const json = JSON.parse(raw)
    if (!isValidFeed(json)) {
      throw new Error("Bad data (status " + code + ")")
    }
    data = json
    fm.writeString(cachePath, JSON.stringify(json))
  } catch (e) {
    await showMsg("Couldn't load fresh data", String(e && e.message ? e.message : e))
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

function addCardRow(parent, card, compact) {
  const row = parent.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  const left = row.addStack()
  left.layoutVertically()
  const title = left.addText(cardLabel(card))
  title.font = Font.semiboldSystemFont(compact ? 11 : 12)
  title.textColor = COLORS.name
  title.lineLimit = 1
  title.minimumScaleFactor = 0.7

  const note = cardNote(card)
  if (note) {
    const sub = left.addText(note)
    sub.font = Font.systemFont(compact ? 9 : 10)
    sub.textColor = isScheduled(card) ? COLORS.positive : COLORS.meta
    sub.lineLimit = 1
    sub.minimumScaleFactor = 0.7
  }

  row.addSpacer()

  const amt = row.addText(formatMoney(card.balance))
  amt.font = Font.semiboldSystemFont(compact ? 11 : 13)
  amt.textColor = Number(card.balance) === 0 ? COLORS.meta : COLORS.title
  amt.lineLimit = 1
  amt.minimumScaleFactor = 0.8
  return row
}

function addLargeCard(parent, card) {
  addCardRow(parent, card, false)

  const details = []
  if (card.statement_balance != null) details.push("Stmt " + formatMoney(card.statement_balance))
  if (card.min_due != null) details.push("Min " + formatMoney(card.min_due))
  const due = formatDue(card.due_iso)
  if (due && !isScheduled(card)) details.push("Due " + due)
  const pending = Number(card.pending)
  if (isFinite(pending) && pending !== 0) details.push(formatMoney(pending) + " pending")
  if (!details.length) return

  const line = parent.addText(details.join("  ·  "))
  line.font = Font.systemFont(11)
  line.textColor = COLORS.meta
  line.lineLimit = 1
  line.minimumScaleFactor = 0.7
}

function makeWidget(data, fromCache, family) {
  const widget = new ListWidget()
  widget.backgroundColor = COLORS.bg
  const isSmall = family === "small"
  const isLarge = family === "large"
  if (isLarge) widget.setPadding(14, 16, 14, 16)
  else widget.setPadding(8, 12, 8, 12)

  const header = widget.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()

  const title = header.addText("Cards")
  title.font = Font.boldSystemFont(isSmall ? 14 : 15)
  title.textColor = COLORS.title
  title.lineLimit = 1
  title.minimumScaleFactor = 0.8
  header.addSpacer()

  if (data && data.total_balance != null && !isSmall) {
    const total = header.addText(formatMoney(data.total_balance))
    total.font = Font.semiboldSystemFont(15)
    total.textColor = COLORS.title
    total.lineLimit = 1
    total.minimumScaleFactor = 0.7
  }

  const cards = data ? sortCards(data.cards) : []
  if (!data || !cards.length) {
    widget.addSpacer(8)
    const msg = widget.addText(data ? "No card data." : "Couldn't load card data.")
    msg.font = Font.systemFont(12)
    msg.textColor = COLORS.error
    msg.lineLimit = 4
    widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
    return widget
  }

  if (isSmall) {
    widget.addSpacer(4)
    const total = widget.addText(formatMoney(data.total_balance))
    total.font = Font.boldSystemFont(22)
    total.textColor = COLORS.title
    total.lineLimit = 1
    total.minimumScaleFactor = 0.7
    const meta = widget.addText(updatedLabel(data, fromCache, family))
    meta.font = Font.systemFont(9)
    meta.textColor = COLORS.meta
    meta.lineLimit = 1
    meta.minimumScaleFactor = 0.7
    widget.addSpacer(6)
    const shown = cards.slice(0, cardLimit(family))
    shown.forEach((card, i) => {
      if (i) widget.addSpacer(4)
      addCardRow(widget, card, true)
    })
  } else if (isLarge) {
    const metaText = updatedLabel(data, fromCache, family)
    if (metaText) {
      widget.addSpacer(2)
      const meta = widget.addText(metaText)
      meta.font = Font.systemFont(10)
      meta.textColor = COLORS.meta
      meta.lineLimit = 1
      meta.minimumScaleFactor = 0.7
    }
    widget.addSpacer(8)
    cards.forEach((card, i) => {
      if (i) widget.addSpacer(8)
      addLargeCard(widget, card)
    })
  } else {
    const metaText = updatedLabel(data, fromCache, family)
    if (metaText) {
      widget.addSpacer(1)
      const meta = widget.addText(metaText)
      meta.font = Font.systemFont(9)
      meta.textColor = COLORS.meta
      meta.lineLimit = 1
      meta.minimumScaleFactor = 0.7
    }
    widget.addSpacer(6)
    const shown = cards.slice(0, cardLimit(family))
    shown.forEach((card, i) => {
      if (i) widget.addSpacer(4)
      addCardRow(widget, card, true)
    })
  }

  widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000)
  return widget
}

async function showTable(data, fromCache) {
  const table = new UITable()
  table.showSeparators = true

  const header = new UITableRow()
  header.isHeader = true
  const title = data ? "Cards  ·  " + formatMoney(data.total_balance) : "Cards"
  header.addText(title + (fromCache ? "  ·  cached" : ""))
  table.addRow(header)

  if (!data) {
    const row = new UITableRow()
    row.addText("Couldn't load card data.")
    table.addRow(row)
    await table.present()
    return
  }

  const stamp = new UITableRow()
  stamp.addText(updatedLabel(data, fromCache, "large"))
  table.addRow(stamp)

  for (const card of sortCards(data.cards)) {
    const row = new UITableRow()
    row.height = 56
    row.dismissOnSelect = false
    const extras = []
    const note = cardNote(card)
    if (note) extras.push(note)
    if (card.statement_balance != null) extras.push("stmt " + formatMoney(card.statement_balance))
    if (card.min_due != null) extras.push("min " + formatMoney(card.min_due))
    const pending = Number(card.pending)
    if (isFinite(pending) && pending !== 0) extras.push(formatMoney(pending) + " pending")
    const cell = row.addText(cardLabel(card), extras.join("  ·  "))
    cell.titleFont = Font.semiboldSystemFont(16)
    cell.subtitleFont = Font.systemFont(12)
    cell.widthWeight = 70
    const amt = row.addText(formatMoney(card.balance))
    amt.titleFont = Font.semiboldSystemFont(16)
    amt.rightAligned = true
    amt.widthWeight = 30
    table.addRow(row)
  }

  await table.present()
}

const { data, fromCache } = await loadCards()

if (config.runsInWidget) {
  Script.setWidget(makeWidget(data, fromCache, config.widgetFamily))
} else {
  await showTable(data, fromCache)
}

Script.complete()
