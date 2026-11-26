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
  if (family === "small") return 6
  if (family === "large") return 20
  return 8
}

function makeWidget(data, fromCache, family) {
  const widget = new ListWidget()
  widget.backgroundColor = COLORS.bg
  const isSmall = family === "small"
  const isLarge = family === "large"
  widget.setPadding(8, 10, 8, 10)

  const header = widget.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()

  const title = header.addText("Jobs")
  title.font = Font.boldSystemFont(13)
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
    meta.font = Font.systemFont(9)
    meta.textColor = COLORS.meta
  }

  widget.addSpacer(4)

  const jobs = data && Array.isArray(data.jobs) ? data.jobs : []
  const shown = jobs.slice(0, rowLimit(family))

  if (shown.length === 0) {
    const msg = widget.addText(
      data ? "No jobs." : "Couldn't load jobs."
    )
    msg.font = Font.systemFont(12)
    msg.textColor = COLORS.error
    msg.lineLimit = 3
    return widget
  }

  const nameFont = Font.semiboldSystemFont(isLarge || !isSmall ? 11 : 12)
  shown.forEach((job, i) => {
    if (i > 0) {
      widget.addSpacer(isLarge ? 2 : isSmall ? 3 : 2)
    }
    const row = widget.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()
    row.url = job.url || ""

    const name = row.addText(job.name || "Untitled")
    name.font = nameFont
    name.textColor = COLORS.name
    name.lineLimit = 1
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
    row.height = 44
    const cell = row.addText(job.name || "Untitled")
    cell.titleFont = Font.semiboldSystemFont(16)
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
