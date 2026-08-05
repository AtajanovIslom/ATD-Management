"""Domen hodisalari — qaysi amalda kimga qanday xabar ketishi shu yerda.

Route'lar bu funksiyalarni bir qator qilib chaqiradi, matn va qabul qiluvchilar
mantig'i esa bitta joyda turadi. Shunda xabar ko'rinishini o'zgartirish uchun
route'larni titkilash shart emas.

Barcha funksiyalar `db.session.commit()` chaqirmaydi — chaqiruvchi o'z
tranzaksiyasida commit qiladi.
"""
from app.services.notifications import discard, notify

# Hodisa kodlari — Flutter tomonda navigatsiya shular bo'yicha quriladi
TASK_ASSIGNED = 'task_assigned'
TASK_REVIEW = 'task_review'
TASK_COMPLETED = 'task_completed'
TASK_RETURNED = 'task_returned'

STAGE_ASSIGNED = 'stage_assigned'
STAGE_REVIEW = 'stage_review'
STAGE_COMPLETED = 'stage_completed'

INTERACTIVE_ASSIGNED = 'interactive_assigned'
INTERACTIVE_TRANSFERRED = 'interactive_transferred'
INTERACTIVE_REVIEW = 'interactive_review'
INTERACTIVE_COMPLETED = 'interactive_completed'
INTERACTIVE_RETURNED = 'interactive_returned'
INTERACTIVE_REJECTED = 'interactive_rejected'


# =========================================================================
# HELPERS
# =========================================================================

def _fmt_deadline(dt):
    return dt.strftime('%d.%m.%Y %H:%M') if dt else ''


def _with_deadline(text, deadline):
    dl = _fmt_deadline(deadline)
    return f'{text} · Muddat: {dl}' if dl else text


def _task_worker_ids(task):
    """Vazifa ijrochilari: yakka mas'ul, ko'p ijrochi yoki (ular bo'lmasa) guruh."""
    ids = [a.id for a in task.assignees]
    if task.assignee_id:
        ids.append(task.assignee_id)
    if not ids and task.team:
        ids = [m.id for m in task.team.members]
    return ids


def _stage_worker_ids(stage):
    ids = [a.id for a in stage.assignees]
    if stage.assignee_id:
        ids.append(stage.assignee_id)
    if not ids and stage.team:
        ids = [m.id for m in stage.team.members]
    return ids


def _request_label(req):
    types = ', '.join(t.name for t in req.types)
    who = req.full_name or req.tabel_num
    return f'{types} · {who}' if types else who


# =========================================================================
# O'CHIRISH
# =========================================================================

def task_deleted(task_id):
    return discard('task', task_id)


def stages_deleted(stage_ids):
    return discard('project_stage', stage_ids)


def interactive_deleted(request_id):
    return discard('interactive_request', request_id)


# =========================================================================
# VAZIFA
# =========================================================================

def task_assigned(task, user_ids=None, actor=None):
    """Vazifa yaratilganda yoki boshqa xodimga qayta yuklanganda.

    user_ids berilmasa vazifaning joriy ijrochilari olinadi.
    """
    return notify(
        _task_worker_ids(task) if user_ids is None else user_ids,
        event=TASK_ASSIGNED,
        title='Yangi vazifa biriktirildi',
        body=_with_deadline(task.name, task.deadline),
        entity_type='task',
        entity_id=task.id,
        data={'deadline': task.deadline.isoformat() if task.deadline else None},
        actor=actor,
    )


