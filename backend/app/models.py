from datetime import datetime, timezone
from app import db


def utc_naive_now():
    """Naive UTC vaqt.

    TIMESTAMP WITHOUT TIME ZONE ustunlariga tz-aware vaqt yozilsa, PostgreSQL uni
    sessiya (lokal) mintaqasiga o'girib, tz'ni olib tashlaydi — natijada o'qishda
    vaqt siljib ketadi. Shuning uchun vaqt hisobida naive UTC ishlatiladi.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)

team_members = db.Table('team_members',
    db.Column('team_id', db.Integer, db.ForeignKey('teams.id'), primary_key=True),
    db.Column('user_id', db.Integer, db.ForeignKey('users.id'), primary_key=True),
)

project_teams = db.Table('project_teams',
    db.Column('project_id', db.Integer, db.ForeignKey('projects.id'), primary_key=True),
    db.Column('team_id', db.Integer, db.ForeignKey('teams.id'), primary_key=True),
)

task_assignees = db.Table('task_assignees',
    db.Column('task_id', db.Integer, db.ForeignKey('tasks.id'), primary_key=True),
    db.Column('user_id', db.Integer, db.ForeignKey('users.id'), primary_key=True),
)

stage_assignees = db.Table('stage_assignees',
    db.Column('stage_id', db.Integer, db.ForeignKey('project_stages.id'), primary_key=True),
    db.Column('user_id', db.Integer, db.ForeignKey('users.id'), primary_key=True),
)


class Department(db.Model):
    """Boshqarma (ATD direksiyasidagi boshqarmalar)"""
    __tablename__ = 'departments'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True)
    description = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    divisions = db.relationship('Division', backref='department', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description or '',
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'division_count': len(self.divisions),
            'divisions': [d.to_dict() for d in self.divisions],
        }

    def to_list_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description or '',
            'division_count': len(self.divisions),
        }


class Division(db.Model):
    """Bo'lim (Boshqarma ichidagi bo'limlar)"""
    __tablename__ = 'divisions'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'), nullable=False)
    description = db.Column(db.Text, default='')
    is_service_provider = db.Column(db.Boolean, default=False)  # Texnik xizmat bo'limi
    service_api_key = db.Column(db.String(64), nullable=True)   # Tashqi API kaliti
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    members = db.relationship('User', backref='division', lazy=True, foreign_keys='User.division_id')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'department_id': self.department_id,
            'department_name': self.department.name if self.department else None,
            'description': self.description or '',
            'is_service_provider': self.is_service_provider or False,
            'service_api_key': self.service_api_key,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'member_count': len(self.members),
            'members': [{'id': m.id, 'full_name': m.full_name, 'position': m.position or ''} for m in self.members],
        }


class ServiceDepartment(db.Model):
    """Interaktiv xizmatlar bo'limi (kategoriya)"""
    __tablename__ = 'service_departments'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.Text, nullable=False)
    # True bo'lsa — arizada bu bo'limning bir nechta xizmat turini birga tanlash mumkin
    multi_type = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    types = db.relationship(
        'ServiceType',
        backref='department',
        lazy='select',
        cascade='all, delete-orphan',
        order_by='ServiceType.id',
    )

    def to_dict(self, type_count=None):
        return {
            'id': self.id,
            'name': self.name,
            'multi_type': bool(self.multi_type),
            'type_count': type_count if type_count is not None else len(self.types),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class ServiceType(db.Model):
    """Interaktiv xizmat turi (bo'lim ichida)"""
    __tablename__ = 'service_types'

    id = db.Column(db.Integer, primary_key=True)
    department_id = db.Column(
        db.Integer,
        db.ForeignKey('service_departments.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    name = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'department_id': self.department_id,
            'name': self.name,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# --- M2M: bitta arizada bir nechta xizmat turlari (masalan Создание учётных записей) ---
interactive_request_types = db.Table(
    'interactive_request_types',
    db.Column('request_id', db.Integer,
              db.ForeignKey('interactive_requests.id', ondelete='CASCADE'),
              primary_key=True),
    db.Column('type_id', db.Integer,
              db.ForeignKey('service_types.id'),
              primary_key=True),
)


class InteractiveRequest(db.Model):
    """
    Interaktiv xizmat arizalari.

    Ariza oqimi (statuslari):
      new            — Yangi (arizachi yubordi)
      in_progress    — Ishlash jarayonida (rahbar xodimga biriktirdi, xodim ishlayapti)
      pending_review — Tasdiqlash kutilmoqda (xodim "bajarildi" dedi)
      completed      — Yakunlandi (rahbar tasdiqladi)
      rejected       — Rad etildi

    Qaytarish:
      Rahbar `pending_review` da "Qaytarildi" bosadi — status yana `in_progress`
      ga qaytadi va tarixga log yoziladi. Xodim yana ishlaydi.
    """
    __tablename__ = 'interactive_requests'

    id = db.Column(db.Integer, primary_key=True)
    tracking_id = db.Column(db.String(32), unique=True, nullable=False, index=True)

    # Arizachi ma'lumotlari
    phone_num = db.Column(db.String(30), nullable=False)
    tabel_num = db.Column(db.String(50), nullable=False, index=True)
    department_id = db.Column(db.Integer, db.ForeignKey('service_departments.id'), nullable=False, index=True)
    comment = db.Column(db.Text, default='')

    # ISUP tizimidan tabel_num bo'yicha avtomatik to'ldiriladi
    full_name = db.Column(db.Text, default='')
    position = db.Column(db.Text, default='')
    division = db.Column(db.Text, default='')

    # Ariza qanday yaratilgan: 'public' (API/mobil ilova) yoki 'walkin' (xodim qo'lda kiritdi)
    source = db.Column(db.String(20), default='public')

    # Jarayon
    status = db.Column(db.String(20), default='new', index=True)

    assigned_to = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)
    assigned_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    reviewed_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    result_note = db.Column(db.Text, default='')     # Xodim yozgan bajarish natijasi
    reject_reason = db.Column(db.Text, default='')   # Rahbar rad etish sababi

    return_count = db.Column(db.Integer, default=0)  # Necha marta qaytarilgan

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    assigned_at = db.Column(db.DateTime)
    submitted_review_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)

    # Relations
    department = db.relationship('ServiceDepartment', foreign_keys=[department_id], lazy='joined')
    types = db.relationship('ServiceType', secondary=interactive_request_types, lazy='joined')
    assignee = db.relationship('User', foreign_keys=[assigned_to], lazy='joined')
    assigner = db.relationship('User', foreign_keys=[assigned_by], lazy='joined')
    reviewer = db.relationship('User', foreign_keys=[reviewed_by], lazy='joined')
    history = db.relationship(
        'InteractiveRequestHistory',
        backref='request',
        lazy='select',
        cascade='all, delete-orphan',
        order_by='InteractiveRequestHistory.created_at',
    )

    STATUS_LABELS = {
        'new': 'Yangi',
        'in_progress': 'Ishlash jarayonida',
        'pending_review': 'Tasdiqlash kutilmoqda',
        'completed': 'Yakunlandi',
        'rejected': 'Rad etildi',
    }

    def _types_dict(self):
        return [{'id': t.id, 'name': t.name} for t in self.types]

    def to_dict(self):
        return {
            'id': self.id,
            'tracking_id': self.tracking_id,
            'phone_num': self.phone_num,
            'tabel_num': self.tabel_num,
            'full_name': self.full_name or '',
            'position': self.position or '',
            'division': self.division or '',
            'comment': self.comment or '',
            'source': self.source or 'public',
            'department_id': self.department_id,
            'department_name': self.department.name if self.department else None,
            'types': self._types_dict(),
            'status': self.status,
            'status_label': self.STATUS_LABELS.get(self.status, self.status),
            'assigned_to': self.assigned_to,
            'assignee_name': self.assignee.full_name if self.assignee else None,
            'assigned_by': self.assigned_by,
            'assigner_name': self.assigner.full_name if self.assigner else None,
            'reviewed_by': self.reviewed_by,
            'reviewer_name': self.reviewer.full_name if self.reviewer else None,
            'result_note': self.result_note or '',
            'reject_reason': self.reject_reason or '',
            'return_count': self.return_count or 0,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'assigned_at': self.assigned_at.isoformat() if self.assigned_at else None,
            'submitted_review_at': self.submitted_review_at.isoformat() if self.submitted_review_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }

    def to_public(self, with_history=False):
        d = {
            'tracking_id': self.tracking_id,
            'phone_num': self.phone_num,
            'tabel_num': self.tabel_num,
            'full_name': self.full_name or '',
            'position': self.position or '',
            'division': self.division or '',
            'department_name': self.department.name if self.department else None,
            'types': self._types_dict(),
            'comment': self.comment or '',
            'source': self.source or 'public',
            'status': self.status,
            'status_label': self.STATUS_LABELS.get(self.status, self.status),
            'assignee_name': self.assignee.full_name if self.assignee else None,
            'reviewer_name': self.reviewer.full_name if self.reviewer else None,
            'result_note': self.result_note or '',
            'reject_reason': self.reject_reason or '',
            'return_count': self.return_count or 0,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }
        if with_history:
            d['history'] = [h.to_public() for h in self.history]
        return d


class InteractiveRequestHistory(db.Model):
    """Ariza tarixi — har bir status o'zgarishi log qilinadi"""
    __tablename__ = 'interactive_request_history'

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey('interactive_requests.id', ondelete='CASCADE'),
                           nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False)
    actor_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    actor_name = db.Column(db.String(255), default='')
    note = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    actor = db.relationship('User', foreign_keys=[actor_id], lazy='joined')

    def to_public(self):
        return {
            'status': self.status,
            'status_label': InteractiveRequest.STATUS_LABELS.get(self.status, self.status),
            'actor_name': self.actor_name or (self.actor.full_name if self.actor else None),
            'note': self.note or '',
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Reminder(db.Model):
    """Foydalanuvchining shaxsiy eslatmalari (kalendar bo'yicha)"""
    __tablename__ = 'reminders'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'),
                        nullable=False, index=True)
    remind_date = db.Column(db.Date, nullable=False, index=True)
    message = db.Column(db.Text, nullable=False)
    is_completed = db.Column(db.Boolean, default=False, index=True)
    completed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime,
                           default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    # Ogohlantirish takrorlanish oralig'i (daqiqada). 0 = takrorlamaslik (faqat login'da bir marta)
    notify_interval = db.Column(db.Integer, default=1440)
    last_notified_at = db.Column(db.DateTime)

    files = db.relationship('ReminderAttachment', backref='reminder', lazy=True, cascade='all, delete-orphan')

    # Maxsus rejim: muddatga LAST_WEEK_DAYS kun qolganda kunlik ogohlantirish
    LAST_WEEK_MODE = -1
    LAST_WEEK_DAYS = 7

    # Interfeys uchun ruxsat etilgan oraliqlar (daqiqa -> nom)
    INTERVAL_LABELS = {
        0: 'Takrorlanmasin',
        LAST_WEEK_MODE: 'Oxirgi haftadan boshlab har kuni',
        60: 'Har soatda',
        120: 'Har 2 soatda',
        360: 'Har 6 soatda',
        720: 'Har 12 soatda',
        1440: 'Har kuni',
        10080: 'Har haftada',
        43200: 'Har oyda',
    }

    def days_left(self):
        from datetime import date as _date
        return (self.remind_date - _date.today()).days if self.remind_date else None

    def is_notification_due(self, now=None):
        """Ogohlantirish ko'rsatish vaqti keldimi?

        `last_notified_at` — TIMESTAMP WITHOUT TIME ZONE ustuni, unga naive UTC
        yoziladi (utc_naive_now()). Shuning uchun taqqoslash ham naive UTC'da.
        """
        interval = self.notify_interval if self.notify_interval is not None else 1440

        if interval == self.LAST_WEEK_MODE:
            # Muddatga bir haftadan ko'p qolgan bo'lsa — jim turamiz
            dl = self.days_left()
            if dl is None or dl > self.LAST_WEEK_DAYS:
                return False
            interval = 1440  # oxirgi haftada — kunlik

        if interval == 0:
            # Takrorlanmaydi — faqat hech qachon ko'rsatilmagan bo'lsa
            return self.last_notified_at is None
        if self.last_notified_at is None:
            return True

        now = now or utc_naive_now()
        last = self.last_notified_at
        if last.tzinfo is not None:
            last = last.astimezone(timezone.utc).replace(tzinfo=None)
        elapsed_minutes = (now - last).total_seconds() / 60
        return elapsed_minutes >= interval

    def to_dict(self):
        rd = self.remind_date
        days_left = self.days_left()
        interval = self.notify_interval if self.notify_interval is not None else 1440
        return {
            'id': self.id,
            'user_id': self.user_id,
            'remind_date': rd.isoformat() if rd else None,
            'message': self.message or '',
            'is_completed': bool(self.is_completed),
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'days_left': days_left,
            'is_overdue': (not self.is_completed) and days_left is not None and days_left < 0,
            'notify_interval': interval,
            'notify_interval_label': self.INTERVAL_LABELS.get(interval, f'Har {interval} daqiqada'),
            'last_notified_at': self.last_notified_at.isoformat() if self.last_notified_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'files': [f.to_dict() for f in self.files],
        }


