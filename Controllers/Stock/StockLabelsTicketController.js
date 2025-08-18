// controllers/StockLabelsTicketController.js
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import { Op } from 'sequelize';

import { StockModel } from '../../Models/Stock/MD_TB_Stock.js';
import { ProductosModel } from '../../Models/Stock/MD_TB_Productos.js';
import { LocalesModel } from '../../Models/Stock/MD_TB_Locales.js';
import { LugaresModel } from '../../Models/Stock/MD_TB_Lugares.js';
import { EstadosModel } from '../../Models/Stock/MD_TB_Estados.js';
import { encodeNumericSku } from '../../Utils/skuNumeric.js';

/* --------------------------------- Medidas --------------------------------- */
const cmToPt = (cm) => cm * 28.3464567; // 1 cm = 28.3464567 pt
const mmToPt = (mm) => (mm / 10) * 28.3464567;
const ptToPx = (pt, dpi) => Math.round((pt / 72) * dpi);
const ptToMm = (pt) => (pt / 72) * 25.4;

/* ----------------------- Generadores 1D (Code128) / 2D (QR) ---------------- */
// Code128 robusto: ancho forzado, altura suficiente y quiet-zone interna opcional
const barcodePngCode128 = (
  text,
  { widthPt, dpi = 203, heightMm = 12, padPx = 0 } = {}
) =>
  new Promise((resolve, reject) => {
    const widthPx = ptToPx(widthPt, dpi);
    bwipjs.toBuffer(
      {
        bcid: 'code128',
        text: String(text),
        includetext: false,
        width: widthPx, // fuerza ocupar todo el ancho útil
        height: Number(heightMm), // altura de barras (mm): 10–14 recomendado
        paddingwidth: padPx, // quiet-zone interna en px por lado
        paddingheight: 0,
        monochrome: true
      },
      (err, png) => (err ? reject(err) : resolve(png))
    );
  });

// QR (ideal para lector 2D en 30×15)
const barcodePngQr = (
  text,
  { sidePt, dpi = 203, version = 2, eclevel = 'M' } = {}
) =>
  new Promise((resolve, reject) => {
    const sidePx = ptToPx(sidePt, dpi);
    bwipjs.toBuffer(
      {
        bcid: 'qrcode',
        text: String(text),
        version: Number(version) || 2, // v2 (25×25) alcanza para 18 dígitos
        eclevel: String(eclevel || 'M'),
        width: sidePx,
        monochrome: true
      },
      (err, png) => (err ? reject(err) : resolve(png))
    );
  });

/* ----------------------- Helpers para texto legible ------------------------ */
const middleEllipsis = (s, max) => {
  const str = String(s);
  if (str.length <= max) return str;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return str.slice(0, head) + '…' + str.slice(str.length - tail);
};

// Busca un tamaño de fuente que haga que el bloque de texto (wrapping) no supere maxHeightPt
const fitFontForBlock = (
  doc,
  text,
  widthPt,
  maxHeightPt,
  maxPt = 6,
  minPt = 3.5
) => {
  let lo = minPt,
    hi = maxPt,
    best = minPt;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    doc.fontSize(mid);
    const h = doc.heightOfString(String(text), {
      width: widthPt,
      align: 'center',
      lineGap: 0
    });
    if (h <= maxHeightPt) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < 0.05) break;
  }
  return best;
};

// Dibuja el SKU según modo: 'end' | 'middle' | 'wrap' | 'shrink' | 'full'
const drawSkuText = (
  doc,
  sku,
  {
    x,
    y,
    widthPt,
    mode = 'middle',
    fontPt = 6,
    minPt = 4.5,
    lines = 1,
    maxHeightPt = null // requerido en 'full'
  }
) => {
  doc.font('Helvetica-Bold').fillColor('#000');
  const text = String(sku);

  if (mode === 'full') {
    const size = fitFontForBlock(
      doc,
      text,
      widthPt,
      maxHeightPt,
      fontPt,
      minPt
    );
    doc
      .fontSize(size)
      .text(text, x, y, { width: widthPt, align: 'center', lineGap: 0 });
    return size + 2;
  }

  if (mode === 'wrap' && lines > 1) {
    doc
      .fontSize(fontPt)
      .text(text, x, y, { width: widthPt, align: 'center', lineGap: 0 });
    const lineH = fontPt + 1;
    return lines * lineH;
  }

  if (mode === 'shrink') {
    const size = fitFontForBlock(doc, text, widthPt, fontPt + 2, fontPt, minPt);
    doc.fontSize(size).text(text, x, y, { width: widthPt, align: 'center' });
    return size + 2;
  }

  // end / middle con elipsis
  const maxChars = 22;
  const legible =
    mode === 'middle'
      ? middleEllipsis(text, maxChars)
      : text.length > maxChars
      ? text.slice(0, maxChars - 1) + '…'
      : text;
  doc.fontSize(fontPt).text(legible, x, y, { width: widthPt, align: 'center' });
  return fontPt + 2;
};

