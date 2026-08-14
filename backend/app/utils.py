"""
RBAC Roles:
  superadmin     - to'liq kirish, hamma narsa
  admin          - Boshqarma rahbari (department_id ko'rsatilgan)
  department_admin - Bo'lim rahbari (division_id ko'rsatilgan)
  user           - Xodim (oddiy foydalanuvchi)
  agent          - Interaktiv xizmat agenti (faqat interaktiv arizalar oynasi)
"""

ROLES = {
    'superadmin': 'Bosh Administrator',
    'director': 'Direksiya Direktori',
    'deputy_director': 'Direktor O\'rinbosari',
    'admin': 'Boshqarma Rahbari',
    'department_admin': 'Bo\'lim Rahbari',
    'user': 'Xodim',
    'agent': 'Interaktiv xizmat agenti',
}

# To'liq ma'lumot ko'ra oladigan rollar (superadmin, direktor, direktor o'rinbosari)
FULL_ACCESS_ROLES = ('superadmin', 'director', 'deputy_director')

# Rol berish huquqiga ega rollar (faqat superadmin va direktor)
ROLE_MANAGER_ROLES = ('superadmin', 'director')

# Rol ↔ sahifa matritsasini tahrirlash huquqi — faqat Bosh Administrator
PAGE_ACCESS_MANAGER_ROLES = ('superadmin',)

# Interaktiv arizalarni bajaruvchi ijrochi rollar (rahbar biriktira oladi)
WORKER_ROLES = ('user', 'agent')


# =========================================================================
# ROL ↔ SAHIFA MATRITSASI
#
# Ilgari qaysi rol qaysi sahifani ko'rishi App.jsx/Navbar.jsx ichida qattiq
# yozilgan edi. Endi u shu yerdagi standart qiymatlardan boshlanadi va Bosh
# Administrator `/roles` sahifasidan o'zgartira oladi (role_pages jadvali).
#
# `PAGES` tartibi muhim: rolning birinchi ruxsat etilgan sahifasi uning
# "bosh sahifasi" bo'ladi (masalan agent uchun — interaktiv arizalar).
# =========================================================================

PAGES = [
    {'key': 'dashboard',            'path': '/',                     'icon': '📊',   'label': 'Boshqaruv paneli'},
    {'key': 'reminders',            'path': '/reminders',            'icon': '🗓️',  'label': 'Eslatmalarim'},
    {'key': 'work_logs',            'path': '/work-logs',            'icon': '📓',   'label': 'Kunlik hisobotim'},
    {'key': 'department_work_logs', 'path': '/department-work-logs', 'icon': '👥',   'label': 'Xodimlar hisobotlari'},
    {'key': 'statistics',           'path': '/statistics',           'icon': '📈',   'label': 'Statistika'},
    {'key': 'create_project',       'path': '/create-project',       'icon': '🚀',   'label': 'Loyiha yaratish'},
    {'key': 'create_task',          'path': '/create-task',          'icon': '📝',   'label': 'Vazifa yaratish'},
    {'key': 'teams',                'path': '/teams',                'icon': '👥',   'label': 'Guruhlar'},
    {'key': 'departments',          'path': '/departments',          'icon': '🏢',   'label': 'Boshqarmalar'},
    {'key': 'users',                'path': '/users',                'icon': '🧑‍💻', 'label': 'Xodimlar'},
    {'key': 'interactive_services', 'path': '/interactive-services', 'icon': '🧩',   'label': 'Interaktiv xizmatlar Admin'},
    {'key': 'interactive_requests', 'path': '/interactive-requests', 'icon': '📥',   'label': 'Interaktiv arizalar'},
    {'key': 'roles',                'path': '/roles',                'icon': '🔑',   'label': 'Rol va huquqlar'},
    {'key': 'audit_logs',           'path': '/audit-logs',           'icon': '📋',   'label': 'Audit jurnali'},
]

PAGE_KEYS = tuple(p['key'] for p in PAGES)