class ReminderAttachment(db.Model):
    __tablename__ = 'reminder_attachments'

    id = db.Column(db.Integer, primary_key=True)
    reminder_id = db.Column(db.Integer, db.ForeignKey('reminders.id', ondelete='CASCADE'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    file_size = db.Column(db.Integer)
    uploaded_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'reminder_id': self.reminder_id,
            'filename': self.filename,
            'original_name': self.original_name,
            'file_size': self.file_size,
            'download_url': f'/reminders/files/{self.filename}',
        }


class WorkLog(db.Model):
    """Xodimning kunlik ish hisoboti.

    Xodim kun davomida bajargan ishini yozadi va qaysi loyiha yoki vazifaga
    tegishli ekanini belgilaydi. Sana bo'yicha saqlanadi, egasi tahrirlashi/
    o'chirishi mumkin. Boshqarma rahbari o'z boshqarmasi xodimlarining
    hisobotlarini ko'radi.
    """
    __tablename__ = 'work_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'),
                        nullable=False, index=True)
    work_date = db.Column(db.Date, nullable=False, index=True)
    content = db.Column(db.Text, nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='SET NULL'), nullable=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    user = db.relationship('User', foreign_keys=[user_id], lazy='joined')
    project = db.relationship('Project', foreign_keys=[project_id], lazy='joined')
    task = db.relationship('Task', foreign_keys=[task_id], lazy='joined')

    def ref_label(self):
        if self.project:
            return f"Loyiha: {self.project.name}"
        if self.task:
            return f"Vazifa: {self.task.name}"
        return "—"

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user_name': self.user.full_name if self.user else None,
            'user_position': self.user.position if self.user else None,
            'work_date': self.work_date.isoformat() if self.work_date else None,
            'content': self.content or '',
            'project_id': self.project_id,
            'project_name': self.project.name if self.project else None,
            'task_id': self.task_id,
            'task_name': self.task.name if self.task else None,
            'ref_label': self.ref_label(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class AuditLog(db.Model):
    """Loyiha bo'ylab barcha muhim amallar tarixi (kim, qachon, nima qildi)"""
    __tablename__ = 'audit_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)
    user_name = db.Column(db.String(255), default='')
    user_role = db.Column(db.String(30), default='')

    action = db.Column(db.String(50), nullable=False, index=True)
    # create | update | delete | assign | approve | return | reject | login | ...

    entity_type = db.Column(db.String(80), nullable=False, index=True)
    # user | department | division | team | project | task | service_department |
    # service_type | interactive_request | role | ...

    entity_id = db.Column(db.Integer, nullable=True)
    entity_label = db.Column(db.Text, default='')  # inson uchun tushunarli nom
    details = db.Column(db.Text, default='')       # qo'shimcha izoh yoki JSON
    ip_address = db.Column(db.String(50), default='')

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    user = db.relationship('User', foreign_keys=[user_id], lazy='joined')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user_name': self.user_name or (self.user.full_name if self.user else ''),
            'user_role': self.user_role or '',
            'action': self.action,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'entity_label': self.entity_label or '',
            'details': self.details or '',
            'ip_address': self.ip_address or '',
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class ServiceRequest(db.Model):
    """Kombinat miqyosida API orqali kelib tushgan texnik xizmat so'rovlari"""
    __tablename__ = 'service_requests'

    id = db.Column(db.Integer, primary_key=True)
    external_id = db.Column(db.String(64), unique=True, nullable=False)  # Mobil ilovadagi zayavka ID
    division_id = db.Column(db.Integer, db.ForeignKey('divisions.id'), nullable=False)

    # Arizachi ma'lumotlari
    submitter_name = db.Column(db.String(255), nullable=False)
    submitter_phone = db.Column(db.String(50), default='')
    submitter_email = db.Column(db.String(255), default='')
    submitter_address = db.Column(db.String(500), default='')

    # So'rov mazmuni
    category = db.Column(db.String(100), default='')  # Turi (masalan: "internet", "video kuzatuv")
    title = db.Column(db.String(500), nullable=False)
    description = db.Column(db.Text, default='')
    priority = db.Column(db.String(20), default='normal')  # low, normal, high, urgent

    # Holat
    status = db.Column(db.String(30), default='new')
    # new, accepted, in_progress, completed, rejected

    # Jarayon
    assigned_to = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    accepted_at = db.Column(db.DateTime)
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    result_note = db.Column(db.Text, default='')
    reject_reason = db.Column(db.Text, default='')

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    assignee = db.relationship('User', foreign_keys=[assigned_to], lazy=True)
    division = db.relationship('Division', foreign_keys=[division_id], lazy=True)

    STATUS_LABELS = {
        'new': "Yangi (qabul qilinmagan)",
        'accepted': "Qabul qilingan",
        'in_progress': "Jarayonda",
        'completed': "Ijobiy bajarilgan",
        'rejected': "Rad etilgan",
    }

    def to_dict(self):
        return {
            'id': self.id,
            'external_id': self.external_id,
            'division_id': self.division_id,
            'division_name': self.division.name if self.division else None,
            'submitter_name': self.submitter_name,
            'submitter_phone': self.submitter_phone or '',
            'submitter_email': self.submitter_email or '',
            'submitter_address': self.submitter_address or '',
            'category': self.category or '',
            'title': self.title,
            'description': self.description or '',
            'priority': self.priority,
            'status': self.status,
            'status_label': self.STATUS_LABELS.get(self.status, self.status),
            'assigned_to': self.assigned_to,
            'assignee_name': self.assignee.full_name if self.assignee else None,
            'accepted_at': self.accepted_at.isoformat() if self.accepted_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'result_note': self.result_note or '',
            'reject_reason': self.reject_reason or '',
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def to_public_status(self):
        """Mobil ilovaga qaytariladigan qisqa holat"""
        return {
            'external_id': self.external_id,
            'status': self.status,
            'status_label': self.STATUS_LABELS.get(self.status, self.status),
            'assignee_name': self.assignee.full_name if self.assignee else None,
            'accepted_at': self.accepted_at.isoformat() if self.accepted_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'result_note': self.result_note or '',
            'reject_reason': self.reject_reason or '',
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class AdminPermission(db.Model):
    """Admin foydalanuvchiga berilgan huquqlar"""
    __tablename__ = 'admin_permissions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)
    permissions = db.Column(db.JSON, default=list)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship('User', backref=db.backref('admin_permission', uselist=False))

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'permissions': self.permissions or [],
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(255), nullable=False)
    department = db.Column(db.String(255), nullable=False)
    position = db.Column(db.String(255), default='')
    tab_number = db.Column(db.String(50), unique=True, nullable=False)
    login = db.Column(db.String(100), unique=True, nullable=True)
    password_hash = db.Column(db.String(255), nullable=True)
    plain_password = db.Column(db.String(255), default='')
    # superadmin | admin (Boshqarma rahbari) | department_admin (Bo'lim rahbari) | user
    role = db.Column(db.String(20), default='user')
    email = db.Column(db.String(255), nullable=True)
    phone = db.Column(db.String(50), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    registration_token = db.Column(db.String(64), unique=True, nullable=True)
    division_id = db.Column(db.Integer, db.ForeignKey('divisions.id'), nullable=True)
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    managed_department = db.relationship('Department', foreign_keys=[department_id], lazy=True)

    def to_dict(self):
        div = self.division
        dept = self.managed_department
        return {
            'id': self.id,
            'full_name': self.full_name,
            'department': self.department,
            'position': self.position or '',
            'tab_number': self.tab_number,
            'login': self.login,
            'plain_password': self.plain_password or '',
            'role': self.role,
            'email': self.email or '',
            'phone': self.phone or '',
            'is_active': self.is_active,
            'registration_token': self.registration_token,
            'division_id': self.division_id,
            'division_name': div.name if div else None,
            # Xodimning bo'linmasi interaktiv xizmat ko'rsatadimi (interaktiv arizalar
            # sahifasiga kirish huquqini aniqlash uchun)
            'division_is_service_provider': bool(div.is_service_provider) if div else False,
            'department_id': self.department_id,
            'department_name': dept.name if dept else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Team(db.Model):
    __tablename__ = 'teams'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    creator = db.relationship('User', foreign_keys=[created_by], lazy=True)
    department = db.relationship('Department', foreign_keys=[department_id], lazy=True)
    members = db.relationship('User', secondary=team_members, backref='teams', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'created_by': self.created_by,
            'creator_name': self.creator.full_name if self.creator else None,
            'department_id': self.department_id,
            'department_name': self.department.name if self.department else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'members': [{'id': m.id, 'full_name': m.full_name, 'position': m.position or '', 'department': m.department, 'department_id': m.department_id} for m in self.members],
        }


class Project(db.Model):
    __tablename__ = 'projects'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, default='')
    status = db.Column(db.String(50), default='active')
    start_date = db.Column(db.DateTime)
    deadline = db.Column(db.DateTime)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    creator = db.relationship('User', backref='created_projects', lazy=True)
    teams = db.relationship('Team', secondary=project_teams, backref='projects', lazy=True)
    stages = db.relationship('ProjectStage', backref='project', lazy=True, cascade='all, delete-orphan', order_by='ProjectStage.order')
    attachments = db.relationship('ProjectAttachment', backref='project', lazy=True, cascade='all, delete-orphan')
    reports = db.relationship('DailyReport', backref='project', lazy=True, cascade='all, delete-orphan', order_by='DailyReport.created_at.desc()')

    def current_stage(self):
        for s in sorted(self.stages, key=lambda x: x.order):
            if s.status != 'completed':
                return s
        return self.stages[-1] if self.stages else None

    def progress_percent(self):
        if not self.stages:
            return 0
        done = sum(1 for s in self.stages if s.status == 'completed')
        return round(done / len(self.stages) * 100)

    def to_dict(self):
        cur = self.current_stage()
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'status': self.status,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'deadline': self.deadline.isoformat() if self.deadline else None,
            'created_by': self.created_by,
            'creator_name': self.creator.full_name if self.creator else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'teams': [t.to_dict() for t in self.teams],
            'stages': [s.to_dict() for s in sorted(self.stages, key=lambda x: x.order)],
            'attachments': [a.to_dict() for a in self.attachments],
            'current_stage': cur.to_dict() if cur else None,
            'progress': self.progress_percent(),
        }

    def to_list_dict(self):
        cur = self.current_stage()
        return {
            'id': self.id,
            'name': self.name,
            'status': self.status,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'deadline': self.deadline.isoformat() if self.deadline else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'teams': [{'id': t.id, 'name': t.name, 'member_count': len(t.members)} for t in self.teams],
            'stage_count': len(self.stages),
            'current_stage_name': cur.name if cur else None,
            'progress': self.progress_percent(),
        }


class ProjectStage(db.Model):
    __tablename__ = 'project_stages'

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    order = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(50), default='pending')
    deadline = db.Column(db.DateTime)
    team_id = db.Column(db.Integer, db.ForeignKey('teams.id'))
    assignee_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)

    team = db.relationship('Team', lazy=True)
    assignee = db.relationship('User', lazy=True)
    assignees = db.relationship('User', secondary=stage_assignees, lazy=True)
    sub_stages = db.relationship('SubStage', backref='stage', lazy=True, cascade='all, delete-orphan', order_by='SubStage.order')

    @property
    def is_overdue(self):
        now = datetime.utcnow()
        dl = self.deadline.replace(tzinfo=None) if self.deadline and self.deadline.tzinfo else self.deadline
        if dl and self.status == 'completed' and self.completed_at:
            ca = self.completed_at.replace(tzinfo=None) if self.completed_at.tzinfo else self.completed_at
            return ca > dl
        if dl and self.status != 'completed':
            return now > dl
        return False

    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'name': self.name,
            'order': self.order,
            'status': self.status,
            'deadline': self.deadline.isoformat() if self.deadline else None,
            'team_id': self.team_id,
            'team_name': self.team.name if self.team else None,
            'team_members': [{'id': m.id, 'full_name': m.full_name, 'position': m.position or ''} for m in self.team.members] if self.team else [],
            'assignee_id': self.assignee_id,
            'assignee_name': self.assignee.full_name if self.assignee else None,
            'assignees': [{'id': a.id, 'full_name': a.full_name, 'position': a.position or ''} for a in self.assignees],
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'is_overdue': self.is_overdue,
            'sub_stages': [ss.to_dict() for ss in sorted(self.sub_stages, key=lambda x: x.order)],
        }


