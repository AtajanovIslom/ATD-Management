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
    {'key': 'work_logs',            'path': '/work-logs',            'icon': '📓',   'label': 'Mening hisobotlarim'},
    {'key': 'department_work_logs', 'path': '/department-work-logs', 'icon': '👥',   'label': 'Xodim hisobotlari'},
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

# Standart matritsa. Bosh Administrator /roles sahifasida rol uchun bir marta
# saqlagan bo'lsa, o'sha rolga bu qiymatlar emas, bazadagi yozuvlar ishlaydi.
# Xodimga "Vazifa yaratish" qo'shildi — u faqat o'zi uchun vazifa yaratadi.
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
        'dashboard', 'reminders', 'work_logs', 'create_task',
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


def _sorted_pages(keys):
    order = {k: i for i, k in enumerate(PAGE_KEYS)}
    return sorted({k for k in keys if k in PAGE_KEYS}, key=lambda k: order.get(k, 999))


def user_page_override(user_id):
    """Xodimga alohida berilgan ruxsat: sahifalar ro'yxati yoki None.

    None — shaxsiy sozlama yo'q, roldagi qiymat ishlaydi. Bo'sh ro'yxat esa
    haqiqiy sozlama: "bu xodimga hech narsa ochilmagan".
    """
    try:
        from app.models import UserPage
        rows = UserPage.query.filter_by(user_id=user_id).all()
    except Exception:
        try:
            from app import db as _db
            _db.session.rollback()
        except Exception:
            pass
        return None

    if not rows:
        return None
    return _sorted_pages(r.page for r in rows if r.allowed)


def allowed_pages(role, is_service_provider=False):
    """Rol bo'yicha sahifalar (shaxsiy sozlamasiz)"""
    pages = role_page_matrix().get(role, default_pages_for(role))
    if is_service_provider:
        pages = _sorted_pages(list(pages) + list(SERVICE_PROVIDER_PAGES))
    return list(pages)


def allowed_pages_for_user(user):
    """Aniq xodim ko'ra oladigan sahifalar.

    Tartib: shaxsiy sozlama (user_pages) → roldagi qiymat (role_pages) →
    standart qiymat. Bo'linmasi interaktiv xizmat ko'rsatsa, qo'shimcha
    sahifa har qanday holatda ochiladi (avvalgi xatti-harakat).
    """
    if user is None:
        return []
    if user.role in LOCKED_ROLES:
        return list(PAGE_KEYS)

    div = user.division
    is_provider = bool(div.is_service_provider) if div else False

    override = user_page_override(user.id)
    pages = override if override is not None else allowed_pages(user.role)

    if is_provider:
        pages = _sorted_pages(list(pages) + list(SERVICE_PROVIDER_PAGES))
    return list(pages)


def can_view_page(role, page_key, is_service_provider=False):
    return page_key in allowed_pages(role, is_service_provider)


# Roldan tashqari alohida berilishi mumkin bo'lgan huquqlar. Rol berish
# oynasida (ManageRoles) katakcha sifatida ko'rinadi va foydalanuvchining
# `admin_permissions.permissions` ro'yxatida saqlanadi.
PERMISSION_DEFS = [
    {
        'key': 'project.edit',
        'label': 'Loyihani tahrirlash',
        'description': "Loyiha ma'lumotlari va bosqichlarini tahrirlash, "
                       "bosqich ijrosini qabul qilish va loyihani yakunlash",
    },
    {
        'key': 'project.delete',
        'label': "Loyihani o'chirish",
        'description': "Loyihani butunlay o'chirish — bosqichlari, hisobotlari "
                       "va biriktirilgan fayllari bilan birga",
    },
    {
        'key': 'project.view_all',
        'label': "Barcha loyihalarni ko'rish",
        'description': "O'ziga biriktirilmagan bo'lsa ham tashkilotdagi barcha "
                       "loyihalarni ro'yxatda va statistikada ko'rish",
    },
    {
        'key': 'task.edit',
        'label': 'Vazifani tahrirlash',
        'description': "Vazifa nomi, tavsifi va muddatlarini tahrirlash "
                       "(yuklash, tasdiqlash va o'chirish rahbarda qoladi)",
    },
]

PERMISSION_KEYS = tuple(p['key'] for p in PERMISSION_DEFS)


