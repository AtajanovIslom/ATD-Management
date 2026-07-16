"""
Interaktiv arizalar — oqim:

    new  →  in_progress  →  pending_review  →  completed
                ↑                  │
                └── (return) ──────┘

    Har qanday paytda: → rejected (rahbar rad etadi)

Ariza kelib tushishi:
  - PUBLIC endpoint orqali (mobil ilova)  → status = new
  - Xodim o'zi qo'lda ("walk-in") kiritadi → status = in_progress, avtomat o'ziga biriktiriladi

Ishtirokchilar:
  - user (ariza yuboruvchi)          — apidan yoki mobil ilovadan
  - admin (rahbar: admin+)          — biriktiradi, tasdiqlaydi, qaytaradi, rad etadi
  - worker (biriktirilgan xodim)     — bajarildini yuboradi
"""
import secrets
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from sqlalchemy.orm import joinedload
from sqlalchemy import func
from app import db
from app.models import (
    InteractiveRequest, InteractiveRequestHistory,
    ServiceDepartment, ServiceType, User,
)
from app.utils import is_any_admin, is_admin_or_above, log_audit, fetch_employee_from_isup

interactive_public_bp = Blueprint('interactive_public', __name__)
interactive_req_bp = Blueprint('interactive_requests', __name__)

# Bir nechta xizmat turini qabul qiluvchi bo'lim ID lari — hozircha
# "Создание учётных записей" bo'limi. Kelajakda flag/config'ga chiqarsa bo'ladi.
MULTI_TYPE_DEPARTMENT_IDS = {4}


# =========================================================================
# HELPERS
# =========================================================================

def _log_history(req, status, actor=None, note=''):
    h = InteractiveRequestHistory(
        request_id=req.id,
        status=status,
        actor_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else '',
        note=note,
    )
    db.session.add(h)


def _resolve_types(type_ids, department_id):
    """type_ids ro'yxatini validatsiya qilib, ServiceType obyektlarini qaytaradi"""
    ids = list(dict.fromkeys(int(t) for t in type_ids if t))  # unique
    if not ids:
        return None, "Kamida bitta xizmat turi tanlanishi shart"

    if len(ids) > 1 and department_id not in MULTI_TYPE_DEPARTMENT_IDS:
        return None, "Ushbu bo'lim uchun faqat bitta xizmat turi tanlanishi mumkin"

    types = ServiceType.query.filter(ServiceType.id.in_(ids)).all()
    if len(types) != len(ids):
        return None, "Ba'zi xizmat turlari topilmadi"

    for t in types:
        if t.department_id != department_id:
            return None, f"'{t.name}' ushbu bo'limga tegishli emas"

    return types, None


def _read_type_ids(data):
    """`type_ids` array yoki eski `type_id` / `service_type` skalyar formalarni qabul qiladi"""
    if isinstance(data.get('type_ids'), list):
        return data['type_ids']
    single = data.get('type_id') or data.get('service_type')
    return [single] if single else []


# =========================================================================
# PUBLIC — MOBIL ILOVA UCHUN
# =========================================================================

@interactive_public_bp.route('/employee/<tabel_num>', methods=['GET'])
def public_employee_lookup(tabel_num):
    """ISUP tizimidan tabel raqami bo'yicha xodim ma'lumotlari"""
    info = fetch_employee_from_isup(tabel_num)
    if not info:
        return jsonify({'error': 'Xodim topilmadi'}), 404
    return jsonify(info)


@interactive_public_bp.route('/departments', methods=['GET'])
def public_list_departments():
    depts = ServiceDepartment.query.order_by(ServiceDepartment.name).all()
    return jsonify([
        {'id': d.id, 'name': d.name, 'multi_type': d.id in MULTI_TYPE_DEPARTMENT_IDS}
        for d in depts
    ])


@interactive_public_bp.route('/departments/<int:dept_id>/types', methods=['GET'])
def public_list_types(dept_id):
    types = (ServiceType.query
             .filter_by(department_id=dept_id)
             .order_by(ServiceType.name)
             .all())
    return jsonify([{'id': t.id, 'name': t.name} for t in types])


