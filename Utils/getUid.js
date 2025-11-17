// utils/getUid.js
export const getUid = (req) => {
  const raw =
    req.body?.usuario_log_id ??
    req.body?.userId ??
    req.query?.usuario_log_id ?? // 👈 importante para GET con interceptor
    req.query?.userId ??
    req.get('X-User-Id') ??
    req.user?.id ??
    null;

  const n = raw != null ? Number(raw) : null;

  if (!n || Number.isNaN(n) || n <= 0) {
    // opcional: loguear para debug
    // console.warn('[getUid] No se pudo resolver uid', {
    //   bodyUsuario: req.body?.usuario_log_id,
    //   queryUsuario: req.query?.usuario_log_id,
    //   authUser: req.user
    // });
    return null;
  }

  return n;
};