def task_status_changed(task, status, actor=None, reason=''):
    """Vazifa holati o'zgardi — kimga xabar ketishi holatga bog'liq.

    review    → vazifani bergan rahbarga (ish tekshirishni kutmoqda)
    completed → ijrochilarga (ish qabul qilindi)
    returned  → ijrochilarga (kamchilik bor, qayta ishlansin)
    """
    if status == 'review':
        return notify(
            task.created_by,
            event=TASK_REVIEW,
            title='Vazifa tekshiruvga tushdi',
            body=task.name,
            entity_type='task',
            entity_id=task.id,
            actor=actor,
        )

    if status == 'completed':
        return notify(
            _task_worker_ids(task),
            event=TASK_COMPLETED,
            title='Vazifa tasdiqlandi',
            body=task.name,
            entity_type='task',
            entity_id=task.id,
            actor=actor,
        )

    if status == 'returned':
        return notify(
            _task_worker_ids(task),
            event=TASK_RETURNED,
            title='Vazifa qaytarildi',
            body=f'{task.name} — {reason}' if reason else task.name,
            entity_type='task',
            entity_id=task.id,
            actor=actor,
        )

    return []


# =========================================================================
# LOYIHA BOSQICHI
# =========================================================================

def stage_assigned(stage, project, user_ids=None, actor=None):
    """user_ids berilmasa bosqichning joriy ijrochilari olinadi."""
    return notify(
        _stage_worker_ids(stage) if user_ids is None else user_ids,
        event=STAGE_ASSIGNED,
        title='Loyiha bosqichi biriktirildi',
        body=_with_deadline(f'{project.name} · {stage.name}', stage.deadline),
        entity_type='project_stage',
        entity_id=stage.id,
        data={
            'project_id': project.id,
            'project_name': project.name,
            'stage_name': stage.name,
            'deadline': stage.deadline.isoformat() if stage.deadline else None,
        },
        actor=actor,
    )


def stage_status_changed(stage, project, status, actor=None):
    """review → loyiha egasiga, completed → bosqich ijrochilariga."""
    common = {
        'entity_type': 'project_stage',
        'entity_id': stage.id,
        'data': {'project_id': project.id, 'project_name': project.name},
        'actor': actor,
    }

    if status == 'review':
        return notify(
            project.created_by,
            event=STAGE_REVIEW,
            title='Bosqich tekshiruvga tushdi',
            body=f'{project.name} · {stage.name}',
            **common,
        )

    if status == 'completed':
        return notify(
            _stage_worker_ids(stage),
            event=STAGE_COMPLETED,
            title='Bosqich tasdiqlandi',
            body=f'{project.name} · {stage.name}',
            **common,
        )

    return []


# =========================================================================
# INTERAKTIV ARIZA
# =========================================================================

def interactive_assigned(req, user_id, actor=None, is_transfer=False):
    """Rahbar arizani xodimga biriktirdi yoki boshqa bo'lim rahbariga uzatdi."""
    return notify(
        user_id,
        event=INTERACTIVE_TRANSFERRED if is_transfer else INTERACTIVE_ASSIGNED,
        title="Ariza bo'limingizga uzatildi" if is_transfer else 'Yangi ariza biriktirildi',
        body=_request_label(req),
        entity_type='interactive_request',
        entity_id=req.id,
        data={'tracking_id': req.tracking_id, 'status': req.status},
        actor=actor,
    )


def interactive_status_changed(req, status, actor=None, reason=''):
    """pending_review → biriktirgan rahbarga, qolgani → ijrochiga."""
    label = _request_label(req)
    common = {
        'entity_type': 'interactive_request',
        'entity_id': req.id,
        'data': {'tracking_id': req.tracking_id, 'status': status},
        'actor': actor,
    }

    if status == 'pending_review':
        return notify(
            req.assigned_by,
            event=INTERACTIVE_REVIEW,
            title='Ariza tekshiruvga tushdi',
            body=label,
            **common,
        )

    titles = {
        'completed': ('Ariza tasdiqlandi', INTERACTIVE_COMPLETED),
        'in_progress': ('Ariza qaytarildi', INTERACTIVE_RETURNED),
        'rejected': ('Ariza rad etildi', INTERACTIVE_REJECTED),
    }
    if status not in titles:
        return []

    title, code = titles[status]
    return notify(
        req.assigned_to,
        event=code,
        title=title,
        body=f'{label} — {reason}' if reason else label,
        **common,
    )
