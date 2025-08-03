// Calcular el total con ajuste y cuotas
import { MediosPagoCuotasModel } from '../../Models/Ventas/MD_TB_MediosPagoCuotas.js';
import { MediosPagoModel } from '../../Models/Ventas/MD_TB_MediosPago.js';

export const CALC_TotalFinal_CTS = async (req, res) => {
  const { carrito, medio_pago_id, cuotas, descuento_personalizado } = req.body;

  if (!Array.isArray(carrito) || carrito.length === 0 || !medio_pago_id) {
    return res.status(400).json({ mensajeError: 'Faltan datos obligatorios' });
  }

  const precio_base = carrito.reduce(
    (acc, item) => acc + Number(item.precio) * Number(item.cantidad),
    0
  );

  try {
    const medio = await MediosPagoModel.findByPk(medio_pago_id);
    if (!medio) {
      return res
        .status(404)
        .json({ mensajeError: 'Medio de pago no encontrado' });
    }

    let ajuste_porcentual = medio.ajuste_porcentual || 0;
    let total = precio_base;
    let descuentoReal = 0;

    // Aplicar descuento personalizado
    if (
      descuento_personalizado !== undefined &&
      descuento_personalizado !== null &&
      !isNaN(Number(descuento_personalizado)) &&
      Number(descuento_personalizado) > 0
    ) {
      descuentoReal = Number(descuento_personalizado);
      total *= 1 - descuentoReal / 100;
      ajuste_porcentual = -descuentoReal;
    } else if (ajuste_porcentual !== 0) {
      total *= 1 + ajuste_porcentual / 100;
      if (ajuste_porcentual < 0) descuentoReal = Math.abs(ajuste_porcentual);
    }

    let porcentaje_recargo = 0;
    let recargo_monto_cuotas = 0;

    // Aplicar recargo por cuotas
    if (cuotas && cuotas > 1) {
      const recargo = await MediosPagoCuotasModel.findOne({
        where: { medio_pago_id, cuotas }
      });

      if (recargo) {
        porcentaje_recargo = recargo.porcentaje_recargo;
        if (porcentaje_recargo > 0) {
          recargo_monto_cuotas = parseFloat(
            ((total * porcentaje_recargo) / 100).toFixed(2)
          );
          total += recargo_monto_cuotas;
        }
      }
    }

    const totalRedondeado = parseFloat(total.toFixed(2));

    let montoPorCuota = null;
    let diferencia_redondeo = 0;

    if (cuotas && cuotas > 1) {
      const cuotaRedondeada =
        Math.floor((totalRedondeado / cuotas) * 100) / 100;
      const totalRecalculado = parseFloat(
        (cuotaRedondeada * cuotas).toFixed(2)
      );
      diferencia_redondeo = parseFloat(
        (totalRedondeado - totalRecalculado).toFixed(2)
      );
      montoPorCuota = cuotaRedondeada;
    }

    return res.json({
      precio_base,
      ajuste_porcentual,
      porcentaje_recargo_cuotas: porcentaje_recargo,
      recargo_monto_cuotas,
      cuotas: cuotas || 1,
      total: totalRedondeado,
      monto_por_cuota: montoPorCuota,
      diferencia_redondeo
    });
  } catch (error) {
    console.error('🧨 Error CALC_TotalFinal_CTS:', error);
    return res.status(500).json({ mensajeError: error.message });
  }
};
