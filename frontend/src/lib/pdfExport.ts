import type { jsPDF } from 'jspdf'

export type PdfMetric = {
  label: string
  value: string
  helper?: string
  color?: string
}

export type PdfChartSeries = {
  key: string
  label: string
  color: string
}

export type PdfChartRow = {
  label: string
  values: Record<string, number>
}

export type PdfChartSection = {
  title: string
  type?: 'bar' | 'horizontalBar' | 'line'
  rows: PdfChartRow[]
  series: PdfChartSeries[]
  maxRows?: number
  note?: string
}

export type PdfTableColumn = {
  header: string
  accessor: string
  align?: 'left' | 'center' | 'right'
  width?: number
}

export type PdfTableRow = Record<string, string | number>

export type PdfTableSection = {
  title: string
  columns: PdfTableColumn[]
  rows: PdfTableRow[]
  footerRows?: PdfTableRow[]
}

export type ExportDataPdfConfig = {
  title: string
  subtitle?: string
  filename: string
  meta?: string[]
  metrics?: PdfMetric[]
  charts?: PdfChartSection[]
  tables?: PdfTableSection[]
}

type PdfContext = {
  doc: jsPDF
  pageWidth: number
  pageHeight: number
  margin: number
  cursorY: number
}

const colors = {
  navy: '#17335a',
  navyDark: '#102847',
  blue: '#2f62cf',
  ink: '#1f365d',
  muted: '#5a7193',
  line: '#d5deea',
  lineSoft: '#edf2f8',
  paper: '#ffffff',
  panel: '#f7faff',
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '').trim()
  const fallback: [number, number, number] = [31, 54, 93]

  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return fallback
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ]
}

function setFill(doc: jsPDF, hex: string) {
  doc.setFillColor(...hexToRgb(hex))
}

function setDraw(doc: jsPDF, hex: string) {
  doc.setDrawColor(...hexToRgb(hex))
}

function setText(doc: jsPDF, hex: string) {
  doc.setTextColor(...hexToRgb(hex))
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR')
}

function formatCellValue(value: string | number | undefined): string {
  if (typeof value === 'number') {
    return formatNumber(value)
  }
  return String(value ?? '')
}

function sanitizeFilename(filename: string): string {
  const clean = filename.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'relatorio'
  return clean.toLocaleLowerCase('pt-BR').endsWith('.pdf') ? clean : `${clean}.pdf`
}

function textWidth(doc: jsPDF, text: string): number {
  return doc.getTextWidth(text)
}

function truncateText(doc: jsPDF, text: string, maxWidth: number): string {
  if (textWidth(doc, text) <= maxWidth) {
    return text
  }

  let result = text
  while (result.length > 1 && textWidth(doc, `${result}...`) > maxWidth) {
    result = result.slice(0, -1)
  }

  return `${result}...`
}

function ensureSpace(ctx: PdfContext, requiredHeight: number) {
  if (ctx.cursorY + requiredHeight <= ctx.pageHeight - ctx.margin - 10) {
    return
  }

  ctx.doc.addPage()
  ctx.cursorY = ctx.margin
}

function drawHeader(ctx: PdfContext, config: ExportDataPdfConfig) {
  const { doc, pageWidth } = ctx
  setFill(doc, colors.navy)
  doc.rect(0, 0, pageWidth, 30, 'F')
  setFill(doc, colors.blue)
  doc.rect(0, 27, pageWidth, 3, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  setText(doc, colors.paper)
  doc.text(config.title, ctx.margin, 12)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const subtitle = config.subtitle ?? 'Dados exportados do relatorio'
  doc.text(subtitle, ctx.margin, 19)
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, pageWidth - ctx.margin, 12, { align: 'right' })

  if (config.meta && config.meta.length > 0) {
    doc.setFontSize(8)
    const metaText = config.meta.filter(Boolean).join('  |  ')
    doc.text(truncateText(doc, metaText, pageWidth - ctx.margin * 2), ctx.margin, 25)
  }

  ctx.cursorY = 40
}

function drawSectionTitle(ctx: PdfContext, title: string) {
  const { doc } = ctx
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  setText(doc, colors.ink)
  doc.text(title, ctx.margin, ctx.cursorY)
  ctx.cursorY += 6
}

