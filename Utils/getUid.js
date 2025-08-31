// utils/getUid.js
export const getUid = (req) => {
  return (
    req.body?.usuario_log_id ??
    req.body?.userId ??
    req.query?.userId ??
    req.get('X-User-Id') ??
    req.user?.id ??
    null
  );
};