# =========================================================================
# ROL ↔ HUQUQ MATRITSASI
#
# Huquqlar ilgari faqat bitta xodimga berilardi (admin_permissions). Endi
# ular rol darajasida ham beriladi: `role_permissions` jadvalidagi yozuvlar
# o'sha roldagi barcha xodimlarga tegishli bo'ladi. Xodimning shaxsiy
# huquqlari esa rol qiymati ustiga qo'shiladi (olib tashlamaydi).
#
# Standart holat — bo'sh jadval, ya'ni hech bir rolga qo'shimcha huquq
# berilmagan (avvalgi xatti-harakat aynan saqlanadi).
# =========================================================================

DEFAULT_ROLE_PERMISSIONS = {role: [] for role in ROLES}


def _sorted_permissions(keys):
    order = {k: i for i, k in enumerate(PERMISSION_KEYS)}
    return sorted({k for k in keys if k in PERMISSION_KEYS}, key=lambda k: order.get(k, 999))


def role_permission_matrix():
    """Barcha rollar uchun amaldagi huquqlar: {role: [permission_key, ...]}.

    Jadval hali yaratilmagan yoki bo'sh bo'lsa — barcha rollar uchun bo'sh
    ro'yxat qaytadi. To'liq kirish rollarida huquqlar doim to'liq.
    """
    matrix = {role: [] for role in ROLES}

    try:
        from app.models import RolePermission
        rows = RolePermission.query.all()
    except Exception:
        # Jadval hali yaratilmagan bo'lsa — standart (bo'sh) qiymat bilan
        # davom etamiz. rollback() shart: xato bergan tranzaksiya ochiq
        # qolsa, shu so'rovdagi keyingi SQL lar ham rad etilardi.
        try:
            from app import db as _db
            _db.session.rollback()
        except Exception:
            pass
        rows = []

    for r in rows:
        if r.allowed and r.permission in PERMISSION_KEYS:
            matrix.setdefault(r.role, []).append(r.permission)

    for role in matrix:
        matrix[role] = _sorted_permissions(matrix[role])

    for role in FULL_ACCESS_ROLES:
        matrix[role] = list(PERMISSION_KEYS)

    return matrix


def role_permissions(role):
    """Bitta rolga berilgan qo'shimcha huquqlar"""
    if role in FULL_ACCESS_ROLES:
        return list(PERMISSION_KEYS)
    return role_permission_matrix().get(role, [])


def effective_permissions(user):
    """Xodimning amaldagi qo'shimcha huquqlari: roldan olingani + shaxsiysi.

    Sahifa ruxsatidan farqli o'laroq shaxsiy huquq roldagini almashtirmaydi,
    ustiga qo'shiladi — rolga berilgan huquqni bitta xodimdan olib qo'yish
    tartibi kerak bo'lmadi, kerak bo'lsa rol o'zgartiriladi.
    """
    if user is None:
        return []
    if user.role in FULL_ACCESS_ROLES:
        return list(PERMISSION_KEYS)
    return _sorted_permissions(
        list(role_permissions(user.role)) + list(user.extra_permissions())
    )


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


def has_permission(permission, claims=None):
    """Foydalanuvchida qo'shimcha huquq bormi (rol tekshiruvidan tashqari).

    To'liq kirish rollari (superadmin/direktor/o'rinbosar) uchun doim True.
    Qolganlar uchun huquq bazadan o'qiladi — JWT uzoq yashaydi (mobil ilovada
    15 kun), token ichidagi ro'yxatga tayansak endi berilgan huquq xodim
    qayta kirmaguncha ishlamay turardi.

    Huquq ikki manbadan kelishi mumkin: rolga berilgani (role_permissions)
    yoki xodimning shaxsiysi (admin_permissions).
    """
    from flask_jwt_extended import get_jwt, get_jwt_identity
    from app.models import User

    claims = claims if claims is not None else get_jwt()
    if claims.get('role', 'user') in FULL_ACCESS_ROLES:
        return True

    try:
        user = User.query.get(int(get_jwt_identity()))
    except (TypeError, ValueError):
        user = None
    if user is None:
        # Foydalanuvchi topilmadi — faqat JWT dagi roldan berilgani qoladi
        return permission in role_permissions(claims.get('role', 'user'))
    return permission in effective_permissions(user)


