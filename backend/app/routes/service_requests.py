"""
Servis so'rovlari (Texnik xizmat)

Ikki xil endpoint mavjud:
  1) /api/service-requests/*  — ichki (JWT talab qiladi, tizimdagi xodimlar uchun)
  2) /api/public/requests/*   — tashqi (mobil ilova uchun, API kalit orqali)
"""
import secrets
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from app import db
from app.models import ServiceRequest, Division, User
from app.utils import get_scope, is_superadmin, is_any_admin

service_bp = Blueprint('service_requests', __name__)
public_bp = Blueprint('public_requests', __name__)


# =====================================================================
# ICHKI ENDPOINT (JWT) — xodimlar va adminlar uchun
# =====================================================================

def _scope_service_divisions(role, dept_id, div_id):
    """Foydalanuvchining scope'iga qarab qaysi service-division'lardagi
       so'rovlarni ko'rishi mumkinligini aniqlaydi.

       Returns: None (hammasi) yoki division_id lar ro'yxati.
    """
    if is_superadmin(role):
        return None  # hamma xizmat bo'limlarini ko'radi

    q = Division.query.filter_by(is_service_provider=True)

    if role == 'admin' and dept_id:
        q = q.filter_by(department_id=dept_id)
    elif role == 'department_admin' and div_id:
        q = q.filter_by(id=div_id)
    elif role == 'user' and div_id:
        q = q.filter_by(id=div_id)

    divs = q.all()
    return [d.id for d in divs]


@service_bp.route('', methods=['GET'])
@jwt_required()
def list_requests():
    role, dept_id, div_id = get_scope(get_jwt())
    user_id = int(get_jwt_identity())

    q = ServiceRequest.query

    div_ids = _scope_service_divisions(role, dept_id, div_id)
    if div_ids is not None:
        if not div_ids:
            return jsonify([])
        q = q.filter(ServiceRequest.division_id.in_(div_ids))

    # Filter: status
    status = request.args.get('status')
    if status:
        q = q.filter_by(status=status)

    # Filter: only mine
    if request.args.get('only_mine') == '1':
        q = q.filter_by(assigned_to=user_id)

    reqs = q.order_by(ServiceRequest.created_at.desc()).all()
    return jsonify([r.to_dict() for r in reqs])


@service_bp.route('/<int:req_id>', methods=['GET'])
@jwt_required()
def get_request(req_id):
    r = ServiceRequest.query.get_or_404(req_id)
    return jsonify(r.to_dict())


@service_bp.route('/<int:req_id>/accept', methods=['POST'])
@jwt_required()
def accept_request(req_id):
    user_id = int(get_jwt_identity())
    r = ServiceRequest.query.get_or_404(req_id)

    if r.status != 'new':
        return jsonify({'error': "Faqat yangi so'rovni qabul qilish mumkin"}), 400

    r.status = 'accepted'
    r.assigned_to = user_id
    r.accepted_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(r.to_dict())


@service_bp.route('/<int:req_id>/start', methods=['POST'])
@jwt_required()
def start_request(req_id):
    user_id = int(get_jwt_identity())
    r = ServiceRequest.query.get_or_404(req_id)

    if r.status not in ('new', 'accepted'):
        return jsonify({'error': "Bu holatda ishni boshlab bo'lmaydi"}), 400

    r.status = 'in_progress'
    if not r.assigned_to:
        r.assigned_to = user_id
    if not r.accepted_at:
        r.accepted_at = datetime.now(timezone.utc)
    r.started_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(r.to_dict())


@service_bp.route('/<int:req_id>/complete', methods=['POST'])
@jwt_required()
def complete_request(req_id):
    user_id = int(get_jwt_identity())
    r = ServiceRequest.query.get_or_404(req_id)

    if r.status in ('completed', 'rejected'):
        return jsonify({'error': "So'rov allaqachon yakunlangan"}), 400

    data = request.get_json() or {}
    r.status = 'completed'
    r.result_note = (data.get('result_note') or '').strip()
    if not r.assigned_to:
        r.assigned_to = user_id
    r.completed_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(r.to_dict())


@service_bp.route('/<int:req_id>/reject', methods=['POST'])
@jwt_required()
def reject_request(req_id):
    user_id = int(get_jwt_identity())
    r = ServiceRequest.query.get_or_404(req_id)

    if r.status in ('completed', 'rejected'):
        return jsonify({'error': "So'rov allaqachon yakunlangan"}), 400

    data = request.get_json() or {}
    reason = (data.get('reject_reason') or '').strip()
    if not reason:
        return jsonify({'error': "Rad etish sababi kiritilishi shart"}), 400

    r.status = 'rejected'
    r.reject_reason = reason
    if not r.assigned_to:
        r.assigned_to = user_id
    r.completed_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(r.to_dict())


@service_bp.route('/<int:req_id>/reassign', methods=['POST'])
@jwt_required()
def reassign_request(req_id):
    """Admin so'rovni boshqa xodimga o'tkazadi"""
    role, _, _ = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    r = ServiceRequest.query.get_or_404(req_id)
    data = request.get_json() or {}
    new_uid = data.get('user_id')
    r.assigned_to = new_uid or None
    db.session.commit()
    return jsonify(r.to_dict())


