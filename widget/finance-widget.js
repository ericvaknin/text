// Finance — Scriptable widget
// Action notice: bills Eric still has to pay or schedule, from:
// the private Finance-Widget-Data repo (finance.json)
// This is a snapshot. It does not update itself until that file is republished.

// Paste your Finance-Widget-Data token between the quotes below:
const MY_TOKEN = "PASTE_TOKEN_HERE"

const FEED_URL = "https://api.github.com/repos/ericvaknin/Finance-Widget-Data/contents/finance.json"
const CACHE_NAME = "finance-widget-cache.json"
const TOKEN_KEY = "financeDataToken"

const COLORS = {
  bg: new Color("#0E0E10"),
  title: Color.white(),
  meta: new Color("#8E8E93"),
  name: Color.white(),
  positive: new Color("#30D158"),
  warn: new Color("#FF9F0A"),
  urgent: new Color("#FF453A"),
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

function parseDueDate(iso) {
  if (!iso || typeof iso !== "string") return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function daysLeftFromIso(iso) {
  const due = parseDueDate(iso)
  if (!due) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

function duePhrase(days) {
  if (days == null) return ""
  if (days < 0) return "overdue"
  if (days === 0) return "today"
  if (days === 1) return "in 1 day"
  return "in " + days + " days"
}

function urgencyColor(days) {
  if (days == null) return COLORS.meta
  if (days < 0) return COLORS.urgent
  if (days <= 3) return COLORS.warn
  return COLORS.meta
}

function actionTint(days) {
  if (days == null) return COLORS.name
  if (days < 0) return COLORS.urgent
  if (days <= 3) return COLORS.warn
  return COLORS.name
}

function isScheduledNote(note) {
  return /^\s*scheduled\b/i.test(String(note || ""))
}

function sortByDue(items, titleKey) {
  return (items || []).slice().sort((a, b) => {
    const da = (a && (a.due_iso || a.due_sort)) || ""
    const db = (b && (b.due_iso || b.due_sort)) || ""
    if (da !== db) return da < db ? -1 : 1
    const ta = String((a && a[titleKey]) || "")
    const tb = String((b && b[titleKey]) || "")
    return ta.localeCompare(tb)
  })
}

function actionItems(data) {
  if (data && Array.isArray(data.actions)) {
    return sortByDue(data.actions, "title")
  }
  // Fallback for an older cached snapshot that only has `bills`.
  return sortByDue((data && data.bills) || [], "bill")
    .filter((b) => b && b.kind === "Manual" && !isScheduledNote(b.note))
    .map((b) => ({
      due: b.due,
      due_iso: b.due_iso,
      title: b.bill,
      amount: b.amount,
      note: b.note
    }))
}

function actionLimit(family) {
  if (family === "small") return 2
  if (family === "large") return 8
  return 4
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
  return !!(json && json.checking && typeof json.checking === "object" && (Array.isArray(json.actions) || Array.isArray(json.bills)))
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
      throw new Error("GitHub said " + code + ". The token was rejected or can't see Finance-Widget-Data. Run again and paste the Finance-Widget-Data token.")
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

function addActionRow(parent, action, compact) {
  const days = daysLeftFromIso(action && action.due_iso)
  const tint = actionTint(days)
  const dueColor = urgencyColor(days)

  const row = parent.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  const name = row.addText((action && action.title) || "Bill")
  name.font = Font.semiboldSystemFont(compact ? 12 : 13)
  name.textColor = tint
  name.lineLimit = 1
  name.minimumScaleFactor = 0.75

  row.addSpacer()

  const amt = row.addText(formatMoney(action && action.amount))
  amt.font = Font.semiboldSystemFont(compact ? 12 : 13)
  amt.textColor = tint
  amt.lineLimit = 1
  amt.minimumScaleFactor = 0.75

  const subParts = []
  if (action && action.due) subParts.push(action.due)
  const phrase = duePhrase(days)
  if (phrase) subParts.push(phrase)
  if (action && action.note) subParts.push(action.note)
  if (subParts.length) {
    const sub = parent.addText(subParts.join("  ·  "))
    sub.font = Font.systemFont(compact ? 10 : 11)
    sub.textColor = dueColor
    sub.lineLimit = 1
    sub.minimumScaleFactor = 0.7
  }
  return row
}

function addFooter(parent, checking, data, fromCache, family) {
  const afterRent = checking && isFinite(Number(checking.after_rent))
    ? formatMoney(checking.after_rent)
    : "—"
  const foot = parent.addText("Checking 7897: " + afterRent + " after rent")
  foot.font = Font.systemFont(family === "small" ? 9 : 10)
  foot.textColor = COLORS.meta
  foot.lineLimit = 1
  foot.minimumScaleFactor = 0.7

  const stamp = updatedLabel(data, fromCache, family)
  if (stamp) {
    const meta = parent.addText(stamp)
    meta.font = Font.systemFont(family === "small" ? 8 : 9)
    meta.textColor = COLORS.meta
    meta.lineLimit = 1
    meta.minimumScaleFactor = 0.7
  }
}

function makeWidget(data, fromCache, family) {
  const widget = new ListWidget()
  widget.backgroundColor = COLORS.bg
  const isSmall = family === "small"
  const isLarge = family === "large"
  // Medium is as short as small (~155pt). Keep that layout tight.
  if (isLarge) widget.setPadding(14, 16, 14, 16)
  else widget.setPadding(8, 12, 8, 12)

  const actions = actionItems(data)
  const count = actions.length
  const limit = actionLimit(family)
  const overflow = count > limit
  const shown = overflow ? actions.slice(0, Math.max(1, limit - 1)) : actions.slice(0, limit)
  const more = count - shown.length

  const header = widget.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()

  const title = header.addText("To do")
  title.font = Font.boldSystemFont(isSmall ? 14 : 16)
  title.textColor = COLORS.title
  title.lineLimit = 1
  title.minimumScaleFactor = 0.8
  header.addSpacer(8)
  const badge = header.addText(String(count))
  badge.font = Font.semiboldSystemFont(isSmall ? 13 : 15)
  let badgeColor = COLORS.meta
  if (count === 0) {
    badgeColor = COLORS.positive
  } else {
    const firstDays = daysLeftFromIso(actions[0] && actions[0].due_iso)
    if (firstDays != null && firstDays <= 3) badgeColor = urgencyColor(firstDays)
  }
  badge.textColor = badgeColor
  badge.lineLimit = 1

  const checking = data && data.checking ? data.checking : null
  if (!data) {
    widget.addSpacer(8)
    const msg = widget.addText("Couldn't load finance data.")
    msg.font = Font.systemFont(12)
    msg.textColor = COLORS.error
    msg.lineLimit = 4
    widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
    return widget
  }

  widget.addSpacer(isLarge ? 10 : 6)

  if (count === 0) {
    const empty = widget.addText("All caught up")
    empty.font = Font.semiboldSystemFont(isSmall ? 15 : 18)
    empty.textColor = COLORS.positive
    empty.lineLimit = 2
    empty.minimumScaleFactor = 0.8
  } else {
    shown.forEach((action, i) => {
      if (i > 0) widget.addSpacer(isLarge ? 6 : 4)
      addActionRow(widget, action, isSmall)
    })
    if (more > 0) {
      widget.addSpacer(3)
      const rest = widget.addText("+" + more + " more")
      rest.font = Font.systemFont(11)
      rest.textColor = COLORS.meta
      rest.lineLimit = 1
    }
  }

  widget.addSpacer()
  addFooter(widget, checking, data, fromCache, family)

  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  return widget
}

async function showTable(data, fromCache) {
  const table = new UITable()
  table.showSeparators = true
  const checking = data && data.checking ? data.checking : null
  const actions = actionItems(data)

  const header = new UITableRow()
  header.isHeader = true
  let heading = "To do"
  if (data && data.updated) {
    heading = "To do  ·  " + actions.length + "  ·  " + data.updated + (fromCache ? "  (cached)" : "")
  } else if (!data) {
    heading = "To do  ·  couldn't load"
  } else {
    heading = "To do  ·  " + actions.length
  }
  header.addText(heading)
  table.addRow(header)

  if (checking) {
    const leftover = new UITableRow()
    leftover.height = 44
    const leftoverCell = leftover.addText(
      "Checking 7897: " + formatMoney(checking.after_rent) + " after rent",
      "Posted " + formatMoney(checking.posted) +
        ((Number(checking.pending) || 0) !== 0 ? "  ·  +" + formatMoney(checking.pending) + " pending" : "")
    )
    leftoverCell.titleFont = Font.systemFont(15)
    leftoverCell.subtitleFont = Font.systemFont(12)
    table.addRow(leftover)
  } else if (!data) {
    const empty = new UITableRow()
    empty.addText("Couldn't load finance data. Check your internet and try again.")
    table.addRow(empty)
  }

  if (actions.length === 0 && data) {
    const empty = new UITableRow()
    empty.addText("All caught up")
    table.addRow(empty)
  }

  for (const action of actions) {
    const row = new UITableRow()
    row.height = 52
    row.dismissOnSelect = false
    const days = daysLeftFromIso(action.due_iso)
    const extras = []
    if (action.due) extras.push(action.due)
    const phrase = duePhrase(days)
    if (phrase) extras.push(phrase)
    if (action.note) extras.push(action.note)
    const cell = row.addText(action.title || "Bill", extras.join("  ·  "))
    cell.titleFont = Font.semiboldSystemFont(16)
    cell.subtitleFont = Font.systemFont(12)
    cell.widthWeight = 70
    const amt = row.addText(formatMoney(action.amount))
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
