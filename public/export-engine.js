/* Slide images for presentations and a complete PDF report. No record or value is elided. */
const ExportEngine = (() => {
  const SCALE_BASE = 1920;
  const ROW_HEIGHT = 46;
  const CONTINUATION_ROW_Y = 270;
  const regionLabel = r => r.state;
  const value = v => v === null || v === undefined || v === '' ? '—' : String(v);
  const SLIDE_W = 1920, SLIDE_H = 1080, SLIDE_MARGIN = 48, LIST_STARTS = [1190, 1010, 830, 650], LIST_TOP = 168, LIST_BOTTOM = 1040, COLUMN_GAP = 28;
  const THEMES = {
    light: {bg: '#faf9f6', card: '#ffffff', ink: '#242b34', sub: '#655e6b', line: '#e8e7e4'},
    dark: {bg: '#33303b', card: '#3f3b49', ink: '#ffffff', sub: '#d6d1dc', line: '#5a5566'}
  };

  function mapLegendEntries(project, layers) {
    const entries = [];
    if (layers.count || layers.dots) entries.push(['Low count', '#ded2f2'], ['High count', project.palette.Live]);
    if (layers.status) entries.push(...(project.legends || []).map(item => [item.label, item.color]), ['Competition outline', project.palette.Competition]);
    entries.push([layers.status ? 'Unclassified' : 'No properties', '#eeeef1']);
    return entries;
  }

  function rowsFor(project, scope, currentRows) {
    const source = scope === 'view' ? currentRows : project.properties;
    return [...source].sort((a, b) =>
      (a.country || '').localeCompare(b.country || '') ||
      (a.state || '').localeCompare(b.state || '') ||
      (a.name || '').localeCompare(b.name || '') ||
      (a.code || '').localeCompare(b.code || ''));
  }

  function columnsFor(rows, customFields, countryNames) {
    const core = [
      {label: '#', width: 60, cell: (_, i) => String(i + 1)},
      {label: 'PROPERTY CODE', width: 150, cell: r => value(r.code)},
      {label: 'PROPERTY NAME', width: 290, cell: r => value(r.name)},
      {label: 'COUNTRY', width: 150, cell: r => value(countryNames[r.country] || r.country)},
      {label: 'STATE / PROVINCE', width: 200, cell: r => value(r.state)},
      {label: 'COUNTY / DISTRICT', width: 190, cell: r => value(r.district)},
      {label: 'CITY', width: 150, cell: r => value(r.city)},
      {label: 'STATUS', width: 140, cell: r => value(r.status)},
      {label: 'TEAM', width: 170, cell: r => value(r.team)}
    ];
    const fields = customFields.filter(f => !f.condition || rows.some(r => r.status === f.condition))
      .map(f => ({label: f.label, width: 160, cell: r => f.condition && r.status !== f.condition ? '—' :
        f.type === 'checkbox' ? (r.custom?.[f.id] ? 'Yes' : 'No') : value(r.custom?.[f.id])}));
    const cols = [...core, ...fields];
    const measuring = document.createElement('canvas').getContext('2d');
    measuring.font = '19px Arial';
    for (const col of cols) {
      col.width = Math.max(col.width, Math.ceil(measuring.measureText(col.label).width + 36));
      for (let i = 0; i < rows.length; i++) {
        col.width = Math.max(col.width, Math.ceil(measuring.measureText(col.cell(rows[i], i)).width + 36));
      }
    }
    const width = Math.max(SCALE_BASE, cols.reduce((sum, col) => sum + col.width, 0) + 120);
    return {cols, width};
  }

  // Slide list: region groups flow down columns. Nothing is dropped or clipped.
  function slideGroups(rows, countryNames) {
    const groups = [], oneCountry = new Set(rows.map(r => r.country)).size <= 1;
    for (const row of rows) {
      const key = row.country + ':' + row.state;
      if (!groups.length || groups.at(-1).key !== key) groups.push({key, state: row.state, label: oneCountry ? value(row.state) : `${countryNames[row.country] || row.country} / ${value(row.state)}`, rows: []});
      groups.at(-1).rows.push(row);
    }
    // Largest region first, as on the map's dot colours.
    return groups.sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
  }

  const rowText = row => `${value(row.code)} · ${value(row.name)}`;
  const groupText = group => `${group.label} · ${group.rows.length} ${group.rows.length === 1 ? 'property' : 'properties'}`;

  // Break text into lines no wider than `width`. Long names wrap; they are never cut short.
  function wrap(ctx, text, width) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > width) {lines.push(line); line = word} else line = next;
    }
    lines.push(line);
    return lines;
  }

  function slideFlow(ctx, groups, size, height, columnWidth) {
    const rowH = Math.round(size * 1.55), groupH = Math.round(size * 2.3), textWidth = columnWidth - size * 1.4, columns = [[]];
    const head = (group, suffix = '') => {ctx.font = `600 ${size}px Arial`; const lines = wrap(ctx, groupText(group) + suffix, textWidth); return {type: 'group', group, lines, h: groupH + (lines.length - 1) * rowH}};
    let y = 0, fitsWidth = true;
    const next = () => {columns.push([]); y = 0};
    const put = item => {columns.at(-1).push(item); y += item.h; if (item.lines.some(line => ctx.measureText(line).width > textWidth)) fitsWidth = false};
    for (const group of groups) {
      ctx.font = `${size}px Arial`;
      const rows = group.rows.map(row => {const lines = wrap(ctx, rowText(row), textWidth); return {type: 'row', row, lines, h: lines.length * rowH}});
      // Keep a region together when it fits a column; only a region taller than a column is split.
      const first = head(group), whole = first.h + rows.reduce((sum, item) => sum + item.h, 0);
      if (y && y + (whole <= height ? whole : first.h + rows[0].h) > height) next();
      put(first);
      for (const item of rows) {
        if (y + item.h > height) {next(); put(head(group, ' (continued)'))}
        ctx.font = `${size}px Arial`; put(item);
      }
    }
    return {columns: columns.filter(column => column.length), rowH, groupH, fitsWidth};
  }

  // Always one image. Keep the map as wide as possible while the list text is 14px or more, then the
  // largest text, then the fewest (widest) columns. Only when 12px text cannot fit a 16:9 slide does
  // the image grow taller.
  function slidePlan(context) {
    if (!context.showList || !context.rows.length) return {columns: [], size: 14, columnWidth: 0, rowH: 0, groupH: 0, listX: null, height: SLIDE_H};
    const groups = slideGroups(context.rows, context.countryNames), ctx = document.createElement('canvas').getContext('2d');
    const widthFor = (listX, count) => Math.floor((SLIDE_W - SLIDE_MARGIN - listX - (count - 1) * COLUMN_GAP) / count);
    const attempt = (size, listX, count, height) => {
      const columnWidth = widthFor(listX, count);
      if (columnWidth < size * 13) return null;
      const flow = slideFlow(ctx, groups, size, height, columnWidth);
      return flow.fitsWidth && flow.columns.length <= count ? {...flow, size, columnWidth, listX, height: LIST_TOP + height + 40} : null;
    };
    for (const sizes of [[18, 16, 15, 14], [13, 12]]) for (const listX of LIST_STARTS) for (const size of sizes) for (let count = 1; count <= 5; count++) {
      const plan = attempt(size, listX, count, LIST_BOTTOM - LIST_TOP);
      if (plan) return plan;
    }
    for (let height = LIST_BOTTOM - LIST_TOP + 40; height < 7000; height += 40) for (let count = 4; count >= 1; count--) {
      const plan = attempt(12, LIST_STARTS.at(-1), count, height);
      if (plan) return plan;
    }
    throw Error('This list is too long for one image. Use the filtered view or export the PDF report.');
  }

  function makeCanvas(width, logicalHeight, resolution) {
    const scale = resolution / SCALE_BASE;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(logicalHeight * scale);
    const c = canvas.getContext('2d');
    if (!c) throw Error('The browser could not allocate an export image. Try HD or PDF.');
    c.scale(scale, scale);
    c.fillStyle = '#faf9f6';
    c.fillRect(0, 0, width, logicalHeight);
    return {canvas, c};
  }

  async function mapImage(svgMarkup) {
    const url = URL.createObjectURL(new Blob([svgMarkup], {type: 'image/svg+xml'}));
    try {
      const img = new Image(); img.src = url; await img.decode(); return img;
    } finally {
      // The decoded image remains usable after revocation.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  // Overview panel on the PDF map page: a count for every map legend and for every region with
  // properties. Regions use one column while they fit comfortably and two columns beyond that.
  function metrics(c, x, rows, project, countByRegion) {
    const top = 150, width = 495, bottom = 930, pad = 28, inner = width - 2 * pad;
    c.fillStyle = '#fff'; c.fillRect(x, top, width, bottom - top);
    c.fillStyle = '#6c5980'; c.font = '600 21px Arial'; c.fillText('PORTFOLIO AT A GLANCE', x + pad, top + 46);
    c.fillStyle = '#272333'; c.font = '600 56px Arial'; c.fillText(String(rows.length), x + pad, top + 112);
    c.fillStyle = '#6a6070'; c.font = '18px Arial'; c.fillText('properties in this export', x + pad, top + 140);

    const legends = project.legends || [], half = (inner - 20) / 2;
    c.fillStyle = '#5c5266'; c.font = '600 18px Arial'; c.fillText('By status', x + pad, top + 184);
    legends.forEach((item, i) => {
      const cx = x + pad + (i % 2) * (half + 20), cy = top + 200 + Math.floor(i / 2) * 30, n = rows.filter(r => r.legendId === item.id).length;
      c.fillStyle = item.color; c.fillRect(cx, cy + 3, 14, 14); c.strokeStyle = '#d9d3df'; c.strokeRect(cx + .5, cy + 3.5, 13, 13);
      c.font = '600 17px Arial'; c.fillStyle = '#342d3a'; c.textAlign = 'right'; c.fillText(String(n), cx + half, cy + 16); c.textAlign = 'left';
      c.font = '17px Arial'; c.fillStyle = '#5c5266'; c.fillText(fitText(c, item.label, half - 24 - c.measureText(String(n)).width - 10), cx + 24, cy + 16);
    });
    let y = top + 200 + Math.ceil(legends.length / 2) * 30 + 14;
    c.strokeStyle = '#e8e3ec'; c.beginPath(); c.moveTo(x + pad, y); c.lineTo(x + width - pad, y); c.stroke();

    const regions = Object.entries(countByRegion).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    c.fillStyle = '#5c5266'; c.font = '600 18px Arial'; c.fillText(`By region  ·  ${regions.length}`, x + pad, y + 34);
    y += 50;
    const space = bottom - 18 - y, columns = regions.length * 34 <= space ? 1 : 2, perColumn = Math.ceil(regions.length / columns);
    const rowH = Math.max(15, Math.min(columns === 1 ? 56 : 34, Math.floor(space / Math.max(1, perColumn)))), shown = Math.min(regions.length, Math.floor(space / rowH) * columns);
    const font = Math.max(11, Math.min(18, Math.floor(rowH * (rowH >= 30 ? .55 : .8)))), colW = columns === 1 ? inner : half, max = Math.max(1, regions[0]?.[1] || 1), bars = rowH >= 30;
    regions.slice(0, shown).forEach(([name, n], i) => {
      const cx = x + pad + Math.floor(i / perColumn) * (half + 20), cy = y + (i % perColumn) * rowH, baseline = cy + (bars ? font + 2 : rowH - (rowH - font) / 2 - 2);
      c.font = `600 ${font}px Arial`; c.fillStyle = '#342d3a'; c.textAlign = 'right'; c.fillText(String(n), cx + colW, baseline); c.textAlign = 'left';
      c.font = `${font}px Arial`; c.fillStyle = '#5c5266'; c.fillText(fitText(c, name, colW - c.measureText(String(n)).width - 14), cx, baseline);
      if (bars) {c.fillStyle = '#f0eaf6'; c.fillRect(cx, baseline + 8, colW, 4); c.fillStyle = project.palette.Live; c.fillRect(cx, baseline + 8, colW * n / max, 4)}
    });
    if (shown < regions.length) {c.font = '13px Arial'; c.fillStyle = '#6a6070'; c.fillText(`+ ${regions.length - shown} more regions in the table`, x + pad, bottom - 6)}
  }

  // Overview labels only: shorten with an ellipsis when a name cannot fit its column. The table always shows full values.
  function fitText(c, text, width) {
    if (c.measureText(text).width <= width) return text;
    let cut = text;
    while (cut.length > 1 && c.measureText(cut + '…').width > width) cut = cut.slice(0, -1);
    return cut + '…';
  }

  function drawMapPage(c, context, img, width) {
    const {project, rows, countryName, mapFocus, layers, includeLegend, includeDate} = context;
    c.fillStyle = '#7860bb'; c.font = '600 19px Arial'; c.fillText('PROPERTY MAP / PORTFOLIO REPORT', 70, 68);
    c.fillStyle = '#2c2935'; c.font = '600 45px Arial'; c.fillText(project.name, 70, 130);
    c.fillStyle = '#82778b'; c.font = '19px Arial';
    c.fillText(`${rows.length} properties in directory  ·  Map focus: ${countryName}${mapFocus ? ' / ' + mapFocus : ''}`, 70, 174);
    c.drawImage(img, 58, 252, 1220, 624);
    const byRegion = {};
    rows.forEach(r => {const key = regionLabel(r) || countryName; byRegion[key] = (byRegion[key] || 0) + 1});
    metrics(c, 1330, rows, project, byRegion);
    if (includeLegend) {
      const keys = mapLegendEntries(project, layers);
      let x = 70; c.font = '17px Arial';
      for (const [label, color] of keys) {c.fillStyle = color; c.fillRect(x, 940, 17, 17); c.fillStyle = '#766a7e'; c.fillText(label, x + 25, 954); x += c.measureText(label).width + 65}
    }
    c.strokeStyle = '#e4dfe8'; c.beginPath(); c.moveTo(70, 981); c.lineTo(Math.max(1850, width - 70), 981); c.stroke();
    c.fillStyle = '#8f8597'; c.font = '15px Arial';
    c.fillText('The map shows the selected country. The directory below includes every property in the chosen export scope.', 70, 1016);
    if (includeDate) {c.textAlign = 'right'; c.fillText(new Date().toLocaleDateString(), Math.max(1850, width - 70), 1016); c.textAlign = 'left'}
  }

  // PDF table pages: 28 lines each. With grouping on, every state starts with a section line, a state
  // that runs over a page is headed "(continued)", and a section line is never the last line of a page.
  function pdfPages(context) {
    const PAGE = 28, pages = [[]], rows = context.rows;
    const section = (row, continued) => ({type: 'section', label: value(row.state) + (continued ? ' (continued)' : ''), count: rows.filter(r => r.country === row.country && r.state === row.state).length});
    rows.forEach((row, index) => {
      const previous = rows[index - 1], opens = context.groupByState && (!previous || previous.state !== row.state || previous.country !== row.country);
      if (pages.at(-1).length + (opens ? 2 : 1) > PAGE) {pages.push([]); if (context.groupByState && !opens) pages.at(-1).push(section(row, true))}
      if (opens) pages.at(-1).push(section(row, false));
      pages.at(-1).push({type: 'row', row, index});
    });
    return pages;
  }

  function directory(c, items, allCount, columns, page, totalPages, startY, rowY, includeDate) {
    const {cols, width} = columns, rows = items.filter(item => item.type === 'row');
    c.fillStyle = '#42374c'; c.font = '600 31px Arial'; c.fillText('Complete property directory', 70, startY + 35);
    c.fillStyle = '#897d91'; c.font = '17px Arial';
    c.fillText(`${allCount} properties total  ·  Records ${rows.length ? rows[0].index + 1 : 0}–${rows.length ? rows.at(-1).index + 1 : 0}  ·  Page ${page.number} of ${totalPages}`, 70, startY + 68);
    c.fillStyle = '#ede8f2'; c.fillRect(60, rowY - 58, width - 120, 51);
    let x = 72;
    c.fillStyle = '#766883'; c.font = '600 15px Arial';
    cols.forEach(col => {c.fillText(col.label, x, rowY - 26); x += col.width});
    if (!rows.length) {c.fillStyle = '#8c8191'; c.font = '20px Arial'; c.fillText('No properties match this export scope.', 72, rowY + 35)}
    items.forEach((item, i) => {
      const top = rowY + i * ROW_HEIGHT;
      if (item.type === 'section') {
        c.fillStyle = '#e3dbee'; c.fillRect(60, top, width - 120, ROW_HEIGHT);
        c.fillStyle = '#3b2a5c'; c.font = '600 19px Arial';
        c.fillText(`${item.label}  ·  ${item.count} ${item.count === 1 ? 'property' : 'properties'}`, 72, top + 30);
        return;
      }
      c.fillStyle = item.index % 2 ? '#fff' : '#f9f7fb'; c.fillRect(60, top, width - 120, ROW_HEIGHT);
      c.fillStyle = '#453a50'; c.font = '19px Arial';
      let cellX = 72;
      cols.forEach(col => {c.fillText(col.cell(item.row, item.index), cellX, top + 30); cellX += col.width});
    });
    const footerY = rowY + items.length * ROW_HEIGHT + 38;
    c.fillStyle = '#8d8194'; c.font = '15px Arial';
    c.fillText('Property Map  ·  Full values shown on one line  ·  ' + (includeDate ? new Date().toLocaleDateString() : 'Portfolio report'), 70, footerY);
  }

  async function pdfBlob(context, columns, resolution, svgMarkup) {
    const doc = await PDFLib.PDFDocument.create();
    doc.setTitle(context.project.name + ' — complete property directory'); doc.setCreator('Property Map');
    const img = await mapImage(svgMarkup);
    const map = makeCanvas(Math.max(1920, columns.width), 1080, resolution);
    drawMapPage(map.c, context, img, map.canvas.width * SCALE_BASE / resolution);
    const first = await doc.embedPng(await (await toBlob(map.canvas)).arrayBuffer());
    doc.addPage([map.canvas.width / (resolution / 960), 540]).drawImage(first, {x: 0, y: 0, width: map.canvas.width / (resolution / 960), height: 540});
    map.canvas.width = map.canvas.height = 0;
    const pages = pdfPages(context), total = pages.length;
    for (let i = 0; i < total; i++) {
      const subset = pages[i];
      const logicalHeight = Math.max(365, CONTINUATION_ROW_Y + subset.length * ROW_HEIGHT + 90);
      const {canvas, c} = makeCanvas(columns.width, logicalHeight, resolution);
      directory(c, subset, context.rows.length, columns, {number: i + 1}, total, 85, CONTINUATION_ROW_Y, context.includeDate);
      const pageImage = await doc.embedPng(await (await toBlob(canvas)).arrayBuffer());
      const size = [columns.width / 2, logicalHeight / 2];
      doc.addPage(size).drawImage(pageImage, {x: 0, y: 0, width: size[0], height: size[1]});
      canvas.width = canvas.height = 0;
    }
    return new Blob([await doc.save()], {type: 'application/pdf'});
  }

  function drawSlide(c, context, plan, img) {
    const theme = THEMES[context.theme] || THEMES.light, {project, rows, layers} = context;
    c.fillStyle = theme.bg; c.fillRect(0, 0, SLIDE_W, plan.height);
    c.fillStyle = theme.ink; c.font = '600 44px Arial'; c.fillText(project.name, SLIDE_MARGIN, 84);
    c.fillStyle = theme.sub; c.font = '20px Arial';
    const facts = [`${rows.length} ${rows.length === 1 ? 'property' : 'properties'}`, context.countryName + (context.mapFocus ? ' / ' + context.mapFocus : '')];
    if (context.includeDate) facts.push(new Date().toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'}));
    c.fillText(facts.join('  ·  '), SLIDE_MARGIN, 122);
    const cardW = plan.listX ? plan.listX - SLIDE_MARGIN - 40 : SLIDE_W - 2 * SLIDE_MARGIN, cardH = LIST_BOTTOM - 148;
    c.fillStyle = theme.card; c.beginPath(); c.roundRect(SLIDE_MARGIN, 148, cardW, cardH, 16); c.fill();
    const notes = [];
    if (layers.dots) notes.push('Each dot is one property; dots show counts, not exact locations.');
    if (layers.locations) notes.push('Pins show properties with entered coordinates.');
    const legend = context.includeLegend ? mapLegendEntries(project, layers) : [];
    c.font = '18px Arial';
    let lines = legend.length ? 1 : 0, lineX = 0;
    for (const [label] of legend) {const w = c.measureText(label).width + 62; if (lineX && lineX + w > cardW - 48) {lines++; lineX = 0} lineX += w}
    const legendSpace = context.includeLegend ? 28 + lines * 32 + notes.length * 24 : 24;
    const mapW = Math.min(cardW - 32, (cardH - 32 - legendSpace) * 900 / 460), mapH = mapW * 460 / 900;
    c.drawImage(img, SLIDE_MARGIN + (cardW - mapW) / 2, 148 + 16 + (cardH - 32 - legendSpace - mapH) / 2, mapW, mapH);
    if (context.includeLegend) {
      let x = SLIDE_MARGIN + 28, y = 148 + cardH - legendSpace + 8;
      for (const [label, color] of legend) {
        const w = c.measureText(label).width + 62;
        if (x > SLIDE_MARGIN + 28 && x + w > SLIDE_MARGIN + cardW - 20) {x = SLIDE_MARGIN + 28; y += 32}
        c.fillStyle = color; c.fillRect(x, y, 18, 18); c.strokeStyle = theme.line; c.strokeRect(x + .5, y + .5, 17, 17);
        c.fillStyle = theme.sub; c.fillText(label, x + 28, y + 15); x += w;
      }
      c.font = '15px Arial'; c.fillStyle = theme.sub; y += 32;
      for (const note of notes) {c.fillText(note, SLIDE_MARGIN + 28, y + 16); y += 24}
    }
    let x = plan.listX;
    const size = plan.size, accent = project.palette.Live;
    for (const column of plan.columns) {
      let y = LIST_TOP;
      for (const item of column) {
        const lead = item.type === 'group' ? plan.groupH - plan.rowH : 0;
        if (item.type === 'group') {
          c.fillStyle = context.dotColors?.[item.group.state] || accent;
          c.beginPath(); c.arc(x + size * .4, y + plan.groupH - size * .75, size * .36, 0, Math.PI * 2); c.fill();
          c.fillStyle = theme.ink; c.font = `600 ${size}px Arial`;
        } else {c.fillStyle = theme.sub; c.font = `${size}px Arial`}
        item.lines.forEach((line, i) => c.fillText(line, x + size * 1.1, y + lead + (i + 1) * plan.rowH - size * .42));
        y += item.h;
      }
      x += plan.columnWidth + COLUMN_GAP;
    }
  }

  async function slideCanvas(context, svgMarkup, resolution) {
    const plan = slidePlan(context), {canvas, c} = makeCanvas(SLIDE_W, plan.height, resolution);
    drawSlide(c, context, plan, await mapImage(svgMarkup));
    return canvas;
  }

  const slidePreview = (context, svgMarkup) => slideCanvas(context, svgMarkup, 960);

  async function slideBlob(context, svgMarkup) {
    const canvas = await slideCanvas(context, svgMarkup, 3840), blob = await toBlob(canvas);
    canvas.width = canvas.height = 0;
    return {blob, extension: 'png'};
  }

  function toBlob(canvas) {return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('The image could not be encoded.')), 'image/png'))}

  return {rowsFor, columnsFor, pdfPages, pdfBlob, slidePlan, slidePreview, slideBlob};
})();