function drawMetrics(ctx: PdfContext, metrics: PdfMetric[]) {
  if (metrics.length === 0) {
    return
  }

  const { doc, pageWidth, margin } = ctx
  const gap = 4
  const columns = Math.min(metrics.length, 4)
  const cardWidth = (pageWidth - margin * 2 - gap * (columns - 1)) / columns
  const cardHeight = 24

  ensureSpace(ctx, cardHeight + 10)

  metrics.forEach((metric, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    const x = margin + column * (cardWidth + gap)
    const y = ctx.cursorY + row * (cardHeight + gap)
    const accent = metric.color ?? colors.blue

    setFill(doc, colors.panel)
    setDraw(doc, colors.line)
    doc.roundedRect(x, y, cardWidth, cardHeight, 2.5, 2.5, 'FD')
    setFill(doc, accent)
    doc.roundedRect(x, y, 2.5, cardHeight, 1.2, 1.2, 'F')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setText(doc, colors.muted)
    doc.text(truncateText(doc, metric.label, cardWidth - 10), x + 6, y + 7)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    setText(doc, colors.ink)
    doc.text(truncateText(doc, metric.value, cardWidth - 10), x + 6, y + 16)

    if (metric.helper) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      setText(doc, colors.muted)
      doc.text(truncateText(doc, metric.helper, cardWidth - 10), x + 6, y + 21)
    }
  })

  const rows = Math.ceil(metrics.length / columns)
  ctx.cursorY += rows * cardHeight + (rows - 1) * gap + 10
}

function drawLegend(ctx: PdfContext, series: PdfChartSeries[], x: number, y: number, maxWidth: number): number {
  const { doc } = ctx
  let cursorX = x
  let cursorY = y
  let lineCount = 1

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)

  series.forEach((item) => {
    const itemWidth = textWidth(doc, item.label) + 10
    if (cursorX + itemWidth > x + maxWidth) {
      cursorX = x
      cursorY += 5
      lineCount += 1
    }

    setFill(doc, item.color)
    doc.roundedRect(cursorX, cursorY - 3, 4, 3, 0.8, 0.8, 'F')
    setText(doc, colors.muted)
    doc.text(item.label, cursorX + 6, cursorY)
    cursorX += itemWidth + 4
  })

  return lineCount * 5
}

function getMaxChartValue(rows: PdfChartRow[], series: PdfChartSeries[]) {
  return Math.max(
    1,
    ...rows.flatMap((row) => series.map((item) => Number(row.values[item.key] ?? 0)))
  )
}

function drawChartFrame(ctx: PdfContext, x: number, y: number, width: number, height: number, maxValue: number) {
  const { doc } = ctx
  setDraw(doc, colors.line)
  doc.line(x, y, x, y + height)
  doc.line(x, y + height, x + width, y + height)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setText(doc, colors.muted)

  for (let index = 1; index <= 4; index += 1) {
    const gridY = y + height - (height * index) / 4
    setDraw(doc, colors.lineSoft)
    doc.line(x, gridY, x + width, gridY)
    setText(doc, colors.muted)
    doc.text(formatNumber(Math.round((maxValue * index) / 4)), x - 2, gridY + 1.5, { align: 'right' })
  }
}

function drawBarValueLabel(
  ctx: PdfContext,
  value: number,
  x: number,
  y: number,
  barWidth: number,
  barHeight: number,
  plotY: number,
  seriesIndex: number,
  seriesCount: number
) {
  if (value <= 0) {
    return
  }

  const { doc } = ctx
  const label = formatNumber(value)
  const fontSize = seriesCount > 3 ? 5.4 : 6.2
  const staggerOffset = seriesCount > 2 ? (seriesIndex % 3) * 2.8 : 0
  const centerX = x + barWidth / 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(fontSize)

  const labelFitsInsideBar = barHeight >= 8 && textWidth(doc, label) <= barWidth + 3
  if (labelFitsInsideBar) {
    setText(doc, colors.paper)
    doc.text(label, centerX, y + 4, { align: 'center' })
    return
  }

  setText(doc, colors.ink)
  doc.text(label, centerX, Math.max(y - 1.2 - staggerOffset, plotY + 2.2), { align: 'center' })
}

