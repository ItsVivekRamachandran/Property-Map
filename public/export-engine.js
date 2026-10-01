/* Complete, measured, single-line property exports. No record or cell is elided. */
const ExportEngine = (() => {
  const SCALE_BASE = 1920;
  const ROW_HEIGHT = 46;
  const MAX_PIXELS = 32_000_000;
  const MAX_EDGE = 16000;
  const MAP_ROW_Y = 1235;
  const CONTINUATION_ROW_Y = 270;
  const regionLabel = r => r.state;
  const value = v => v === null || v === undefined || v === '' ? '—' : String(v);
  const POSTER_MAP_WIDTH = 1120;
  const POSTER_LIST_X = 1220;
  const POSTER_LIST_TOP = 258;
  const POSTER_ROW_HEIGHT = 33;
  const POSTER_GROUP_HEIGHT = 49;

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

  function capacity(width, resolution, rowY) {
    const scale = resolution / SCALE_BASE;
    if (width * scale > MAX_EDGE) throw Error('An unusually long property value exceeds the export width. Use a shorter value or CSV.');
    const maxLogicalHeight = Math.floor(Math.min(12000, MAX_EDGE / scale, MAX_PIXELS / (width * scale * scale)));
    const n = Math.floor((maxLogicalHeight - rowY - 90) / ROW_HEIGHT);
    if (n < 1) throw Error('This combination of fields and resolution exceeds the image limit. Choose HD or export PDF.');
    return n;
  }

  function pngPlan(count, width, resolution) {
    const first = capacity(width, resolution, MAP_ROW_Y);
    const later = capacity(width, resolution, CONTINUATION_ROW_Y);
    const parts = [{start: 0, count: Math.min(count, first), map: true}];
    for (let start = first; start < count; start += later) parts.push({start, count: Math.min(later, count - start), map: false});
    return parts;
  }

  function posterGroups(rows, countryNames) {
    const groups = [];
    const oneCountry = new Set(rows.map(r => r.country)).size <= 1;
    for (const row of rows) {
      const label = oneCountry ? value(row.state) : `${countryNames[row.country] || row.country} / ${value(row.state)}`;
      if (!groups.length || groups.at(-1).label !== label) groups.push({label, rows: []});
      groups.at(-1).rows.push(row);
    }
    return groups;
  }

  function posterColumns(groups, count) {
    const totalHeight = groups.reduce((sum, group) => sum + POSTER_GROUP_HEIGHT + group.rows.length * POSTER_ROW_HEIGHT, 0);
    const target = Math.max(750, Math.ceil(totalHeight / count) + POSTER_GROUP_HEIGHT);
    const columns = Array.from({length: count}, () => []);
    let index = 0, height = 0;
    for (const group of groups) {
      if (index < count - 1 && height && height + POSTER_GROUP_HEIGHT + POSTER_ROW_HEIGHT > target) {index++; height = 0}
      columns[index].push({type: 'group', label: group.label, count: group.rows.length});
      height += POSTER_GROUP_HEIGHT;
      for (let i = 0; i < group.rows.length; i++) {
        if (index < count - 1 && height + POSTER_ROW_HEIGHT > target) {
          index++; height = 0;
          columns[index].push({type: 'group', label: group.label + ' (continued)', count: group.rows.length});
          height += POSTER_GROUP_HEIGHT;
        }
        columns[index].push({type: 'property', row: group.rows[i]});
        height += POSTER_ROW_HEIGHT;
      }
    }
    return columns;
  }

  function posterPlan(rows, countryNames, resolution, projectName = '') {
    const groups = posterGroups(rows, countryNames);
    const ctx = document.createElement('canvas').getContext('2d');
    const scale = resolution / SCALE_BASE;
    for (let n = 2; n <= 16; n++) {
      const columns = posterColumns(groups, n).filter(column => column.length);
      if (!columns.length) columns.push([]);
      const columnWidths = columns.map(column => Math.max(300, Math.ceil(column.reduce((max, item) => {
        ctx.font = item.type === 'group' ? '600 19px Arial' : '18px Arial';
        const line = item.type === 'group' ? `${item.label}  ·  ${item.count}` :
          `${value(item.row.code)}  ·  ${value(item.row.name)}`;
        return Math.max(max, ctx.measureText(line).width + (item.type === 'group' ? 30 : 50));
      }, 0))));
      ctx.font = '600 39px Arial';
      const width = Math.max(1920, POSTER_LIST_X + columnWidths.reduce((sum, w) => sum + w, 0) + (columns.length - 1) * 20 + 45,
        Math.ceil(ctx.measureText(projectName).width + 100));
      const height = Math.max(1030, POSTER_LIST_TOP + Math.max(...columns.map(col => col.reduce((sum, item) =>
        sum + (item.type === 'group' ? POSTER_GROUP_HEIGHT : POSTER_ROW_HEIGHT), 0))) + 86);
      if (width * scale <= MAX_EDGE && height * scale <= MAX_EDGE && width * height * scale * scale <= MAX_PIXELS)
        return {groups, columns, columnWidths, width, height};
    }
    throw Error('This portfolio exceeds the browser’s single-image limit at this resolution. Choose HD or the complete paginated report.');
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

  function metrics(c, x, rows, palette, countByRegion) {
    const live = rows.filter(r => r.status === 'Live').length;
    const opportunity = rows.filter(r => r.status === 'Opportunity').length;
    c.fillStyle = '#fff'; c.fillRect(x, 260, 495, 650);
    c.fillStyle = '#6c5980'; c.font = '600 23px Arial'; c.fillText('PORTFOLIO AT A GLANCE', x + 28, 310);
    c.fillStyle = '#272333'; c.font = '600 64px Arial'; c.fillText(String(rows.length), x + 28, 399);
    c.fillStyle = '#867b90'; c.font = '19px Arial'; c.fillText('properties in this export', x + 28, 431);
    c.fillStyle = palette.Live; c.fillRect(x + 30, 465, 13, 13);
    c.fillStyle = '#6a6070'; c.font = '19px Arial'; c.fillText(`Live  ${live}`, x + 53, 478);
    c.fillStyle = palette.Opportunity; c.fillRect(x + 248, 465, 13, 13);
    c.fillStyle = '#6a6070'; c.fillText(`Opportunities  ${opportunity}`, x + 270, 478);
    c.strokeStyle = '#e8e3ec'; c.beginPath(); c.moveTo(x + 28, 509); c.lineTo(x + 467, 509); c.stroke();
    c.fillStyle = '#766d80'; c.font = '600 20px Arial'; c.fillText('Top regions', x + 28, 555);
    Object.entries(countByRegion).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([name, n], i) => {
      const y = 596 + i * 58;
      c.fillStyle = '#625769'; c.font = '18px Arial'; c.fillText(name, x + 28, y);
      c.textAlign = 'right'; c.font = '600 19px Arial'; c.fillText(String(n), x + 467, y); c.textAlign = 'left';
      c.fillStyle = '#f0eaf6'; c.fillRect(x + 28, y + 9, 439, 4);
      c.fillStyle = palette.Live; c.fillRect(x + 28, y + 9, 439 * n / Math.max(1, rows.length), 4);
    });
  }

  function drawMapPage(c, context, img, width) {
    const {project, rows, countryName, mapFocus, mapMode, includeLegend, includeDate} = context;
    c.fillStyle = '#7860bb'; c.font = '600 19px Arial'; c.fillText('PROPERTY MAP / PORTFOLIO REPORT', 70, 68);
    c.fillStyle = '#2c2935'; c.font = '600 45px Arial'; c.fillText(project.name, 70, 130);
    c.fillStyle = '#82778b'; c.font = '19px Arial';
    c.fillText(`${rows.length} properties in directory  ·  Map focus: ${countryName}${mapFocus ? ' / ' + mapFocus : ''}`, 70, 174);
    c.drawImage(img, 58, 252, 1220, 624);
    const byRegion = {};
    rows.forEach(r => {const key = regionLabel(r) || countryName; byRegion[key] = (byRegion[key] || 0) + 1});
    metrics(c, 1330, rows, project.palette, byRegion);
    if (includeLegend) {
      const keys = mapMode === 'count' ? [['Low count', '#ded2f2'], ['High count', project.palette.Live], ['No properties', '#eeeef1']] :
        [['Live', project.palette.Live], ['Opportunity', project.palette.Opportunity], ['Competition', project.palette.Competition], ['No credit', project.palette['No credit']], ['Prohibited', project.palette.Prohibited]];
      let x = 70; c.font = '17px Arial';
      for (const [label, color] of keys) {c.fillStyle = color; c.fillRect(x, 940, 17, 17); c.fillStyle = '#766a7e'; c.fillText(label, x + 25, 954); x += c.measureText(label).width + 65}
    }
    c.strokeStyle = '#e4dfe8'; c.beginPath(); c.moveTo(70, 981); c.lineTo(Math.max(1850, width - 70), 981); c.stroke();
    c.fillStyle = '#8f8597'; c.font = '15px Arial';
    c.fillText('The map shows the selected country. The directory below includes every property in the chosen export scope.', 70, 1016);
    if (includeDate) {c.textAlign = 'right'; c.fillText(new Date().toLocaleDateString(), Math.max(1850, width - 70), 1016); c.textAlign = 'left'}
  }

  function directory(c, rows, allCount, columns, page, totalPages, startY, rowY, includeDate) {
    const {cols, width} = columns;
    c.fillStyle = '#42374c'; c.font = '600 31px Arial'; c.fillText('Complete property directory', 70, startY + 35);
    c.fillStyle = '#897d91'; c.font = '17px Arial';
    c.fillText(`${allCount} properties total  ·  Records ${rows.length ? page.start + 1 : 0}–${page.start + rows.length}  ·  Page ${page.number} of ${totalPages}`, 70, startY + 68);
    c.fillStyle = '#ede8f2'; c.fillRect(60, rowY - 58, width - 120, 51);
    let x = 72;
    c.fillStyle = '#766883'; c.font = '600 15px Arial';
    cols.forEach(col => {c.fillText(col.label, x, rowY - 26); x += col.width});
    if (!rows.length) {c.fillStyle = '#8c8191'; c.font = '20px Arial'; c.fillText('No properties match this export scope.', 72, rowY + 35)}
    rows.forEach((r, i) => {
      const top = rowY + i * ROW_HEIGHT;
      c.fillStyle = i % 2 ? '#fff' : '#f9f7fb'; c.fillRect(60, top, width - 120, ROW_HEIGHT);
      c.fillStyle = '#453a50'; c.font = '19px Arial';
      let cellX = 72;
      cols.forEach(col => {c.fillText(col.cell(r, page.start + i), cellX, top + 30); cellX += col.width});
    });
    const footerY = rowY + rows.length * ROW_HEIGHT + 38;
    c.fillStyle = '#8d8194'; c.font = '15px Arial';
    c.fillText('Property Map  ·  Full values shown on one line  ·  ' + (includeDate ? new Date().toLocaleDateString() : 'Portfolio report'), 70, footerY);
  }

  function pngPage(context, columns, resolution, img, part, number, total) {
    const rowY = part.map ? MAP_ROW_Y : CONTINUATION_ROW_Y;
    const logicalHeight = Math.max(part.map ? 1290 : 365, rowY + part.count * ROW_HEIGHT + 90);
    const {canvas, c} = makeCanvas(columns.width, logicalHeight, resolution);
    if (part.map) drawMapPage(c, context, img, columns.width);
    const entries = context.rows.slice(part.start, part.start + part.count);
    directory(c, entries, context.rows.length, columns, {start: part.start, number}, total,
      part.map ? 1050 : 85, rowY, context.includeDate);
    return canvas;
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
    const chunk = 28, total = Math.max(1, Math.ceil(context.rows.length / chunk));
    for (let i = 0; i < total; i++) {
      const start = i * chunk, subset = context.rows.slice(start, start + chunk);
      const logicalHeight = Math.max(365, CONTINUATION_ROW_Y + subset.length * ROW_HEIGHT + 90);
      const {canvas, c} = makeCanvas(columns.width, logicalHeight, resolution);
      directory(c, subset, context.rows.length, columns, {start, number: i + 1}, total, 85, CONTINUATION_ROW_Y, context.includeDate);
      const pageImage = await doc.embedPng(await (await toBlob(canvas)).arrayBuffer());
      const size = [columns.width / 2, logicalHeight / 2];
      doc.addPage(size).drawImage(pageImage, {x: 0, y: 0, width: size[0], height: size[1]});
      canvas.width = canvas.height = 0;
    }
    return new Blob([await doc.save()], {type: 'application/pdf'});
  }

  async function posterBlob(context, countryNames, resolution, svgMarkup) {
    const layout = posterPlan(context.rows, countryNames, resolution, context.project.name);
    const {canvas, c} = makeCanvas(layout.width, layout.height, resolution);
    const img = await mapImage(svgMarkup);
    c.fillStyle = '#343139'; c.fillRect(0, 0, layout.width, 121);
    c.fillStyle = '#cbbbed'; c.font = '600 17px Arial'; c.fillText('PROPERTY MAP  /  PORTFOLIO VIEW', 44, 37);
    c.fillStyle = '#fff'; c.font = '600 39px Arial'; c.fillText(context.project.name, 44, 91);
    c.fillStyle = '#fff'; c.fillRect(30, 148, 1160, 839);
    c.fillStyle = '#82748e'; c.font = '600 18px Arial'; c.fillText('GEOGRAPHIC VIEW', 52, 188);
    c.fillStyle = '#5d5366'; c.font = '18px Arial';
    c.fillText(`${context.countryName}${context.mapFocus ? ' / ' + context.mapFocus : ''}`, 52, 220);
    c.drawImage(img, 48, 233, POSTER_MAP_WIDTH, 571);
    c.strokeStyle = '#e8e2ec'; c.beginPath(); c.moveTo(52, 824); c.lineTo(1168, 824); c.stroke();
    c.fillStyle = '#342d3a'; c.font = '600 37px Arial'; c.fillText(String(context.rows.length), 54, 881);
    c.fillStyle = '#85798c'; c.font = '17px Arial'; c.fillText('properties in this image', 54, 911);
    const live = context.rows.filter(r => r.status === 'Live').length;
    const opportunity = context.rows.filter(r => r.status === 'Opportunity').length;
    c.font = '18px Arial';
    c.fillStyle = context.project.palette.Live; c.fillRect(344, 858, 15, 15);
    c.fillStyle = '#615767'; c.fillText(`Live  ${live}`, 368, 872);
    c.fillStyle = context.project.palette.Opportunity; c.fillRect(535, 858, 15, 15);
    c.fillStyle = '#615767'; c.fillText(`Opportunities  ${opportunity}`, 559, 872);
    if (context.includeLegend) {
      const legend = context.mapMode === 'count' ?
        [['Low count', '#ded2f2'], ['High count', context.project.palette.Live], ['No properties', '#eeeef1']] :
        [['Live', context.project.palette.Live], ['Opportunity', context.project.palette.Opportunity],
          ['Competition', context.project.palette.Competition], ['No credit', context.project.palette['No credit']],
          ['Prohibited', context.project.palette.Prohibited]];
      let legendX = 54;
      c.font = '16px Arial';
      for (const [label, color] of legend) {
        c.fillStyle = color; c.fillRect(legendX, 927, 15, 15);
        c.fillStyle = '#756b7e'; c.fillText(label, legendX + 23, 940);
        legendX += c.measureText(label).width + 68;
      }
    }
    c.fillStyle = '#958a9b'; c.font = '15px Arial';
    c.fillText('The map shows the selected country; the list includes every property in the chosen scope.', 53, 972);

    c.fillStyle = '#fff'; c.fillRect(1200, 148, layout.width - 1230, layout.height - 178);
    c.fillStyle = '#3b3342'; c.font = '600 27px Arial'; c.fillText('Property directory', POSTER_LIST_X, 192);
    c.fillStyle = '#897d91'; c.font = '17px Arial';
    c.fillText(`${context.rows.length} properties  ·  ${layout.groups.length} regions  ·  ${layout.columns.length} list columns`, POSTER_LIST_X, 222);
    if (!context.rows.length) {c.fillText('No properties match this export scope.', POSTER_LIST_X, 290)}
    let columnX = POSTER_LIST_X;
    layout.columns.forEach((column, index) => {
      const x = columnX;
      let y = POSTER_LIST_TOP;
      for (const item of column) {
        if (item.type === 'group') {
          c.fillStyle = '#eee8f4'; c.fillRect(x - 8, y, layout.columnWidths[index], 42);
          c.fillStyle = '#675281'; c.font = '600 19px Arial';
          c.fillText(`${item.label}  ·  ${item.count}`, x + 3, y + 28);
          y += POSTER_GROUP_HEIGHT;
        } else {
          const {row} = item;
          c.fillStyle = row.status === 'Opportunity' ? context.project.palette.Opportunity : context.project.palette.Live;
          c.beginPath(); c.arc(x + 1, y + 13, 5, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#524958'; c.font = '18px Arial';
          c.fillText(`${value(row.code)}  ·  ${value(row.name)}`, x + 16, y + 19);
          y += POSTER_ROW_HEIGHT;
        }
      }
      columnX += layout.columnWidths[index] + 20;
    });
    c.fillStyle = '#908596'; c.font = '15px Arial';
    c.fillText(`Property Map  ·  Complete property list${context.includeDate ? '  ·  ' + new Date().toLocaleDateString() : ''}`, 45, layout.height - 34);
    const blob = await toBlob(canvas);
    canvas.width = canvas.height = 0;
    return {blob, extension: 'png', pageCount: 1};
  }

  function toBlob(canvas) {return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('The image could not be encoded.')), 'image/png'))}

  async function pngBlob(context, columns, resolution, svgMarkup, baseName) {
    const plan = pngPlan(context.rows.length, columns.width, resolution);
    const img = await mapImage(svgMarkup);
    if (plan.length === 1) {
      const canvas = pngPage(context, columns, resolution, img, plan[0], 1, 1);
      const blob = await toBlob(canvas);
      canvas.width = canvas.height = 0;
      return {blob, extension: 'png', pageCount: 1};
    }
    const archive = new JSZip();
    const digits = String(plan.length).length;
    for (let i = 0; i < plan.length; i++) {
      const canvas = pngPage(context, columns, resolution, img, plan[i], i + 1, plan.length);
      const blob = await toBlob(canvas);
      canvas.width = canvas.height = 0;
      const n = String(i + 1).padStart(digits, '0');
      archive.file(`${baseName}-page-${n}-of-${plan.length}.png`, blob);
    }
    archive.file('READ-ME.txt', `${context.project.name}\n${context.rows.length} properties across ${plan.length} numbered PNG pages. All values are shown without truncation.\n`);
    return {blob: await archive.generateAsync({type: 'blob', compression: 'DEFLATE', compressionOptions: {level: 6}}), extension: 'zip', pageCount: plan.length};
  }

  return {rowsFor, columnsFor, pngPlan, pngBlob, pdfBlob, posterPlan, posterBlob};
})();
