"""
Audit logs endpoint — faqat superadmin/director/deputy_director ko'radi.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from datetime import datetime
from app import db
from app.models import AuditLog
from app.utils import is_superadmin

audit_bp = Blueprint('audit_logs', __name__)


def _parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00'))
    except ValueError:
        return None


@audit_bp.route('', methods=['GET'])
@jwt_required()
def list_audit():
    """Barcha loglar (filter va sahifalash bilan).

    Query params:
        user_id, entity_type, entity_id, action  — teng bo'yicha filter
        q                                        — ismda/entity_label da qidiruv
        from, to                                 — ISO date
        limit  (default 100, max 500)
        offset (default 0)
    """
    role = get_jwt().get('role', '')
    if not is_superadmin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    q = AuditLog.query

    for param, col in [
        ('user_id', AuditLog.user_id),
        ('entity_type', AuditLog.entity_type),
        ('entity_id', AuditLog.entity_id),
        ('action', AuditLog.action),
    ]:
        val = request.args.get(param)
        if val not in (None, ''):
            q = q.filter(col == val)

    search = (request.args.get('q') or '').strip()
    if search:
        like = f"%{search}%"
        q = q.filter(db.or_(
            AuditLog.user_name.ilike(like),
            AuditLog.entity_label.ilike(like),
            AuditLog.details.ilike(like),
        ))

    dt_from = _parse_dt(request.args.get('from'))
    dt_to = _parse_dt(request.args.get('to'))
    if dt_from:
        q = q.filter(AuditLog.created_at >= dt_from)
    if dt_to:
        q = q.filter(AuditLog.created_at <= dt_to)

    total = q.with_entities(db.func.count(AuditLog.id)).scalar() or 0

    limit = min(int(request.args.get('limit', 100)), 500)
    offset = max(int(request.args.get('offset', 0)), 0)

    items = (q.order_by(AuditLog.created_at.desc())
             .offset(offset).limit(limit).all())

    return jsonify({
        'total': total,
        'limit': limit,
        'offset': offset,
        'items': [it.to_dict() for it in items],
    })


@audit_bp.route('/facets', methods=['GET'])
@jwt_required()
def facets():
    """Filter dropdown'lari uchun mavjud entity_type va action ro'yxatlari"""
    role = get_jwt().get('role', '')
    if not is_superadmin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    entity_types = [r[0] for r in db.session.query(AuditLog.entity_type)
                    .distinct().order_by(AuditLog.entity_type).all()]
    actions = [r[0] for r in db.session.query(AuditLog.action)
               .distinct().order_by(AuditLog.action).all()]
    return jsonify({'entity_types': entity_types, 'actions': actions})
