import db from '../../DataBase/db.js';
import { RecaptacionCampanasModel } from '../../Models/Recaptacion/MD_TB_RecaptacionCampanas.js';
import { RecaptacionClientesModel } from '../../Models/Recaptacion/MD_TB_RecaptacionClientes.js';
import { ClienteModel } from '../../Models/MD_TB_Clientes.js';

export const OBRS_EstadisticasRecaptacion_CTS = async (req, res) => {
  try {
    const totalCampanas = await RecaptacionCampanasModel.count();
    const totalAsignados = await RecaptacionClientesModel.count();
    const totalCompraron = await RecaptacionClientesModel.count({
      where: { respuesta: 'comprado' }
    });

    // Ranking de campañas
    const ranking = await RecaptacionClientesModel.findAll({
      attributes: [
        'campana_id',
        [db.fn('COUNT', db.col('recaptacion_clientes.id')), 'asignados'],
        [
          db.literal(
            `SUM(CASE WHEN recaptacion_clientes.respuesta = 'comprado' THEN 1 ELSE 0 END)`
          ),
          'compras'
        ]
      ],
      group: ['recaptacion_clientes.campana_id'],
      include: {
        model: RecaptacionCampanasModel,
        attributes: ['nombre']
      },
      order: [[db.literal('asignados'), 'DESC']]
    });
    

    res.json({
      totalCampanas,
      totalAsignados,
      totalCompraron,
      ranking
    });
  } catch (error) {
    console.error('Error en estadísticas:', error);
    res.status(500).json({ mensajeError: 'Error al cargar estadísticas' });
  }
};