@interactive_public_bp.route('/submit', methods=['POST'])
def public_submit():
    """Mobil ilovadan yangi ariza qabul qilish.

    Body:
        phone_num, tabel_num, department_id: majburiy
        type_ids: [1,2,...]  (yoki backward-compat: type_id / service_type)
        comment: ixtiyoriy
    """
    data = request.get_json() or {}

    phone_num = (data.get('phone_num') or '').strip()
    tabel_num = (data.get('tabel_num') or '').strip()
    comment = (data.get('comment') or '').strip()
    department_id = data.get('department_id')

    if not phone_num:
        return jsonify({'error': 'phone_num majburiy'}), 400
    if not tabel_num:
        return jsonify({'error': 'tabel_num majburiy'}), 400
    if not department_id:
        return jsonify({'error': 'department_id majburiy'}), 400

    dept = ServiceDepartment.query.get(int(department_id))
    if not dept:
        return jsonify({'error': "Bo'lim topilmadi"}), 404

    types, err = _resolve_types(_read_type_ids(data), int(department_id))
    if err:
        return jsonify({'error': err}), 400

    # ISUP dan xodim ma'lumotlari
    emp = fetch_employee_from_isup(tabel_num) or {}

    req = InteractiveRequest(
        tracking_id=secrets.token_urlsafe(9),
        phone_num=phone_num,
        tabel_num=tabel_num,
        full_name=emp.get('full_name') or '',
        position=emp.get('position') or '',
        division=emp.get('division') or '',
        comment=comment,
        department_id=int(department_id),
        source='public',
        status='new',
    )
    req.types = types
    db.session.add(req)
    db.session.flush()

    type_names = ", ".join(t.name for t in types)
    _log_history(req, 'new', actor=None,
                 note=f"Ariza qabul qilindi: {type_names}")
    db.session.commit()

    return jsonify(req.to_public(with_history=True)), 201


@interactive_public_bp.route('/status/<tracking_id>', methods=['GET'])
def public_status(tracking_id):
    """Yakka ariza holati (tracking_id orqali)"""
    req = InteractiveRequest.query.filter_by(tracking_id=tracking_id).first()
    if not req:
        return jsonify({'error': 'Ariza topilmadi'}), 404
    return jsonify(req.to_public(with_history=True))


@interactive_public_bp.route('/history/<tabel_num>', methods=['GET'])
def public_history_by_tabel(tabel_num):
    """User tabel raqami bo'yicha barcha arizalari (eng yangisi birinchi)"""
    reqs = (InteractiveRequest.query
            .filter_by(tabel_num=tabel_num.strip())
            .order_by(InteractiveRequest.created_at.desc())
            .all())
    return jsonify({
        'tabel_num': tabel_num,
        'total': len(reqs),
        'items': [r.to_public(with_history=True) for r in reqs],
    })


# =========================================================================
# ICHKI — TIZIM ICHIDA
# =========================================================================

@interactive_req_bp.route('', methods=['GET'])
@jwt_required()
def list_requests():
    """Rol bo'yicha scope: admin — hammasi; xodim — o'ziga biriktirilganlari"""
    role = get_jwt().get('role', '')
    user_id = int(get_jwt_identity())

    q = InteractiveRequest.query
    if role == 'user' or not is_any_admin(role):
        q = q.filter_by(assigned_to=user_id)

    for param, col in [
        ('status', InteractiveRequest.status),
        ('department_id', InteractiveRequest.department_id),
        ('assigned_to', InteractiveRequest.assigned_to),
        ('tabel_num', InteractiveRequest.tabel_num),
    ]:
        val = request.args.get(param)
        if val:
            q = q.filter(col == val)

    reqs = q.order_by(InteractiveRequest.created_at.desc()).all()
    return jsonify([r.to_dict() for r in reqs])


@interactive_req_bp.route('/<int:req_id>', methods=['GET'])
@jwt_required()
def get_request(req_id):
    r = InteractiveRequest.query.get_or_404(req_id)
    d = r.to_dict()
    d['history'] = [h.to_public() for h in r.history]
    return jsonify(d)