def dept_user_ids(department_id):
    """Berilgan boshqarmadagi barcha xodimlar ID larini qaytaradi.

    Xodim boshqarmaga ikki yo'l bilan tegishli bo'lishi mumkin: to'g'ridan-
    to'g'ri (`users.department_id`) yoki o'z bo'limi orqali
    (`divisions.department_id`). Ikkinchisi ham hisobga olinadi, chunki
    xodim bo'limga biriktirilganda `department_id` ustuni to'ldirilmay
    qolishi mumkin edi — o'shanda bo'lim rahbari va uning xodimlari
    boshqarma rahbarining ko'rish doirasidan tushib qolardi.
    """
    from app import db
    from app.models import User, Division

    if not department_id:
        return set()

    div_ids = db.session.query(Division.id).filter(
        Division.department_id == department_id
    )
    users = User.query.filter(
        User.is_active.is_(True),
        db.or_(
            User.department_id == department_id,
            User.division_id.in_(div_ids),
        ),
    ).all()
    return {u.id for u in users}


def div_user_ids(division_id):
    """Berilgan bo'limdagi barcha xodimlar ID larini qaytaradi"""
    from app.models import User
    users = User.query.filter_by(division_id=division_id, is_active=True).all()
    return {u.id for u in users}


# =========================================================================
# IERARXIYA: KIM KIMNI KO'RADI VA BOSHQARADI
#
# Yagona qoida butun tizim uchun:
#   superadmin/direksiya — hamma xodimlar
#   boshqarma rahbari    — faqat o'z boshqarmasi xodimlari (+ o'zi)
#   bo'lim rahbari       — faqat o'z bo'limi xodimlari (+ o'zi)
#   oddiy xodim / agent  — faqat o'zi
#
# Ilgari har route o'z tekshiruvini yozardi va ba'zilari umuman yo'q edi
# (masalan bo'lim rahbari boshqa boshqarma vazifasini o'chira olardi).
# =========================================================================

# Rol darajasi — rahbar faqat o'zidan PAST darajadagi xodimni boshqaradi
ROLE_RANK = {
    'superadmin': 100,
    'director': 90,
    'deputy_director': 80,
    'admin': 60,
    'department_admin': 40,
    'user': 10,
    'agent': 10,
}


def role_rank(role):
    return ROLE_RANK.get(role or 'user', 0)


def scope_user_ids(role, dept_id, div_id, self_id):
    """Rahbar ko'ra oladigan xodimlar ID'lari.

    None — cheklov yo'q (to'liq kirish rollari). Aks holda to'plam; u har
    doim rahbarning o'zini ham o'z ichiga oladi. Boshqarmasi/bo'limi
    biriktirilmagan rahbar faqat o'zini ko'radi (ilgari bunday boshqarma
    rahbari butun tashkilotni ko'rardi).
    """
    if role in FULL_ACCESS_ROLES:
        return None
    ids = set()
    if role == 'admin' and dept_id:
        ids = dept_user_ids(dept_id)
    elif role == 'department_admin' and div_id:
        ids = div_user_ids(div_id)
    if self_id:
        ids.add(int(self_id))
    return ids


def current_scope_user_ids():
    """Joriy so'rov egasi uchun scope_user_ids (JWT claim'lari bazadan
    yangilangan — `sync_claims_from_db` ga qarang)."""
    from flask_jwt_extended import get_jwt, get_jwt_identity
    role, dept_id, div_id = get_scope(get_jwt())
    return scope_user_ids(role, dept_id, div_id, int(get_jwt_identity()))


def in_scope(user_id, scope):
    """`scope_user_ids` natijasi bo'yicha tekshiruv (None = hammasi)."""
    return scope is None or (user_id is not None and int(user_id) in scope)


def can_manage_user(actor_role, actor_id, scope, target):
    """Rahbar shu xodimni tahrirlay/o'chira oladimi.

    Faqat o'z ko'lamidagi va o'zidan past darajadagi xodimni. Bosh
    Administrator hammani boshqaradi. O'zini o'zi bu yo'l bilan boshqarmaydi
    (rolini oshirib yoki o'zini o'chirib qo'ymasin).
    """
    if target is None:
        return False
    if actor_role == 'superadmin':
        return True
    if target.id == actor_id:
        return False
    if role_rank(target.role) >= role_rank(actor_role):
        return False
    return in_scope(target.id, scope)


