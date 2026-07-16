from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from app.models import User, Task, TaskReport, ProjectStage, DailyReport
from app.utils import get_scope, is_dept_admin_or_above, dept_user_ids, div_user_ids

stats_bp = Blueprint('stats', __name__)


def _strip(dt):
    if dt and dt.tzinfo:
        return dt.replace(tzinfo=None)
    return dt


def _summarize(items):
    total = len(items)
    completed = on_time = late = in_progress = 0
    for it in items:
        if it.status == 'completed':
            completed += 1
            dl = _strip(it.deadline)
            ca = _strip(it.completed_at)
            if dl and ca and ca > dl:
                late += 1
            else:
                on_time += 1
        elif it.status in ('active', 'in_progress', 'review', 'returned', 'pending'):
            in_progress += 1
    return {'total': total, 'completed': completed, 'on_time': on_time, 'late': late, 'in_progress': in_progress}


@stats_bp.route('/employees', methods=['GET'])
@jwt_required()
def employee_stats():
    role, dept_id, div_id = get_scope(get_jwt())
    if not is_dept_admin_or_above(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    q = User.query.filter_by(is_active=True).filter(User.role.in_(['user', 'department_admin']))
    if role == 'admin' and dept_id:
        q = q.filter_by(department_id=dept_id)
    elif role == 'department_admin' and div_id:
        q = q.filter_by(division_id=div_id)
    users = q.order_by(User.full_name).all()
    tasks = Task.query.all()
    stages = ProjectStage.query.all()

    result = []
    for u in users:
        uid = u.id
        u_team_ids = {t.id for t in u.teams}

        u_tasks = []
        for t in tasks:
            a_ids = {a.id for a in t.assignees}
            if (t.assignee_id == uid) or (uid in a_ids) or \
               (not t.assignee_id and not a_ids and t.team_id in u_team_ids):
                u_tasks.append(t)

        u_stages = []
        for s in stages:
            a_ids = {a.id for a in s.assignees}
            if (s.assignee_id == uid) or (uid in a_ids) or \
               (not s.assignee_id and not a_ids and s.team_id in u_team_ids):
                u_stages.append(s)

        task_reports = TaskReport.query.filter_by(user_id=uid).count()
        project_reports = DailyReport.query.filter_by(user_id=uid).count()

        task_summary = _summarize(u_tasks)
        stage_summary = _summarize(u_stages)

        total_items = task_summary['total'] + stage_summary['total']
        total_completed = task_summary['completed'] + stage_summary['completed']
        total_on_time = task_summary['on_time'] + stage_summary['on_time']
        total_late = task_summary['late'] + stage_summary['late']
        total_in_progress = task_summary['in_progress'] + stage_summary['in_progress']

        # KPI: bajarilganlar ichida vaqtida bajarilgani foizi
        kpi = round(total_on_time / total_completed * 100) if total_completed else 0
        completion_rate = round(total_completed / total_items * 100) if total_items else 0

        work_items = []
        for t in u_tasks:
            work_items.append({
                'type': 'task',
                'type_label': 'Vazifa',
                'id': t.id,
                'name': t.name,
                'parent': None,
                'status': t.status,
                'deadline': t.deadline.isoformat() if t.deadline else None,
                'completed_at': t.completed_at.isoformat() if t.completed_at else None,
                'is_overdue': t.is_overdue,
            })
        for s in u_stages:
            work_items.append({
                'type': 'stage',
                'type_label': 'Loyiha bosqichi',
                'id': s.id,
                'name': s.name,
                'parent': s.project.name if s.project else None,
                'status': s.status,
                'deadline': s.deadline.isoformat() if s.deadline else None,
                'completed_at': s.completed_at.isoformat() if s.completed_at else None,
                'is_overdue': s.is_overdue,
            })

        result.append({
            'user_id': uid,
            'full_name': u.full_name,
            'department': u.department,
            'position': u.position or '',
            'total_items': total_items,
            'completed': total_completed,
            'on_time': total_on_time,
            'late': total_late,
            'in_progress': total_in_progress,
            'task_count': task_summary['total'],
            'stage_count': stage_summary['total'],
            'reports': task_reports + project_reports,
            'kpi': kpi,
            'completion_rate': completion_rate,
            'work_items': work_items,
        })

    return jsonify(result)