/* ------------------------------ DEMO: 30x15 mm ------------------------------ */
export const imprimirEtiquetaTicketDemo = async (req, res) => {
  try {
    const {
      sku = 'DEMO-1234567890123456',
      showText = '0', // ↓ por defecto sin texto para priorizar lectura
      ancho_cm = '3',
      alto_cm = '1.5',
      quiet_mm = '3',
      font_pt = '6',
      height_mm,
      min_barcode_mm = '12',
      dpi: dpiQuery = '203',
      text_mode = 'middle',
      text_lines,
      min_font_pt = '3.5',
      // NUEVOS:
      symb = 'code128', // 'code128' | 'qrcode'
      qr_version = '2',
      qr_eclevel = 'M',
      pad_modules = '6' // quiet interna aprox (bwip -> px)
    } = req.query;

    const W = cmToPt(Number(ancho_cm));
    const H = cmToPt(Number(alto_cm));
    const Q = mmToPt(Number(quiet_mm));
    const dpi = Number(dpiQuery);
    const showSkuText = showText === '1' || showText === 'true';
    const fontPtNum = Number(font_pt);
    const textLines = Number(text_lines || (text_mode === 'wrap' ? 2 : 1));
    const padPx = Math.max(0, Number(pad_modules || 0)); // ~1px por módulo

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'inline; filename="etiqueta_ticket_demo.pdf"'
    );

    const doc = new PDFDocument({ autoFirstPage: false });
    doc.pipe(res);
    doc.addPage({ size: [W, H], margin: 0 });

    // Área útil
    const x0 = Q,
      y0 = Q;
    const widthPt = Math.max(1, W - Q - Q);
    const heightPt = Math.max(1, H - Q - Q);

    if (symb === 'qrcode') {
      // QR cuadrado ocupando el alto (≈15mm)
      const sidePt = Math.min(widthPt, heightPt);
      const png = await barcodePngQr(sku, {
        sidePt,
        dpi,
        version: qr_version,
        eclevel: qr_eclevel
      });
      doc.image(png, x0 + (widthPt - sidePt) / 2, y0, {
        width: sidePt,
        height: sidePt
      });

      if (showSkuText) {
        const yText = y0 + sidePt + mmToPt(1.5);
        if (yText < y0 + heightPt) {
          drawSkuText(doc, sku, {
            x: x0,
            y: yText,
            widthPt,
            mode: String(text_mode || 'middle'),
            fontPt: fontPtNum,
            minPt: Number(min_font_pt || 3.5),
            lines: textLines
          });
        }
      }
    } else {
      // Code128
      // Distribución vertical
      let barcodeHpt, textMaxHpt;
      if (showSkuText && text_mode === 'full') {
        barcodeHpt = mmToPt(Number(min_barcode_mm));
        barcodeHpt = Math.min(barcodeHpt, heightPt - 1);
        textMaxHpt = Math.max(0, heightPt - barcodeHpt - mmToPt(1.5));
      } else {
        const textH = showSkuText
          ? text_mode === 'wrap'
            ? textLines * (fontPtNum + 1)
            : fontPtNum + 2
          : 0;
        textMaxHpt = textH + (showSkuText ? mmToPt(1.5) : 0);
        barcodeHpt = Math.max(1, heightPt - textMaxHpt);
      }

      const effHeightMm = height_mm
        ? Number(height_mm)
        : Math.max(10, Math.round(ptToMm(barcodeHpt))); // mínimo 10mm

      const png = await barcodePngCode128(sku, {
        widthPt,
        dpi,
        heightMm: effHeightMm,
        padPx
      });

      doc.image(png, x0, y0, { width: widthPt, height: barcodeHpt });

      if (showSkuText) {
        const yText = y0 + barcodeHpt + mmToPt(1.5);
        drawSkuText(doc, sku, {
          x: x0,
          y: yText,
          widthPt,
          mode: String(text_mode || 'middle'),
          fontPt: fontPtNum,
          minPt: Number(min_font_pt || 3.5),
          lines: textLines,
          maxHeightPt: textMaxHpt
        });
      }
    }

    doc.end();
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ mensajeError: 'No se pudo generar la etiqueta demo (ticket).' });
  }
};