@interactive_req_bp.route('/walkin', methods=['POST'])
@jwt_required()
def walkin_create():
    """Xodim o'zi qo'lda kiritayotgan ariza (og'zaki kelgan zayavka).
       Ariza yaratilgach avtomatik xodimga biriktiriladi, status = in_progress.
    """
    user_id = int(get_jwt_identity())
    actor = User.query.get(user_id)
    if not actor:
        return jsonify({'error': "Foydalanuvchi topilmadi"}), 401

    data = request.get_json() or {}

    phone_num = (data.get('phone_num') or '').strip()
    tabel_num = (data.get('tabel_num') or '').strip()
    comment = (data.get('comment') or '').strip()
    department_id = data.get('department_id')

    if not (phone_num and tabel_num and department_id):
        return jsonify({'error': 'phone_num, tabel_num, department_id majburiy'}), 400

    dept = ServiceDepartment.query.get(int(department_id))
    if not dept:
        return jsonify({'error': "Bo'lim topilmadi"}), 404

    types, err = _resolve_types(_read_type_ids(data), int(department_id))
    if err:
        return jsonify({'error': err}), 400

    emp = fetch_employee_from_isup(tabel_num) or {}
    now = datetime.now(timezone.utc)
    req = InteractiveRequest(
        tracking_id=secrets.token_urlsafe(9),
        phone_num=phone_num,
        tabel_num=tabel_num,
        full_name=emp.get('full_name') or '',
        position=emp.get('position') or '',
        division=emp.get('division') or '',
        comment=comment,
        department_id=int(department_id),
        source='walkin',
        status='in_progress',
        assigned_to=user_id,   # xodim o'ziga biriktiradi
        assigned_by=user_id,
        assigned_at=now,
    )
    req.types = types
    db.session.add(req)
    db.session.flush()

    type_names = ", ".join(t.name for t in types)
    _log_history(req, 'new', actor=actor,
                 note=f"Ariza qo'lda kiritildi (walk-in): {type_names}")
    _log_history(req, 'in_progress', actor=actor,
                 note="Ariza yaratuvchi xodimga biriktirildi")

    log_audit('create', 'interactive_request', req.id,
              entity_label=f"{tabel_num} — {type_names}",
              details=f"walk-in, source={req.source}")
    db.session.commit()
    return jsonify(req.to_dict()), 201