# Standart matritsa — avvalgi qattiq yozilgan holatning aynan o'zi.
# Bularni o'zgartirmang: bu "hech kimning ko'rinishi o'zgarmasin" kafolati.
DEFAULT_ROLE_PAGES = {
    'superadmin': [
        'dashboard', 'reminders', 'department_work_logs', 'statistics',
        'create_project', 'create_task', 'teams', 'departments', 'users',
        'interactive_services', 'interactive_requests', 'roles', 'audit_logs',
    ],
    'director': [
        'dashboard', 'reminders', 'department_work_logs', 'statistics',
        'create_project', 'create_task', 'teams', 'departments', 'users',
        'interactive_services', 'interactive_requests', 'roles', 'audit_logs',
    ],
    # Direktor o'rinbosari barchasini ko'radi, lekin rol bera olmaydi
    'deputy_director': [
        'dashboard', 'reminders', 'department_work_logs', 'statistics',
        'create_project', 'create_task', 'teams', 'departments', 'users',
        'interactive_services', 'interactive_requests', 'audit_logs',
    ],
    'admin': [
        'dashboard', 'reminders', 'department_work_logs', 'statistics',
        'create_project', 'create_task', 'teams', 'departments', 'users',
        'interactive_services', 'interactive_requests',
    ],
    'department_admin': [
        'dashboard', 'reminders', 'department_work_logs', 'statistics',
        'create_project', 'create_task', 'users',
    ],
    'user': [
        'dashboard', 'reminders', 'work_logs',
    ],
    # Agent — faqat interaktiv arizalar oynasi
    'agent': [
        'interactive_requests',
    ],
}

# Bosh Administrator hech qachon o'zini tizimdan qulflab qo'ymasligi kerak —
# uning qatori har doim to'liq va tahrirlanmaydi.
LOCKED_ROLES = ('superadmin',)

# Bo'linmasi "interaktiv xizmat ko'rsatadi" deb belgilangan xodimlarga
# matritsadan qat'i nazar ochiladigan sahifa (avvalgi xatti-harakat saqlanadi).
SERVICE_PROVIDER_PAGES = ('interactive_requests',)


def can_manage_page_access(role):
    """Rol ↔ sahifa matritsasini tahrirlash huquqi (faqat Bosh Administrator)"""
    return role in PAGE_ACCESS_MANAGER_ROLES


def default_pages_for(role):
    return list(DEFAULT_ROLE_PAGES.get(role, DEFAULT_ROLE_PAGES['user']))


def role_page_matrix():
    """Barcha rollar uchun amaldagi matritsa: {role: [page_key, ...]}.

    Bazadagi role_pages yozuvlari standart qiymatlar ustiga qo'yiladi. Jadval
    hali yaratilmagan yoki bo'sh bo'lsa — sof standart qiymatlar qaytadi.
    """
    matrix = {role: default_pages_for(role) for role in ROLES}

    try:
        from app.models import RolePage
        rows = RolePage.query.all()
    except Exception:
        # Jadval hali yaratilmagan bo'lsa — standart qiymatlar bilan davom
        # etamiz. rollback() shart: PostgreSQL'da xato bergan tranzaksiya
        # ochiq qolsa, shu so'rovdagi keyingi barcha SQL rad etilardi.
        try:
            from app import db as _db
            _db.session.rollback()
        except Exception:
            pass
        rows = []

    # Baza yozuvi bo'lgan rol uchun standart qiymat butunlay almashtiriladi
    overridden = {r.role for r in rows}
    for role in overridden:
        matrix[role] = []
    for r in rows:
        if r.allowed and r.page in PAGE_KEYS:
            matrix.setdefault(r.role, []).append(r.page)

    # PAGES tartibida saqlaymiz — bosh sahifa aniqlanishi shunga bog'liq
    order = {k: i for i, k in enumerate(PAGE_KEYS)}
    for role in matrix:
        matrix[role] = sorted(set(matrix[role]), key=lambda k: order.get(k, 999))

    for role in LOCKED_ROLES:
        matrix[role] = list(PAGE_KEYS)

    return matrix


def allowed_pages(role, is_service_provider=False):
    """Foydalanuvchi ko'ra oladigan sahifalar ro'yxati"""
    pages = role_page_matrix().get(role, default_pages_for(role))
    if is_service_provider:
        extra = [p for p in SERVICE_PROVIDER_PAGES if p not in pages]
        if extra:
            order = {k: i for i, k in enumerate(PAGE_KEYS)}
            pages = sorted(pages + extra, key=lambda k: order.get(k, 999))
    return pages


def can_view_page(role, page_key, is_service_provider=False):
    return page_key in allowed_pages(role, is_service_provider)


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
