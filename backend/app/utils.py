"""
RBAC Roles:
  superadmin     - to'liq kirish, hamma narsa
  admin          - Boshqarma rahbari (department_id ko'rsatilgan)
  department_admin - Bo'lim rahbari (division_id ko'rsatilgan)
  user           - Xodim (oddiy foydalanuvchi)
"""

ROLES = {
    'superadmin': 'Bosh Administrator',
    'director': 'Direksiya Direktori',
    'deputy_director': 'Direktor O\'rinbosari',
    'admin': 'Boshqarma Rahbari',
    'department_admin': 'Bo\'lim Rahbari',
    'user': 'Xodim',
}

# To'liq ma'lumot ko'ra oladigan rollar (superadmin, direktor, direktor o'rinbosari)
FULL_ACCESS_ROLES = ('superadmin', 'director', 'deputy_director')

# Rol berish huquqiga ega rollar (faqat superadmin va direktor)
ROLE_MANAGER_ROLES = ('superadmin', 'director')


def validate_password(password):
    if len(password) < 4:
        return 'Parol kamida 4 ta belgidan iborat bo\'lishi kerak'
    if ' ' in password:
        return 'Parolda probel bo\'lmasligi kerak'
    return None


def is_superadmin(role):
    """To'liq ma'lumot ko'ra oluvchi rollar"""
    return role in FULL_ACCESS_ROLES


def can_manage_roles(role):
    """Rol berish/olish huquqi (superadmin, director)"""
    return role in ROLE_MANAGER_ROLES


def is_admin_or_above(role):
    """Boshqarma rahbari va undan yuqori"""
    return role in FULL_ACCESS_ROLES or role == 'admin'


def is_dept_admin_or_above(role):
    """Bo'lim rahbari va undan yuqori"""
    return role in FULL_ACCESS_ROLES or role in ('admin', 'department_admin')


def is_any_admin(role):
    return role in FULL_ACCESS_ROLES or role in ('admin', 'department_admin')


def get_scope(claims):
    """JWT dan role, department_id, division_id ni olish"""
    return (
        claims.get('role', 'user'),
        claims.get('department_id'),
        claims.get('division_id'),
    )


def dept_user_ids(department_id):
    """Berilgan boshqarmadagi barcha xodimlar ID larini qaytaradi"""
    from app.models import User
    users = User.query.filter_by(department_id=department_id, is_active=True).all()
    return {u.id for u in users}


def div_user_ids(division_id):
    """Berilgan bo'limdagi barcha xodimlar ID larini qaytaradi"""
    from app.models import User
    users = User.query.filter_by(division_id=division_id, is_active=True).all()
    return {u.id for u in users}


ISUP_EMPLOYEE_URL = "https://isup.uzbeksteel.uz/isup/hs/employee/getEmployee/{tab}"
ISUP_AUTH = ('api', '@3395')
ISUP_TIMEOUT = 8  # sekund


def fetch_employee_from_isup(tabel_num):
    """
    ISUP tizimidan tabel raqami bo'yicha xodim ma'lumotlari.
    Muvaffaqiyatli javob:
        {"full_name": "...", "position": "...", "division": "..."}
    Xatolik yoki topilmadi:
        None
    """
    import json
    import ssl
    import base64
    from urllib.request import Request, urlopen
    from urllib.error import URLError, HTTPError

    tabel_num = (tabel_num or '').strip()
    if not tabel_num:
        return None

    # Basic auth header
    creds = f"{ISUP_AUTH[0]}:{ISUP_AUTH[1]}".encode('utf-8')
    auth_header = 'Basic ' + base64.b64encode(creds).decode('ascii')

    req = Request(
        ISUP_EMPLOYEE_URL.format(tab=tabel_num),
        headers={'Authorization': auth_header, 'Accept': 'application/json'},
    )
    # ISUP self-signed sertifikatga ega bo'lishi mumkin
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        with urlopen(req, timeout=ISUP_TIMEOUT, context=ctx) as resp:
            if resp.status != 200:
                return None
            body = resp.read().decode('utf-8-sig', errors='replace')  # BOM ni olib tashlaymiz
    except (URLError, HTTPError, TimeoutError, Exception):
        return None

    try:
        data = json.loads(body)
    except Exception:
        return None

    if not isinstance(data, dict) or not data.get('ishchi'):
        return None

    return {
        'full_name': (data.get('ishchi') or '').strip(),
        'position': (data.get('lavozim') or '').strip(),
        'division': (data.get('bolinma') or '').strip(),
        'phone': (data.get('telefon') or '').strip(),
    }


def log_audit(action, entity_type, entity_id=None, entity_label='', details=''):
    """Audit log yozish. db.session.commit() chaqiruvchi tomonidan bajariladi.

    Args:
        action: create/update/delete/assign/approve/return/reject/login/...
        entity_type: user/department/division/team/project/task/... (obyekt turi)
        entity_id: obyekt ID
        entity_label: inson uchun tushunarli nom (masalan foydalanuvchi ismi)
        details: qo'shimcha izoh yoki JSON string
    """
    from flask import request
    from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request
    from app import db
    from app.models import AuditLog

    user_id = None
    user_name = ''
    user_role = ''
    ip = ''

    try:
        verify_jwt_in_request(optional=True)
        uid_claim = get_jwt_identity()
        if uid_claim:
            user_id = int(uid_claim)
            claims = get_jwt()
            user_name = claims.get('full_name', '')
            user_role = claims.get('role', '')
    except Exception:
        pass

    try:
        ip = (request.headers.get('X-Forwarded-For', request.remote_addr) or '')[:50]
    except Exception:
        pass

    log = AuditLog(
        user_id=user_id,
        user_name=user_name,
        user_role=user_role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_label=(entity_label or '')[:1000],
        details=(details or '')[:2000],
        ip_address=ip,
    )
    db.session.add(log)
    return log