function drawBarChart(ctx: PdfContext, section: PdfChartSection) {
  const rows = section.rows.slice(0, section.maxRows ?? 10)
  const requiredHeight = 88
  ensureSpace(ctx, requiredHeight)
  drawSectionTitle(ctx, section.title)

  const { doc, pageWidth, margin } = ctx
  if (rows.length === 0 || section.series.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setText(doc, colors.muted)
    doc.text('Sem dados para o grafico.', margin, ctx.cursorY)
    ctx.cursorY += 12
    return
  }

  const legendHeight = drawLegend(ctx, section.series, margin, ctx.cursorY, pageWidth - margin * 2)
  const plotX = margin + 16
  const plotY = ctx.cursorY + legendHeight + 5
  const plotWidth = pageWidth - margin * 2 - 18
  const plotHeight = 48
  const baseline = plotY + plotHeight
  const maxValue = getMaxChartValue(rows, section.series)

  drawChartFrame(ctx, plotX, plotY, plotWidth, plotHeight, maxValue)

  const groupWidth = plotWidth / rows.length
  const barGap = 0.9
  const barWidth = Math.max(1.6, Math.min(7, (groupWidth - 4) / section.series.length - barGap))

  rows.forEach((row, rowIndex) => {
    const groupX = plotX + rowIndex * groupWidth
    const barsWidth = section.series.length * barWidth + (section.series.length - 1) * barGap
    const startX = groupX + (groupWidth - barsWidth) / 2

    section.series.forEach((item, seriesIndex) => {
      const value = Number(row.values[item.key] ?? 0)
      const barHeight = (value / maxValue) * plotHeight
      const x = startX + seriesIndex * (barWidth + barGap)
      const y = baseline - barHeight

      setFill(doc, item.color)
      doc.roundedRect(x, y, barWidth, barHeight, 0.8, 0.8, 'F')
      drawBarValueLabel(ctx, value, x, y, barWidth, barHeight, plotY, seriesIndex, section.series.length)
    })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.8)
    setText(doc, colors.muted)
    doc.text(truncateText(doc, row.label, Math.max(groupWidth - 2, 8)), groupX + groupWidth / 2, baseline + 5, {
      align: 'center',
    })
  })

  if (section.rows.length > rows.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setText(doc, colors.muted)
    doc.text(`Grafico exibindo os ${rows.length} maiores itens. A tabela abaixo traz os dados completos.`, margin, baseline + 12)
  } else if (section.note) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setText(doc, colors.muted)
    doc.text(section.note, margin, baseline + 12)
  }

  ctx.cursorY = baseline + 18
}

