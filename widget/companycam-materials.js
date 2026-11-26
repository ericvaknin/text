// CompanyCam Materials — Scriptable widget
// Shows jobs with open material lists from:
// the private Widget-Data repo (materials.json)
// This list is a snapshot. It does not update itself until that file is republished.

// Paste your Widget-Data token between the quotes below:
const MY_TOKEN = "PASTE_TOKEN_HERE"

const FEED_URL = "https://api.github.com/repos/ericvaknin/Widget-Data/contents/materials.json"
const CACHE_NAME = "companycam-materials-cache.json"

const COLORS = {
  bg: new Color("#0E0E10"),
  title: Color.white(),
  meta: new Color("#8E8E93"),
  name: Color.white(),
  error: new Color("#FF9F0A")
}

const TOKEN_KEY = "widgetDataToken"

async function getToken() {
  const own = MY_TOKEN.replace(/\s+/g, "")
  if (own && own !== "PASTE_TOKEN_HERE") return own
  let saved = null
  try { if (Keychain.contains(TOKEN_KEY)) saved = Keychain.get(TOKEN_KEY) } catch (e) {}
  if (saved) return saved
  if (!config.runsInApp) return null
  const a = new Alert()
  a.title = "GitHub token"
  a.message = "Copy your Widget-Data token first (from Notes), then tap Use Copied Token. It is saved on this phone only."
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

async function loadJobs() {
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
      throw new Error("GitHub said " + code + ". The token was rejected or can't see Widget-Data. Run again and paste the token.")
    }
    const json = JSON.parse(raw)
    if (!json || !Array.isArray(json.jobs)) {
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

function rowLimit(family) {
  if (family === "small") return 4
  if (family === "large") return 10
  return 4
}

function openLabel(job) {
  if (job == null || job.open == null || job.open === "") return ""
  return String(job.open)
}

function makeWidget(data, fromCache, family) {
  const widget = new ListWidget()
  widget.backgroundColor = COLORS.bg
  const isSmall = family === "small"
  widget.setPadding(8, 10, 8, 10)

  const header = widget.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()

  const title = header.addText("Materials")
  title.font = Font.boldSystemFont(20)
  title.textColor = COLORS.title
  header.addSpacer()

  let metaText = data && data.updated ? String(data.updated) : ""
  if (fromCache && metaText) {
    metaText = metaText + " · cached"
  } else if (!data) {
    metaText = "Unavailable"
  }
  if (metaText) {
    const meta = header.addText(metaText)
    meta.font = Font.systemFont(12)
    meta.textColor = COLORS.meta
  }

  widget.addSpacer(8)

  const jobs = data && Array.isArray(data.jobs) ? data.jobs : []
  const shown = jobs.slice(0, rowLimit(family))

  if (shown.length === 0) {
    const msg = widget.addText(
      data ? "No open material lists." : "Couldn't load materials."
    )
    msg.font = Font.systemFont(12)
    msg.textColor = COLORS.error
    msg.lineLimit = 3
    return widget
  }

  const nameFont = Font.semiboldSystemFont(isSmall ? 20 : 22)
  shown.forEach((job, i) => {
    if (i > 0) {
      widget.addSpacer(isSmall ? 6 : 8)
    }
    const row = widget.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()
    row.url = job.url || ""

    const name = row.addText(job.name || "Untitled")
    name.font = nameFont
    name.textColor = COLORS.name
    name.lineLimit = 1
    name.minimumScaleFactor = 0.8

    const countText = openLabel(job)
    if (countText) {
      row.addSpacer()
      const count = row.addText(countText)
      count.font = Font.semiboldSystemFont(16)
      count.textColor = COLORS.meta
    }
  })

  if (isSmall && shown[0] && shown[0].url) {
    widget.url = shown[0].url
  }

  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  return widget
}

async function showTable(data, fromCache) {
  const table = new UITable()
  table.showSeparators = true
  const jobs = data && Array.isArray(data.jobs) ? data.jobs : []

  const header = new UITableRow()
  header.isHeader = true
  let heading = "Materials"
  if (data && data.updated) {
    heading = "Materials  ·  " + data.updated + (fromCache ? "  (cached)" : "")
  } else if (!data) {
    heading = "Materials  ·  couldn't load"
  }
  header.addText(heading)
  table.addRow(header)

  if (jobs.length === 0) {
    const empty = new UITableRow()
    empty.addText(data ? "No open material lists." : "Couldn't load materials. Check your internet and try again.")
    table.addRow(empty)
  }

  for (const job of jobs) {
    const row = new UITableRow()
    row.dismissOnSelect = true
    row.height = 44
    const countText = openLabel(job)
    const subtitle = countText ? (countText + " open") : ""
    const cell = row.addText(job.name || "Untitled", subtitle)
    cell.titleFont = Font.semiboldSystemFont(16)
    cell.subtitleFont = Font.systemFont(12)
    cell.subtitleColor = Color.gray()
    table.addRow(row)
  }

  table.onSelect = (index) => {
    const job = jobs[index - 1]
    if (job && job.url) {
      Safari.open(job.url)
    }
  }

  await table.present()
}

const { data, fromCache } = await loadJobs()

if (config.runsInWidget) {
  Script.setWidget(makeWidget(data, fromCache, config.widgetFamily))
} else {
  await showTable(data, fromCache)
}

Script.complete()
