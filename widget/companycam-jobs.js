// CompanyCam Jobs — Scriptable widget
// Shows recent jobs from:
// https://ericvaknin.github.io/text/widget/jobs.json
// This list is a snapshot. It does not update itself until that file is republished.

const FEED_URL = "https://ericvaknin.github.io/text/widget/jobs.json"
const CACHE_NAME = "companycam-jobs-cache.json"

const COLORS = {
  bg: new Color("#0E0E10"),
  title: Color.white(),
  meta: new Color("#8E8E93"),
  name: Color.white(),
  address: new Color("#A1A1A6"),
  error: new Color("#FF9F0A")
}

async function loadJobs() {
  const fm = FileManager.local()
  const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_NAME)
  let data = null
  let fromCache = false
  try {
    const req = new Request(FEED_URL + "?t=" + Date.now())
    req.timeoutInterval = 8
    const json = await req.loadJSON()
    if (!json || !Array.isArray(json.jobs)) {
      throw new Error("Bad data")
    }
    data = json
    fm.writeString(cachePath, JSON.stringify(json))
  } catch (e) {
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
  if (family === "small") return 3
  if (family === "large") return 12
  return 5
}

function makeWidget(data, fromCache, family) {
  const widget = new ListWidget()
  widget.backgroundColor = COLORS.bg
  const isSmall = family === "small"
  const isLarge = family === "large"
  widget.setPadding(isSmall ? 10 : 12, isSmall ? 12 : 14, isSmall ? 10 : 12, isSmall ? 12 : 14)

  const header = widget.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()

  const title = header.addText("Jobs")
  title.font = Font.boldSystemFont(isSmall ? 14 : 16)
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
    meta.font = Font.systemFont(isSmall ? 9 : 10)
    meta.textColor = COLORS.meta
  }

  widget.addSpacer(isSmall ? 6 : 8)

  const jobs = data && Array.isArray(data.jobs) ? data.jobs : []
  const shown = jobs.slice(0, rowLimit(family))

  if (shown.length === 0) {
    const msg = widget.addText(
      data ? "No jobs." : "Couldn't load jobs."
    )
    msg.font = Font.systemFont(12)
    msg.textColor = COLORS.error
    msg.lineLimit = 3
    widget.addSpacer()
    return widget
  }

  shown.forEach((job, i) => {
    if (i > 0) {
      widget.addSpacer(isLarge ? 5 : isSmall ? 5 : 6)
    }
    const row = widget.addStack()
    row.layoutVertically()
    row.url = job.url || ""

    const name = row.addText(job.name || "Untitled")
    name.font = Font.semiboldSystemFont(isSmall ? 12 : 13)
    name.textColor = COLORS.name
    name.lineLimit = 1

    if (job.address && !isSmall) {
      const addr = row.addText(job.address)
      addr.font = Font.systemFont(11)
      addr.textColor = COLORS.address
      addr.lineLimit = 1
    }
  })

  if (isSmall && shown[0] && shown[0].url) {
    widget.url = shown[0].url
  }

  widget.addSpacer()
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  return widget
}

async function showTable(data, fromCache) {
  const table = new UITable()
  table.showSeparators = true
  const jobs = data && Array.isArray(data.jobs) ? data.jobs : []

  const header = new UITableRow()
  header.isHeader = true
  let heading = "Jobs"
  if (data && data.updated) {
    heading = "Jobs  ·  " + data.updated + (fromCache ? "  (cached)" : "")
  } else if (!data) {
    heading = "Jobs  ·  couldn't load"
  }
  header.addText(heading)
  table.addRow(header)

  if (jobs.length === 0) {
    const empty = new UITableRow()
    empty.addText(data ? "No jobs." : "Couldn't load jobs. Check your internet and try again.")
    table.addRow(empty)
  }

  for (const job of jobs) {
    const row = new UITableRow()
    row.dismissOnSelect = true
    row.height = 56
    const cell = row.addText(job.name || "Untitled", job.address || "")
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