def supervisor_ids(user):
    """Xodimning bevosita rahbarlari: bo'lim rahbari(lar)i, ular bo'lmasa
    boshqarma rahbari(lar)i. O'z vazifasini tekshiruvga yuborgan xodim
    haqida xabar shu odamlarga ketadi."""
    from app.models import User
    if user is None:
        return []
    if user.division_id and user.role != 'department_admin':
        ids = [u.id for u in User.query.filter_by(
            role='department_admin', division_id=user.division_id, is_active=True).all()]
        if ids:
            return ids
    dept_id = user.department_id
    if not dept_id and user.division:
        dept_id = user.division.department_id
    if dept_id:
        return [u.id for u in User.query.filter_by(
            role='admin', department_id=dept_id, is_active=True).all()]
    return []


def sync_claims_from_db(jwt_data):
    """Token claim'larini har so'rovda bazadagi holat bilan almashtiradi.

    Access token 12 soat yashaydi. Ilgari rol/bo'lim token ichidan olinardi:
    rahbar lavozimidan olinsa yoki xodim bloklansa ham token muddati
    tugaguncha eski huquqlari bilan ishlay olardi. Endi:
      - xodim topilmasa yoki faol bo'lmasa — token rad etiladi (False);
      - role/department_id/division_id/full_name bazadan yoziladi.
    `get_jwt()` aynan shu lug'atni qaytaradi, shuning uchun barcha route'lar
    o'zgartirishsiz yangilangan qiymatni ko'radi.
    """
    from app.models import User
    try:
        uid = int(jwt_data.get('sub'))
    except (TypeError, ValueError):
        return False
    user = User.query.get(uid)
    if user is None or not user.is_active:
        return False
    jwt_data['role'] = user.role
    jwt_data['department_id'] = user.department_id
    jwt_data['division_id'] = user.division_id
    jwt_data['full_name'] = user.full_name
    return True


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
    from urllib.parse import quote
    from urllib.request import Request, urlopen
    from urllib.error import URLError, HTTPError
    from flask import current_app

    tabel_num = (tabel_num or '').strip()
    if not tabel_num:
        return None

    # Login/parol .env'dan (ISUP_USER / ISUP_PASSWORD) — kodda saqlanmaydi.
    # Berilmagan bo'lsa ISUP so'rovi yuborilmaydi.
    cfg = current_app.config
    user, password = cfg.get('ISUP_USER'), cfg.get('ISUP_PASSWORD')
    if not user or not password:
        current_app.logger.warning("ISUP_USER/ISUP_PASSWORD o'rnatilmagan — ISUP so'rovi o'tkazib yuborildi")
        return None

    # Basic auth header
    creds = f"{user}:{password}".encode('utf-8')
    auth_header = 'Basic ' + base64.b64encode(creds).decode('ascii')

    req = Request(
        # Tabel raqami URL yo'liga xavfsiz qo'yiladi ("/", "?" bilan boshqa
        # ISUP manziliga so'rov yuborib bo'lmasin)
        cfg['ISUP_EMPLOYEE_URL'].format(tab=quote(tabel_num, safe='')),
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


def client_ip():
    """Mijoz IP manzili.

    nginx haqiqiy manzilni `X-Real-IP` ga yozadi. `X-Forwarded-For` ning
    birinchi qiymatini esa mijozning o'zi yuborishi mumkin — audit jurnaliga
    soxta IP tushardi, shuning uchun undan foydalanilmaydi.
    """
    from flask import request
    ip = request.headers.get('X-Real-IP') or request.remote_addr or ''
    return ip[:50]


def log_audit(action, entity_type, entity_id=None, entity_label='', details=''):
    """Audit log yozish. db.session.commit() chaqiruvchi tomonidan bajariladi.

    Args:
        action: create/update/delete/assign/approve/return/reject/login/...
        entity_type: user/department/division/team/project/task/... (obyekt turi)
        entity_id: obyekt ID
        entity_label: inson uchun tushunarli nom (masalan foydalanuvchi ismi)
        details: qo'shimcha izoh yoki JSON string
    """
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
        ip = client_ip()
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
