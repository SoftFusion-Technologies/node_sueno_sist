// routes/importRouter.js
import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import sequelize from '../DataBase/db.js';
import importConfig from '../config/importConfig.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/:tabla', upload.single('file'), async (req, res) => {
  const { tabla } = req.params;
  const config = importConfig[tabla];

  if (!config) {
    return res.status(400).json({ message: `Tabla no soportada: ${tabla}` });
  }

  const file = req.file;
  if (!file) {
    return res.status(400).json({ message: 'No se ha subido ningún archivo' });
  }

  try {
    const workbook = XLSX.readFile(file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (!rows.length) {
      throw new Error('El archivo está vacío');
    }

    const headers = Object.keys(rows[0]).map((h) => h.trim().toLowerCase());
    const missing = config.required.filter(
      (col) => !headers.includes(col.toLowerCase())
    );

    if (missing.length) {
      throw new Error(`Faltan columnas obligatorias: ${missing.join(', ')}`);
    }

    const validRows = rows.filter((row) =>
      config.required.every((col) => row[col] !== null && row[col] !== '')
    );

    if (!validRows.length) {
      throw new Error('No se encontraron filas con todos los datos requeridos');
    }

    const t = await sequelize.transaction();
    try {
      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const transformed = config.transform(row);
        await config.model.create(transformed, { transaction: t });
      }

      await t.commit();
      res.json({
        message: `Importación a tabla "${tabla}" exitosa`,
        total: validRows.length
      });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (error) {
    res.status(400).json({
      message: 'Error al procesar el archivo',
      detalle: error.message
    });
  } finally {
    if (file) fs.unlinkSync(file.path);
  }
});

export default router;