@interactive_req_bp.route('/<int:req_id>/assign', methods=['POST'])
@jwt_required()
def assign(req_id):
    """Rahbar arizani xodimga biriktiradi (status → in_progress)"""
    role = get_jwt().get('role', '')
    if not is_admin_or_above(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    r = InteractiveRequest.query.get_or_404(req_id)
    if r.status in ('completed', 'rejected'):
        return jsonify({'error': "Yakunlangan arizani qayta biriktirib bo'lmaydi"}), 400

    data = request.get_json() or {}
    worker_id = data.get('user_id')
    if not worker_id:
        return jsonify({'error': 'user_id majburiy'}), 400

    worker = User.query.get(int(worker_id))
    if not worker or not worker.is_active:
        return jsonify({'error': 'Xodim topilmadi'}), 404

    actor = User.query.get(int(get_jwt_identity()))
    now = datetime.now(timezone.utc)

    prev_assignee = r.assignee.full_name if r.assignee else None
    r.assigned_to = worker.id
    r.assigned_by = actor.id
    r.assigned_at = now
    r.status = 'in_progress'

    if prev_assignee and prev_assignee != worker.full_name:
        note = f"{prev_assignee} → {worker.full_name} ga qayta biriktirildi"
    else:
        note = f"{worker.full_name} xodimga biriktirildi"
    _log_history(r, 'in_progress', actor=actor, note=note)

    log_audit('assign', 'interactive_request', r.id,
              entity_label=f"{r.tabel_num} → {worker.full_name}")
    db.session.commit()
    return jsonify(r.to_dict())


@interactive_req_bp.route('/<int:req_id>/submit-review', methods=['POST'])
@jwt_required()
def submit_review(req_id):
    """Xodim: 'Bajarildi' — rahbarqa tekshirish uchun yuboradi (status → pending_review)"""
    user_id = int(get_jwt_identity())
    actor = User.query.get(user_id)
    r = InteractiveRequest.query.get_or_404(req_id)

    if r.status != 'in_progress':
        return jsonify({'error': "Faqat 'Ishlash jarayonida' bo'lgan arizani yuborish mumkin"}), 400

    # Faqat biriktirilgan xodim yoki admin yubora oladi
    role = get_jwt().get('role', '')
    if r.assigned_to != user_id and not is_admin_or_above(role):
        return jsonify({'error': "Bu ariza sizga biriktirilmagan"}), 403

    data = request.get_json() or {}
    result = (data.get('result_note') or '').strip()

    r.status = 'pending_review'
    r.result_note = result
    r.submitted_review_at = datetime.now(timezone.utc)

    _log_history(r, 'pending_review', actor=actor,
                 note=result or "Ish bajarildi, rahbar tekshiruvi kutilmoqda")
    log_audit('submit_review', 'interactive_request', r.id,
              entity_label=r.tabel_num)
    db.session.commit()
    return jsonify(r.to_dict())


@interactive_req_bp.route('/<int:req_id>/approve', methods=['POST'])
@jwt_required()
def approve(req_id):
    """Rahbar: 'Tasdiqlandi' → status = completed (yakuniy)"""
    role = get_jwt().get('role', '')
    if not is_admin_or_above(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    r = InteractiveRequest.query.get_or_404(req_id)
    if r.status != 'pending_review':
        return jsonify({'error': "Faqat 'Tasdiqlash kutilmoqda' arizani tasdiqlash mumkin"}), 400

    actor = User.query.get(int(get_jwt_identity()))

    r.status = 'completed'
    r.reviewed_by = actor.id
    r.completed_at = datetime.now(timezone.utc)

    _log_history(r, 'completed', actor=actor, note="Rahbar tomonidan tasdiqlandi")
    log_audit('approve', 'interactive_request', r.id, entity_label=r.tabel_num)
    db.session.commit()
    return jsonify(r.to_dict())


@interactive_req_bp.route('/<int:req_id>/return', methods=['POST'])
@jwt_required()
def return_to_worker(req_id):
    """Rahbar: 'Qaytarildi' — ish chala, xodim qayta bajaradi (status → in_progress)"""
    role = get_jwt().get('role', '')
    if not is_admin_or_above(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    r = InteractiveRequest.query.get_or_404(req_id)
    if r.status != 'pending_review':
        return jsonify({'error': "Faqat 'Tasdiqlash kutilmoqda' arizani qaytarish mumkin"}), 400

    data = request.get_json() or {}
    reason = (data.get('return_reason') or data.get('reason') or '').strip()
    if not reason:
        return jsonify({'error': "Qaytarish sababi kiritilishi shart"}), 400

    actor = User.query.get(int(get_jwt_identity()))

    r.status = 'in_progress'
    r.return_count = (r.return_count or 0) + 1
    r.result_note = ''  # yangi urinish uchun

    _log_history(r, 'in_progress', actor=actor,
                 note=f"Qaytarildi (#{r.return_count}): {reason}")
    log_audit('return', 'interactive_request', r.id,
              entity_label=r.tabel_num, details=reason)
    db.session.commit()
    return jsonify(r.to_dict())


@interactive_req_bp.route('/<int:req_id>/reject', methods=['POST'])
@jwt_required()
def reject(req_id):
    """Rahbar: rad etadi (butunlay bekor qiladi)"""
    role = get_jwt().get('role', '')
    if not is_admin_or_above(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    r = InteractiveRequest.query.get_or_404(req_id)
    if r.status in ('completed', 'rejected'):
        return jsonify({'error': "Ariza allaqachon yakunlangan"}), 400

    data = request.get_json() or {}
    reason = (data.get('reject_reason') or '').strip()
    if not reason:
        return jsonify({'error': "Rad etish sababi kiritilishi shart"}), 400

    actor = User.query.get(int(get_jwt_identity()))

    r.status = 'rejected'
    r.reject_reason = reason
    r.reviewed_by = actor.id
    r.completed_at = datetime.now(timezone.utc)

    _log_history(r, 'rejected', actor=actor, note=reason)
    log_audit('reject', 'interactive_request', r.id,
              entity_label=r.tabel_num, details=reason)
    db.session.commit()
    return jsonify(r.to_dict())


@interactive_req_bp.route('/stats/summary', methods=['GET'])
@jwt_required()
def stats_summary():
    role = get_jwt().get('role', '')
    user_id = int(get_jwt_identity())

    base = InteractiveRequest.query
    if role == 'user' or not is_any_admin(role):
        base = base.filter_by(assigned_to=user_id)

    rows = (base.with_entities(InteractiveRequest.status,
                               func.count(InteractiveRequest.id))
            .group_by(InteractiveRequest.status).all())
    by_status = {s: c for s, c in rows}

    return jsonify({
        'total': sum(by_status.values()),
        'by_status': {
            k: by_status.get(k, 0)
            for k in ('new', 'in_progress', 'pending_review', 'completed', 'rejected')
        },
    })