function drawHorizontalBarChart(ctx: PdfContext, section: PdfChartSection) {
  const rows = section.rows.slice(0, section.maxRows ?? 10)
  const rowHeight = 6.5
  const requiredHeight = 26 + rows.length * rowHeight
  ensureSpace(ctx, requiredHeight)
  drawSectionTitle(ctx, section.title)

  const { doc, pageWidth, margin } = ctx
  if (rows.length === 0 || section.series.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setText(doc, colors.muted)
    doc.text('Sem dados para o grafico.', margin, ctx.cursorY)
    ctx.cursorY += 12
    return
  }

  const series = section.series[0]
  const labelWidth = 60
  const valueWidth = 20
  const barX = margin + labelWidth
  const barWidth = pageWidth - margin * 2 - labelWidth - valueWidth - 4
  const maxValue = Math.max(1, ...rows.map((row) => Number(row.values[series.key] ?? 0)))

  rows.forEach((row, index) => {
    const y = ctx.cursorY + index * rowHeight
    const value = Number(row.values[series.key] ?? 0)
    const fillWidth = (value / maxValue) * barWidth

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setText(doc, colors.ink)
    doc.text(truncateText(doc, row.label, labelWidth - 4), margin, y + 4.2)

    setFill(doc, colors.lineSoft)
    doc.roundedRect(barX, y + 1, barWidth, 4, 1.5, 1.5, 'F')
    if (fillWidth > 0) {
      setFill(doc, series.color)
      doc.roundedRect(barX, y + 1, fillWidth, 4, 1.5, 1.5, 'F')
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    setText(doc, colors.ink)
    doc.text(formatNumber(value), barX + barWidth + valueWidth, y + 4.2, { align: 'right' })
  })

  if (section.rows.length > rows.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setText(doc, colors.muted)
    doc.text(`Grafico exibindo os ${rows.length} maiores itens.`, margin, ctx.cursorY + rows.length * rowHeight + 5)
    ctx.cursorY += rows.length * rowHeight + 12
    return
  }

  ctx.cursorY += rows.length * rowHeight + 8
}

function drawLineChart(ctx: PdfContext, section: PdfChartSection) {
  const rows = section.rows
  const requiredHeight = 88
  ensureSpace(ctx, requiredHeight)
  drawSectionTitle(ctx, section.title)

  const { doc, pageWidth, margin } = ctx
  if (rows.length === 0 || section.series.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setText(doc, colors.muted)
    doc.text('Sem dados para o grafico.', margin, ctx.cursorY)
    ctx.cursorY += 12
    return
  }

  const legendHeight = drawLegend(ctx, section.series, margin, ctx.cursorY, pageWidth - margin * 2)
  const plotX = margin + 16
  const plotY = ctx.cursorY + legendHeight + 5
  const plotWidth = pageWidth - margin * 2 - 18
  const plotHeight = 48
  const baseline = plotY + plotHeight
  const maxValue = getMaxChartValue(rows, section.series)
  const stepX = rows.length > 1 ? plotWidth / (rows.length - 1) : 0

  drawChartFrame(ctx, plotX, plotY, plotWidth, plotHeight, maxValue)

  section.series.forEach((series) => {
    const points = rows.map((row, index) => {
      const value = Number(row.values[series.key] ?? 0)
      return {
        x: rows.length > 1 ? plotX + index * stepX : plotX + plotWidth / 2,
        y: baseline - (value / maxValue) * plotHeight,
      }
    })

    setDraw(doc, series.color)
    doc.setLineWidth(0.8)
    points.forEach((point, index) => {
      if (index === 0) {
        return
      }
      const previous = points[index - 1]
      doc.line(previous.x, previous.y, point.x, point.y)
    })

    points.forEach((point) => {
      setFill(doc, series.color)
      doc.circle(point.x, point.y, 1.3, 'F')
    })
  })

  doc.setLineWidth(0.2)
  rows.forEach((row, index) => {
    const x = rows.length > 1 ? plotX + index * stepX : plotX + plotWidth / 2
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setText(doc, colors.muted)
    doc.text(truncateText(doc, row.label, 20), x, baseline + 5, { align: 'center' })
  })

  if (section.note) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setText(doc, colors.muted)
    doc.text(section.note, margin, baseline + 12)
  }

  ctx.cursorY = baseline + 18
}

function getColumnWidths(columns: PdfTableColumn[], tableWidth: number): number[] {
  const fixedWidth = columns.reduce((sum, column) => sum + (column.width ?? 0), 0)
  const flexibleColumns = columns.filter((column) => !column.width).length
  const flexibleWidth = flexibleColumns > 0 ? Math.max((tableWidth - fixedWidth) / flexibleColumns, 14) : 0
  const widths = columns.map((column) => column.width ?? flexibleWidth)
  const totalWidth = widths.reduce((sum, width) => sum + width, 0)

  if (totalWidth < tableWidth) {
    const remainingWidth = tableWidth - totalWidth
    if (flexibleColumns > 0) {
      return widths.map((width, index) => (columns[index].width ? width : width + remainingWidth / flexibleColumns))
    }

    const scale = tableWidth / totalWidth
    return widths.map((width) => width * scale)
  }

  if (totalWidth === tableWidth) {
    return widths
  }

  const scale = tableWidth / totalWidth
  return widths.map((width) => width * scale)
}