/* -------- REAL: N etiquetas 30x15 mm (1 por página) desde la DB ------------- */
// Misma semántica que imprimirEtiquetasReal: mode=group|item|all + copies=qty|1
export const imprimirEtiquetasTicket = async (req, res) => {
  const {
    mode = 'group',
    copies = 'qty',
    minQty = '1',

    // Layout/impresora
    ancho_cm = '3',
    alto_cm = '1.5',
    quiet_mm = '3', // ↑ margen externo recomendado
    font_pt = '6',
    height_mm, // si no viene, se calcula del espacio
    showText = '0', // ↓ por defecto sin texto (más alto para barras)
    dpi: dpiQuery = '203',
    text_mode = 'middle',
    text_lines,
    min_font_pt = '3.5',
    min_barcode_mm = '12', // ↑ altura mínima recomendada para 203dpi

    // Valor del código
    barcode_src = 'numeric', // 'numeric' (IDs) | 'legacy' (slug)

    // Texto visible
    text_gap_mm = '1.5',
    text_value = 'auto', // 'auto'|'slug'|'numeric'|'none'

    // NUEVOS: simbología
    symb = 'code128', // 'code128' | 'qrcode'
    qr_version = '2',
    qr_eclevel = 'M',
    pad_modules = '6' // quiet interna (px aprox) para Code128
  } = req.query;

  try {
    /* ------------------------ 1) Filtro de búsqueda -------------------------- */
    const where = {};
    if (mode === 'group') {
      const { producto_id, local_id, lugar_id, estado_id } = req.query;
      Object.assign(where, {
        producto_id: Number(producto_id),
        local_id: Number(local_id),
        lugar_id: Number(lugar_id),
        estado_id: Number(estado_id),
        cantidad: { [Op.gte]: Number(minQty) }
      });
    } else if (mode === 'item') {
      const { stock_id } = req.query;
      Object.assign(where, {
        id: Number(stock_id),
        cantidad: { [Op.gte]: Number(minQty) }
      });
    } else if (mode === 'all') {
      Object.assign(where, { cantidad: { [Op.gte]: Number(minQty) } });
    } else if (mode === 'multi') {
      // NUEVO: lista de combinaciones [{ producto_id, local_id, lugar_id, estado_id }, ...]
      let groups = [];
      try {
        const raw = req.query.groups || '[]';
        groups = JSON.parse(typeof raw === 'string' ? raw : '[]');
      } catch (e) {
        return res.status(400).json({ mensajeError: 'groups inválido' });
      }
      if (!Array.isArray(groups) || groups.length === 0) {
        return res.status(400).json({ mensajeError: 'groups vacío' });
      }

      // Normalizamos y validamos cada combinación
      const combos = groups
        .map((g) => ({
          producto_id: Number(g.producto_id),
          local_id: Number(g.local_id),
          lugar_id: Number(g.lugar_id),
          estado_id: Number(g.estado_id)
        }))
        .filter(
          (g) =>
            Number.isFinite(g.producto_id) &&
            Number.isFinite(g.local_id) &&
            Number.isFinite(g.lugar_id) &&
            Number.isFinite(g.estado_id)
        );

      if (!combos.length) {
        return res
          .status(400)
          .json({ mensajeError: 'groups sin combinaciones válidas' });
      }

      // cantidad > minQty y (OR de combinaciones)
      Object.assign(where, {
        cantidad: { [Op.gte]: Number(minQty) },
        [Op.or]: combos.map((g) => ({
          producto_id: g.producto_id,
          local_id: g.local_id,
          lugar_id: g.lugar_id,
          estado_id: g.estado_id
        }))
      });
    } else {
      return res.status(400).json({ mensajeError: 'mode inválido' });
    }

    const include = [
      {
        model: ProductosModel,
        as: 'producto',
        attributes: ['id', 'nombre', 'precio']
      },
      { model: LocalesModel, as: 'locale', attributes: ['nombre'] },
      { model: LugaresModel, as: 'lugare', attributes: ['nombre'] },
      { model: EstadosModel, as: 'estado', attributes: ['nombre'] }
    ];

    const items = await StockModel.findAll({
      where,
      include,
      order: [['id', 'ASC']]
    });

    if (!items.length) {
      return res
        .status(404)
        .json({ mensajeError: 'No hay registros para imprimir.' });
    }

    /* --------------------------- 2) PDF etiqueta por página ------------------ */
    const W = cmToPt(Number(ancho_cm));
    const H = cmToPt(Number(alto_cm));
    const Q = mmToPt(Number(quiet_mm));
    const dpi = Number(dpiQuery);
    const showSkuText = showText === '1' || showText === 'true';
    const fontPtNum = Number(font_pt);
    const textLines = Number(text_lines || (text_mode === 'wrap' ? 2 : 1));
    const padPx = Math.max(0, Number(pad_modules || 0));
    const gapPt = mmToPt(Number(text_gap_mm));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'inline; filename="etiquetas_ticket.pdf"'
    );

    const doc = new PDFDocument({ autoFirstPage: false });
    doc.pipe(res);

    // Cache PNGs por (symb + valor + geom)
    const barcodeCache = new Map();
    const getBarcode = async (
      value,
      widthPt,
      effHeightMm,
      symbUsed,
      sqSidePt
    ) => {
      const key = `${symbUsed}|${value}|${Math.round(widthPt)}|${dpi}|${
        effHeightMm || 0
      }|${Math.round(sqSidePt || 0)}|${padPx}|${qr_version}|${qr_eclevel}`;
      if (!barcodeCache.has(key)) {
        let png;
        if (symbUsed === 'qrcode') {
          png = await barcodePngQr(String(value), {
            sidePt: sqSidePt,
            dpi,
            version: qr_version,
            eclevel: qr_eclevel
          });
        } else {
          png = await barcodePngCode128(String(value), {
            widthPt,
            dpi,
            heightMm: effHeightMm,
            padPx
          });
        }
        barcodeCache.set(key, png);
      }
      return barcodeCache.get(key);
    };

    /* eslint-disable no-await-in-loop */
    for (const it of items) {
      const visibleSku = it.codigo_sku; // slug actual (texto humano)
      const numericSku = encodeNumericSku({
        producto_id: it.producto_id,
        local_id: it.local_id,
        lugar_id: it.lugar_id,
        estado_id: it.estado_id ?? 0
      });

      const copiesCount =
        copies === 'qty' ? Math.max(1, Number(it.cantidad || 0)) : 1;

      for (let i = 0; i < copiesCount; i++) {
        doc.addPage({ size: [W, H], margin: 0 });

        const x0 = Q,
          y0 = Q;
        const widthPt = Math.max(1, W - Q - Q);
        const heightPt = Math.max(1, H - Q - Q);

        const barcodeValue =
          barcode_src === 'numeric' ? numericSku : String(visibleSku);

        const productName = (it.producto?.nombre || '').toUpperCase(); // legible
        const humanText =
          text_value === 'none'
            ? ''
            : text_value === 'slug'
            ? visibleSku
            : text_value === 'numeric'
            ? numericSku
            : text_value === 'name'
            ? productName
            : // auto:
            barcode_src === 'numeric'
            ? numericSku
            : visibleSku;

        if (symb === 'qrcode') {
          // ---- 2D: QR cuadrado aprovechando el alto (≈15mm)
          const sidePt = Math.min(widthPt, heightPt);
          const png = await getBarcode(
            barcodeValue,
            widthPt,
            0,
            'qrcode',
            sidePt
          );
          doc.image(png, x0 + (widthPt - sidePt) / 2, y0, {
            width: sidePt,
            height: sidePt
          });

          if (showSkuText) {
            const yText = y0 + sidePt + gapPt;
            if (yText < y0 + heightPt) {
              drawSkuText(doc, humanText, {
                x: x0,
                y: yText,
                widthPt,
                mode: String(text_mode || 'middle'),
                fontPt: fontPtNum,
                minPt: Number(min_font_pt || 3.5),
                lines: textLines
              });
            }
          }
        } else {
          // ---- 1D: Code128 robusto
          let barcodeHpt, textMaxHpt;
          const showTextBlock = showSkuText && humanText;
          if (showTextBlock && text_mode === 'full') {
            barcodeHpt = mmToPt(Number(min_barcode_mm));
            barcodeHpt = Math.min(barcodeHpt, heightPt - 1);
            textMaxHpt = Math.max(0, heightPt - barcodeHpt - gapPt);
          } else {
            const textH = showTextBlock
              ? text_mode === 'wrap'
                ? textLines * (fontPtNum + 1)
                : fontPtNum + 2
              : 0;
            textMaxHpt = textH + (showTextBlock ? gapPt : 0);
            barcodeHpt = Math.max(1, heightPt - textMaxHpt);
          }

          const effHeightMm = height_mm
            ? Number(height_mm)
            : Math.max(10, Math.round(ptToMm(barcodeHpt))); // mínimo 10mm

          const png = await getBarcode(
            barcodeValue,
            widthPt,
            effHeightMm,
            'code128',
            0
          );
          doc.image(png, x0, y0, { width: widthPt, height: barcodeHpt });

          if (showTextBlock) {
            const yText = y0 + barcodeHpt + gapPt;
            drawSkuText(doc, humanText, {
              x: x0,
              y: yText,
              widthPt,
              mode: String(text_mode || 'middle'),
              fontPt: fontPtNum,
              minPt: Number(min_font_pt || 3.5),
              lines: textLines,
              maxHeightPt: text_mode === 'full' ? textMaxHpt : undefined
            });
          }
        }
      }
    }
    /* eslint-enable no-await-in-loop */

    doc.end();
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ mensajeError: 'No se pudo generar el PDF (ticket).' });
  }
};