class SubStage(db.Model):
    __tablename__ = 'sub_stages'

    id = db.Column(db.Integer, primary_key=True)
    stage_id = db.Column(db.Integer, db.ForeignKey('project_stages.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    order = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(50), default='pending')
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    completed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    creator = db.relationship('User', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'stage_id': self.stage_id,
            'name': self.name,
            'order': self.order,
            'status': self.status,
            'created_by': self.created_by,
            'creator_name': self.creator.full_name if self.creator else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class ProjectAttachment(db.Model):
    __tablename__ = 'project_attachments'

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    file_size = db.Column(db.Integer)
    uploaded_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'filename': self.filename,
            'original_name': self.original_name,
            'file_size': self.file_size,
            'download_url': f'/projects/files/{self.filename}',
        }


class DailyReport(db.Model):
    __tablename__ = 'daily_reports'

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    stage_id = db.Column(db.Integer, db.ForeignKey('project_stages.id'))
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship('User', backref='reports', lazy=True)
    stage = db.relationship('ProjectStage', backref='reports', lazy=True)
    files = db.relationship('ReportAttachment', backref='report', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'user_id': self.user_id,
            'user_name': self.user.full_name if self.user else None,
            'user_position': self.user.position if self.user else None,
            'content': self.content,
            'stage_id': self.stage_id,
            'stage_name': self.stage.name if self.stage else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'files': [f.to_dict() for f in self.files],
        }


class Task(db.Model):
    __tablename__ = 'tasks'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, default='')
    status = db.Column(db.String(50), default='active')
    start_date = db.Column(db.DateTime)
    deadline = db.Column(db.DateTime)
    team_id = db.Column(db.Integer, db.ForeignKey('teams.id'))
    assignee_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = db.Column(db.DateTime)

    creator = db.relationship('User', foreign_keys=[created_by], backref='created_tasks', lazy=True)
    team = db.relationship('Team', lazy=True)
    assignee = db.relationship('User', foreign_keys=[assignee_id], lazy=True)
    assignees = db.relationship('User', secondary=task_assignees, lazy=True)
    reports = db.relationship('TaskReport', backref='task', lazy=True, cascade='all, delete-orphan', order_by='TaskReport.created_at.desc()')
    attachments = db.relationship('TaskAttachment', backref='task', lazy=True, cascade='all, delete-orphan')

    @property
    def is_overdue(self):
        now = datetime.utcnow()
        dl = self.deadline.replace(tzinfo=None) if self.deadline and self.deadline.tzinfo else self.deadline
        if dl and self.status == 'completed' and self.completed_at:
            ca = self.completed_at.replace(tzinfo=None) if self.completed_at.tzinfo else self.completed_at
            return ca > dl
        if dl and self.status != 'completed':
            return now > dl
        return False

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'status': self.status,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'deadline': self.deadline.isoformat() if self.deadline else None,
            'team_id': self.team_id,
            'team_name': self.team.name if self.team else None,
            'team_members': [{'id': m.id, 'full_name': m.full_name, 'position': m.position or ''} for m in self.team.members] if self.team else [],
            'assignee_id': self.assignee_id,
            'assignee_name': self.assignee.full_name if self.assignee else None,
            'assignees': [{'id': a.id, 'full_name': a.full_name, 'position': a.position or ''} for a in self.assignees],
            'created_by': self.created_by,
            'creator_name': self.creator.full_name if self.creator else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'is_overdue': self.is_overdue,
            'reports': [r.to_dict() for r in self.reports],
            'attachments': [a.to_dict() for a in self.attachments],
        }

    def to_list_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'status': self.status,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'deadline': self.deadline.isoformat() if self.deadline else None,
            'team_name': self.team.name if self.team else None,
            'assignee_name': self.assignee.full_name if self.assignee else None,
            'assignee_names': [a.full_name for a in self.assignees],
            'is_overdue': self.is_overdue,
            'report_count': len(self.reports),
        }


class TaskAttachment(db.Model):
    __tablename__ = 'task_attachments'

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    file_size = db.Column(db.Integer)
    uploaded_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'filename': self.filename,
            'original_name': self.original_name,
            'file_size': self.file_size,
            'download_url': f'/tasks/files/{self.filename}',
        }


class TaskReport(db.Model):
    __tablename__ = 'task_reports'

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship('User', lazy=True)
    files = db.relationship('ReportAttachment', backref='task_report',
                            primaryjoin='TaskReport.id == ReportAttachment.task_report_id', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'user_id': self.user_id,
            'user_name': self.user.full_name if self.user else None,
            'user_position': self.user.position if self.user else None,
            'content': self.content,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'files': [f.to_dict() for f in self.files],
        }


class ReportAttachment(db.Model):
    __tablename__ = 'report_attachments'

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('daily_reports.id'))
    task_report_id = db.Column(db.Integer, db.ForeignKey('task_reports.id'))
    filename = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    file_size = db.Column(db.Integer)
    uploaded_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'report_id': self.report_id,
            'filename': self.filename,
            'original_name': self.original_name,
            'file_size': self.file_size,
            'download_url': f'/projects/report-files/{self.filename}',
        }