@service_bp.route('/stats/summary', methods=['GET'])
@jwt_required()
def stats_summary():
    """Xodim uchun mening so'rovlarim; admin uchun bo'lim statistikasi"""
    role, dept_id, div_id = get_scope(get_jwt())
    user_id = int(get_jwt_identity())

    q = ServiceRequest.query
    div_ids = _scope_service_divisions(role, dept_id, div_id)
    if div_ids is not None:
        if not div_ids:
            return jsonify({'total': 0, 'by_status': {}})
        q = q.filter(ServiceRequest.division_id.in_(div_ids))

    total = q.count()
    by_status = {}
    for s in ('new', 'accepted', 'in_progress', 'completed', 'rejected'):
        by_status[s] = q.filter_by(status=s).count()

    my_active = 0
    if role in ('user', 'department_admin'):
        my_active = ServiceRequest.query.filter_by(assigned_to=user_id)\
            .filter(ServiceRequest.status.in_(['accepted', 'in_progress'])).count()

    return jsonify({'total': total, 'by_status': by_status, 'my_active': my_active})


# =====================================================================
# SUPERADMIN — bo'limni servis provayder qilib belgilash
# =====================================================================

@service_bp.route('/divisions/<int:div_id>/service-config', methods=['POST'])
@jwt_required()
def toggle_service_division(div_id):
    role, _, _ = get_scope(get_jwt())
    if not is_superadmin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    div = Division.query.get_or_404(div_id)
    data = request.get_json() or {}
    enable = bool(data.get('is_service_provider', False))
    div.is_service_provider = enable
    if enable and not div.service_api_key:
        div.service_api_key = secrets.token_urlsafe(32)
    if not enable:
        pass  # kalitni saqlab qoldiramiz
    db.session.commit()
    return jsonify(div.to_dict())


@service_bp.route('/divisions/<int:div_id>/rotate-key', methods=['POST'])
@jwt_required()
def rotate_api_key(div_id):
    role, _, _ = get_scope(get_jwt())
    if not is_superadmin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    div = Division.query.get_or_404(div_id)
    div.service_api_key = secrets.token_urlsafe(32)
    db.session.commit()
    return jsonify({'service_api_key': div.service_api_key})


@service_bp.route('/service-divisions', methods=['GET'])
@jwt_required()
def list_service_divisions():
    """Barcha servis provayder bo'limlarni qaytaradi (superadmin uchun)"""
    role, _, _ = get_scope(get_jwt())
    if not is_superadmin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    divs = Division.query.filter_by(is_service_provider=True).all()
    return jsonify([d.to_dict() for d in divs])


# =====================================================================
# TASHQI PUBLIC API (mobil ilova uchun) — API kalit orqali autentifikatsiya
# =====================================================================

def _get_division_by_key():
    """Header'dan yoki query'dan API kalitni oladi va bo'limni qaytaradi"""
    api_key = request.headers.get('X-API-Key') or request.args.get('api_key')
    if not api_key:
        return None, jsonify({'error': 'API kalit talab qilinadi (X-API-Key)'}), 401
    div = Division.query.filter_by(service_api_key=api_key, is_service_provider=True).first()
    if not div:
        return None, jsonify({'error': "API kalit noto'g'ri yoki bo'lim faol emas"}), 401
    return div, None, None


@public_bp.route('/requests', methods=['POST'])
def public_submit_request():
    """Mobil ilovadan yangi zayavka qabul qilish"""
    div, err_resp, err_code = _get_division_by_key()
    if err_resp:
        return err_resp, err_code

    data = request.get_json() or {}

    external_id = (data.get('external_id') or '').strip()
    if not external_id:
        external_id = secrets.token_urlsafe(12)

    if ServiceRequest.query.filter_by(external_id=external_id).first():
        return jsonify({'error': "Bu external_id bilan zayavka mavjud"}), 400

    submitter_name = (data.get('submitter_name') or '').strip()
    title = (data.get('title') or '').strip()
    if not submitter_name or not title:
        return jsonify({'error': "submitter_name va title majburiy"}), 400

    r = ServiceRequest(
        external_id=external_id,
        division_id=div.id,
        submitter_name=submitter_name,
        submitter_phone=(data.get('submitter_phone') or '').strip(),
        submitter_email=(data.get('submitter_email') or '').strip(),
        submitter_address=(data.get('submitter_address') or '').strip(),
        category=(data.get('category') or '').strip(),
        title=title,
        description=(data.get('description') or '').strip(),
        priority=(data.get('priority') or 'normal'),
        status='new',
    )
    db.session.add(r)
    db.session.commit()
    return jsonify(r.to_public_status()), 201


@public_bp.route('/requests/<external_id>/status', methods=['GET'])
def public_check_status(external_id):
    """Mobil ilovadan zayavka holatini so'rash"""
    div, err_resp, err_code = _get_division_by_key()
    if err_resp:
        return err_resp, err_code

    r = ServiceRequest.query.filter_by(external_id=external_id, division_id=div.id).first()
    if not r:
        return jsonify({'error': 'Zayavka topilmadi'}), 404
    return jsonify(r.to_public_status())


@public_bp.route('/requests/<external_id>', methods=['GET'])
def public_get_request(external_id):
    """Zayavka batafsil ma'lumoti (mobil ilovaga to'liq javob)"""
    div, err_resp, err_code = _get_division_by_key()
    if err_resp:
        return err_resp, err_code

    r = ServiceRequest.query.filter_by(external_id=external_id, division_id=div.id).first()
    if not r:
        return jsonify({'error': 'Zayavka topilmadi'}), 404
    return jsonify(r.to_public_status())
