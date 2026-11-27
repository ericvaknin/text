// Finance — Scriptable widget
// Shows Amex checking 7897 and upcoming bills from:
// the private Finance-Data repo (finance.json)
// This is a snapshot. It does not update itself until that file is republished.

// Paste your Finance-Data token between the quotes below:
const MY_TOKEN = "PASTE_TOKEN_HERE"

const FEED_URL = "https://api.github.com/repos/ericvaknin/Finance-Data/contents/finance.json"
const CACHE_NAME = "finance-widget-cache.json"
const TOKEN_KEY = "financeDataToken"

const COLORS = {
  bg: new Color("#0E0E10"),
  title: Color.white(),
  meta: new Color("#8E8E93"),
  name: Color.white(),
  positive: new Color("#30D158"),
  error: new Color("#FF9F0A")
}

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

function billLimit(family) {
  if (family === "small") return 1
  if (family === "large") return 4
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
  a.message = "Copy your Finance-Data token first (from Notes), then tap Use Copied Token. It is saved on this phone only."
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

async function loadFinance() {
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
    if (code === 401 || code === 403 || code === 404) {
      try { Keychain.remove(TOKEN_KEY) } catch (e) {}
      throw new Error("GitHub said " + code + ". The token was rejected or can't see Finance-Data. Run again and paste the Finance-Data token.")
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

function makeWidget(data, fromCache, family) {
  const widget = new ListWidget()
  widget.backgroundColor = COLORS.bg
  const isSmall = family === "small"
  const isLarge = family === "large"
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

  const manuals = billsOfKind(data.bills, "Manual")
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
  const bills = sortBills(data && Array.isArray(data.bills) ? data.bills : [])

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
  const manualCount = data && data.manual_count != null ? data.manual_count : billsOfKind(bills, "Manual").length
  const autopayCount = data && data.autopay_count != null ? data.autopay_count : billsOfKind(bills, "Autopay").length
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

const { data, fromCache } = await loadFinance()

if (config.runsInWidget) {
  Script.setWidget(makeWidget(data, fromCache, config.widgetFamily))
} else {
  await showTable(data, fromCache)
}

Script.complete()