function drawTableHeader(ctx: PdfContext, columns: PdfTableColumn[], widths: number[]) {
  const { doc, margin } = ctx
  let x = margin
  const y = ctx.cursorY
  const rowHeight = 7

  setFill(doc, '#edf3fb')
  setDraw(doc, colors.line)
  doc.rect(margin, y, widths.reduce((sum, width) => sum + width, 0), rowHeight, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  setText(doc, colors.ink)

  columns.forEach((column, index) => {
    const width = widths[index]
    const align = column.align ?? 'left'
    const textX = align === 'right' ? x + width - 2 : align === 'center' ? x + width / 2 : x + 2
    doc.text(truncateText(doc, column.header, width - 4), textX, y + 4.7, { align })
    x += width
  })

  ctx.cursorY += rowHeight
}

function drawTableRows(ctx: PdfContext, table: PdfTableSection, columns: PdfTableColumn[], widths: number[], rows: PdfTableRow[], isFooter = false) {
  const { doc, margin, pageWidth } = ctx
  const tableWidth = pageWidth - margin * 2
  const rowHeight = 7

  rows.forEach((row, rowIndex) => {
    if (ctx.cursorY + rowHeight > ctx.pageHeight - ctx.margin - 12) {
      ctx.doc.addPage()
      ctx.cursorY = ctx.margin
      drawSectionTitle(ctx, table.title)
      drawTableHeader(ctx, columns, widths)
    }

    const y = ctx.cursorY
    const fill = isFooter ? '#f5f8fd' : rowIndex % 2 === 0 ? '#ffffff' : '#fbfdff'
    setFill(doc, fill)
    setDraw(doc, colors.lineSoft)
    doc.rect(margin, y, tableWidth, rowHeight, 'FD')

    let x = margin
    doc.setFont('helvetica', isFooter ? 'bold' : 'normal')
    doc.setFontSize(7.2)
    setText(doc, colors.ink)

    columns.forEach((column, columnIndex) => {
      const width = widths[columnIndex]
      const align = column.align ?? 'left'
      const textX = align === 'right' ? x + width - 2 : align === 'center' ? x + width / 2 : x + 2
      doc.text(truncateText(doc, formatCellValue(row[column.accessor]), width - 4), textX, y + 4.7, { align })
      x += width
    })

    ctx.cursorY += rowHeight
  })
}

function drawTable(ctx: PdfContext, table: PdfTableSection) {
  if (table.columns.length === 0) {
    return
  }

  ensureSpace(ctx, 26)
  drawSectionTitle(ctx, table.title)

  const tableWidth = ctx.pageWidth - ctx.margin * 2
  const widths = getColumnWidths(table.columns, tableWidth)
  drawTableHeader(ctx, table.columns, widths)
  drawTableRows(ctx, table, table.columns, widths, table.rows)

  if (table.footerRows && table.footerRows.length > 0) {
    drawTableRows(ctx, table, table.columns, widths, table.footerRows, true)
  }

  ctx.cursorY += 8
}

function drawChart(ctx: PdfContext, section: PdfChartSection) {
  if (section.type === 'line') {
    drawLineChart(ctx, section)
    return
  }

  if (section.type === 'horizontalBar') {
    drawHorizontalBarChart(ctx, section)
    return
  }

  drawBarChart(ctx, section)
}

function drawFooter(ctx: PdfContext) {
  const { doc, pageWidth, pageHeight, margin } = ctx
  const totalPages = doc.getNumberOfPages()

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    setDraw(doc, colors.line)
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setText(doc, colors.muted)
    doc.text('Relatorio gerado automaticamente', margin, pageHeight - 5)
    doc.text(`Pagina ${page} de ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: 'right' })
  }
}

export async function exportDataPdf(config: ExportDataPdfConfig) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const ctx: PdfContext = {
    doc,
    pageWidth: doc.internal.pageSize.getWidth(),
    pageHeight: doc.internal.pageSize.getHeight(),
    margin: 12,
    cursorY: 12,
  }

  drawHeader(ctx, config)
  drawMetrics(ctx, config.metrics ?? [])

  ;(config.charts ?? []).forEach((chart) => drawChart(ctx, chart))
  ;(config.tables ?? []).forEach((table) => drawTable(ctx, table))

  drawFooter(ctx)
  doc.save(sanitizeFilename(config.filename))
}
