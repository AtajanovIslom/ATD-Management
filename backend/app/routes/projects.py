import os
import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from app import db
from app.models import Project, ProjectStage, ProjectAttachment, DailyReport, ReportAttachment, Team, User, SubStage
from app.utils import get_scope, is_any_admin, is_superadmin, dept_user_ids, div_user_ids

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'uploads')
ALLOWED_EXTENSIONS = {'doc', 'docx', 'xls', 'xlsx', 'pdf', 'txt', 'png', 'jpg', 'jpeg', 'zip', 'rar', 'pptx'}


def parse_datetime(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


projects_bp = Blueprint('projects', __name__)


def is_admin_role():
    return is_any_admin(get_jwt().get('role', ''))


@projects_bp.route('', methods=['GET'])
@jwt_required()
def get_projects():
    claims = get_jwt()
    user_id = int(get_jwt_identity())
    role, dept_id, div_id = get_scope(claims)

    if is_superadmin(role):
        projects = Project.query.order_by(Project.created_at.desc()).all()
    elif role == 'admin' and dept_id:
        uid_set = dept_user_ids(dept_id)
        uid_set.add(user_id)
        projects = Project.query.filter(
            db.or_(
                Project.created_by.in_(uid_set),
                Project.stages.any(ProjectStage.assignee_id.in_(uid_set)),
                Project.stages.any(ProjectStage.assignees.any(User.id.in_(uid_set))),
            )
        ).order_by(Project.created_at.desc()).all()
    elif role == 'department_admin' and div_id:
        uid_set = div_user_ids(div_id)
        uid_set.add(user_id)
        projects = Project.query.filter(
            db.or_(
                Project.created_by.in_(uid_set),
                Project.stages.any(ProjectStage.assignee_id.in_(uid_set)),
                Project.stages.any(ProjectStage.assignees.any(User.id.in_(uid_set))),
            )
        ).order_by(Project.created_at.desc()).all()
    else:
        user = User.query.get(user_id)
        user_team_ids = [t.id for t in user.teams] if user else []
        conditions = [
            Project.stages.any(ProjectStage.assignee_id == user_id),
            Project.stages.any(ProjectStage.assignees.any(User.id == user_id)),
        ]
        if user_team_ids:
            conditions.append(Project.teams.any(Team.id.in_(user_team_ids)))
        projects = Project.query.filter(db.or_(*conditions)).order_by(Project.created_at.desc()).all()


    return jsonify([p.to_list_dict() for p in projects])


@projects_bp.route('/<int:project_id>', methods=['GET'])
@jwt_required()
def get_project(project_id):
    project = Project.query.get_or_404(project_id)
    data = project.to_dict()

    team_stats = []
    teams_in_project = {}
    for stage in project.stages:
        if stage.team_id and stage.team:
            tid = stage.team_id
            if tid not in teams_in_project:
                teams_in_project[tid] = {
                    'team_id': tid,
                    'team_name': stage.team.name,
                    'total_stages': 0,
                    'completed': 0,
                    'on_time': 0,
                    'late': 0,
                    'in_progress': 0,
                    'pending': 0,
                }
            t = teams_in_project[tid]
            t['total_stages'] += 1
            if stage.status == 'completed':
                t['completed'] += 1
                if stage.deadline and stage.completed_at:
                    if stage.completed_at <= stage.deadline:
                        t['on_time'] += 1
                    else:
                        t['late'] += 1
                else:
                    t['on_time'] += 1
            elif stage.status == 'in_progress':
                t['in_progress'] += 1
                if stage.is_overdue:
                    t['late'] += 1
            else:
                t['pending'] += 1

    team_stats = list(teams_in_project.values())

    all_members = set()
    for team in project.teams:
        for m in team.members:
            all_members.add(m.id)

    data['team_stats'] = team_stats
    data['total_participants'] = len(all_members)

    return jsonify(data)


@projects_bp.route('', methods=['POST'])
@jwt_required()
def create_project():
    if not is_admin_role():
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    import json
    if request.content_type and 'multipart' in request.content_type:
        name = request.form.get('name', '').strip()
        description = request.form.get('description', '').strip()
        start_date = request.form.get('start_date')
        deadline = request.form.get('deadline')
        stages_data = json.loads(request.form.get('stages', '[]'))
        files = request.files.getlist('files')
    else:
        data = request.get_json()
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        start_date = data.get('start_date')
        deadline = data.get('deadline')
        stages_data = data.get('stages', [])
        files = []

    if not name:
        return jsonify({'error': 'Loyiha nomi kiritilishi shart'}), 400
    if not stages_data:
        return jsonify({'error': 'Kamida bitta etap kiritilishi shart'}), 400

    project = Project(
        name=name,
        description=description,
        start_date=parse_datetime(start_date) if start_date else None,
        deadline=parse_datetime(deadline) if deadline else None,
        created_by=int(get_jwt_identity()),
    )
    db.session.add(project)
    db.session.flush()

    all_team_ids = set()
    for i, stage_obj in enumerate(stages_data):
        s_name = stage_obj.get('name', '').strip() if isinstance(stage_obj, dict) else str(stage_obj).strip()
        s_deadline = stage_obj.get('deadline') if isinstance(stage_obj, dict) else None
        s_team_id = stage_obj.get('team_id') if isinstance(stage_obj, dict) else None
        s_assignee_id = stage_obj.get('assignee_id') if isinstance(stage_obj, dict) else None
        s_assignee_ids = stage_obj.get('assignee_ids', []) if isinstance(stage_obj, dict) else []
        if s_team_id:
            all_team_ids.add(s_team_id)
        stage = ProjectStage(
            project_id=project.id,
            name=s_name,
            order=i + 1,
            status='in_progress' if i == 0 else 'pending',
            deadline=parse_datetime(s_deadline) if s_deadline else None,
            team_id=s_team_id,
            assignee_id=s_assignee_id,
        )
        for uid in s_assignee_ids:
            u = User.query.get(int(uid))
            if u:
                stage.assignees.append(u)
        db.session.add(stage)

    for tid in all_team_ids:
        team = Team.query.get(tid)
        if team:
            project.teams.append(team)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    for f in files:
        if f.filename:
            ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
            if ext not in ALLOWED_EXTENSIONS:
                continue
            safe_name = f'{uuid.uuid4().hex}.{ext}'
            f.save(os.path.join(UPLOAD_DIR, safe_name))
            attachment = ProjectAttachment(
                project_id=project.id,
                filename=safe_name,
                original_name=f.filename,
                file_size=os.path.getsize(os.path.join(UPLOAD_DIR, safe_name)),
            )
            db.session.add(attachment)

    db.session.commit()
    return jsonify(project.to_dict()), 201


@projects_bp.route('/<int:project_id>', methods=['PUT'])
@jwt_required()
def update_project(project_id):
    if not is_admin_role():
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    project = Project.query.get_or_404(project_id)
    data = request.get_json()

    if 'name' in data:
        project.name = data['name'].strip()
    if 'description' in data:
        project.description = data['description'].strip()
    if 'status' in data:
        project.status = data['status']
    if 'deadline' in data:
        project.deadline = parse_datetime(data['deadline']) if data['deadline'] else None
    if 'team_ids' in data:
        project.teams = []
        for tid in data['team_ids']:
            team = Team.query.get(tid)
            if team:
                project.teams.append(team)

    db.session.commit()
    return jsonify(project.to_dict())


@projects_bp.route('/<int:project_id>', methods=['DELETE'])
@jwt_required()
def delete_project(project_id):
    if not is_admin_role():
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    project = Project.query.get_or_404(project_id)
    for att in project.attachments:
        filepath = os.path.join(UPLOAD_DIR, att.filename)
        if os.path.exists(filepath):
            os.remove(filepath)
    db.session.delete(project)
    db.session.commit()
    return jsonify({'message': 'Loyiha o\'chirildi'})


@projects_bp.route('/<int:project_id>/stages/<int:stage_id>', methods=['PUT'])
@jwt_required()
def update_stage(project_id, stage_id):
    claims = get_jwt()
    user_id = int(get_jwt_identity())
    is_admin = is_any_admin(claims.get('role', ''))

    stage = ProjectStage.query.get_or_404(stage_id)
    data = request.get_json()

    if 'status' in data:
        new_status = data['status']
        now = datetime.now(timezone.utc)

        if not is_admin:
            if new_status == 'review':
                user = User.query.get(user_id)
                user_team_ids = {t.id for t in user.teams} if user else set()
                stage_assignee_ids = {a.id for a in stage.assignees}
                can_submit = (stage.assignee_id == user_id) or (user_id in stage_assignee_ids) or \
                             (not stage.assignee_id and not stage_assignee_ids and stage.team_id in user_team_ids)
                if not can_submit:
                    return jsonify({'error': 'Sizda bu etapni yuborish huquqi yo\'q'}), 403
                if stage.status != 'in_progress':
                    return jsonify({'error': 'Faqat jarayondagi etapni yuborish mumkin'}), 400
            else:
                return jsonify({'error': 'Ruxsat yo\'q'}), 403

        if is_admin:
            if new_status == 'completed' and stage.status != 'review':
                return jsonify({'error': 'Avval xodim bajarildi deb yuborishi kerak'}), 400

        if new_status == 'in_progress' and not stage.started_at:
            stage.started_at = now
        if new_status == 'completed':
            stage.completed_at = now
            next_stage = ProjectStage.query.filter_by(
                project_id=project_id, order=stage.order + 1
            ).first()
            if next_stage and next_stage.status == 'pending':
                next_stage.status = 'in_progress'
                next_stage.started_at = now

        stage.status = new_status

    if is_admin:
        if 'name' in data:
            stage.name = data['name'].strip()
        if 'deadline' in data:
            stage.deadline = parse_datetime(data['deadline']) if data['deadline'] else None
        if 'team_id' in data:
            stage.team_id = data['team_id'] or None
        if 'assignee_id' in data:
            stage.assignee_id = data['assignee_id'] or None
        if 'assignee_ids' in data:
            stage.assignees = []
            for uid in data['assignee_ids']:
                u = User.query.get(int(uid))
                if u:
                    stage.assignees.append(u)

    db.session.commit()

    project = Project.query.get(project_id)
    return jsonify(project.to_dict())


@projects_bp.route('/<int:project_id>/stages', methods=['POST'])
@jwt_required()
def add_stage(project_id):
    if not is_admin_role():
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    project = Project.query.get_or_404(project_id)
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Bosqich nomi kiritilishi shart'}), 400

    max_order = max((s.order for s in project.stages), default=0)
    stage = ProjectStage(
        project_id=project_id,
        name=name,
        order=max_order + 1,
        status='pending',
        deadline=parse_datetime(data['deadline']) if data.get('deadline') else None,
        team_id=data.get('team_id') or None,
        assignee_id=data.get('assignee_id') or None,
    )
    for uid in data.get('assignee_ids', []):
        u = User.query.get(int(uid))
        if u:
            stage.assignees.append(u)

    if data.get('team_id'):
        team = Team.query.get(data['team_id'])
        if team and team not in project.teams:
            project.teams.append(team)

    db.session.add(stage)
    db.session.commit()
    return jsonify(project.to_dict()), 201


@projects_bp.route('/<int:project_id>/stages/<int:stage_id>', methods=['DELETE'])
@jwt_required()
def delete_stage(project_id, stage_id):
    if not is_admin_role():
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    project = Project.query.get_or_404(project_id)
    if len(project.stages) <= 1:
        return jsonify({'error': 'Kamida bitta bosqich bo\'lishi kerak'}), 400

    stage = ProjectStage.query.get_or_404(stage_id)
    db.session.delete(stage)
    db.session.flush()

    remaining = ProjectStage.query.filter_by(project_id=project_id).order_by(ProjectStage.order).all()
    for i, s in enumerate(remaining):
        s.order = i + 1

    db.session.commit()
    return jsonify(project.to_dict())


@projects_bp.route('/<int:project_id>/reports', methods=['GET'])
@jwt_required()
def get_reports(project_id):
    reports = DailyReport.query.filter_by(project_id=project_id)\
        .order_by(DailyReport.created_at.desc()).all()
    return jsonify([r.to_dict() for r in reports])


@projects_bp.route('/<int:project_id>/reports', methods=['POST'])
@jwt_required()
def create_report(project_id):
    user_id = int(get_jwt_identity())
    claims = get_jwt()

    content = request.form.get('content', '').strip() if request.content_type and 'multipart' in request.content_type else request.get_json().get('content', '').strip() if request.is_json else ''
    stage_id = request.form.get('stage_id') if request.content_type and 'multipart' in request.content_type else request.get_json().get('stage_id') if request.is_json else None

    if not content:
        return jsonify({'error': 'Hisobot matni kiritilishi shart'}), 400

    if is_any_admin(claims.get('role', '')):
        return jsonify({'error': 'Admin hisobot topshira olmaydi'}), 403

    project = Project.query.get_or_404(project_id)
    user = User.query.get(user_id)
    user_team_ids = {t.id for t in user.teams} if user else set()
    assignee_stages = [s for s in project.stages if s.assignee_id == user_id or user_id in {a.id for a in s.assignees}]
    stages_no_assignee = [s for s in project.stages if not s.assignee_id and not s.assignees and s.team_id in user_team_ids]

    can_report = len(assignee_stages) > 0 or len(stages_no_assignee) > 0
    if not can_report:
        return jsonify({'error': 'Sizda hisobot topshirish huquqi yo\'q'}), 403

    report = DailyReport(
        project_id=project_id,
        user_id=user_id,
        content=content,
        stage_id=stage_id if stage_id else None,
    )
    db.session.add(report)
    db.session.flush()

    report_upload_dir = os.path.join(UPLOAD_DIR, 'reports')
    os.makedirs(report_upload_dir, exist_ok=True)

    files = request.files.getlist('files')
    for f in files:
        if f and f.filename:
            ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
            if ext not in ALLOWED_EXTENSIONS:
                continue
            saved_name = f"{uuid.uuid4().hex}.{ext}"
            f.save(os.path.join(report_upload_dir, saved_name))
            attachment = ReportAttachment(
                report_id=report.id,
                filename=saved_name,
                original_name=f.filename,
                file_size=f.content_length or 0,
            )
            db.session.add(attachment)

    db.session.commit()
    return jsonify(report.to_dict()), 201


@projects_bp.route('/files/<filename>', methods=['GET'])
@jwt_required()
def download_file(filename):
    return send_from_directory(UPLOAD_DIR, filename, as_attachment=True)


@projects_bp.route('/report-files/<filename>', methods=['GET'])
@jwt_required()
def download_report_file(filename):
    report_upload_dir = os.path.join(UPLOAD_DIR, 'reports')
    return send_from_directory(report_upload_dir, filename, as_attachment=True)


@projects_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_stats():
    if not is_admin_role():
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    total = Project.query.count()
    active = Project.query.filter_by(status='active').count()
    completed = Project.query.filter_by(status='completed').count()
    on_hold = Project.query.filter_by(status='on_hold').count()

    team_performance = {}
    all_stages = ProjectStage.query.filter(ProjectStage.team_id.isnot(None)).all()
    for stage in all_stages:
        tid = stage.team_id
        if tid not in team_performance:
            team = Team.query.get(tid)
            team_performance[tid] = {
                'team_id': tid,
                'team_name': team.name if team else '?',
                'total': 0,
                'completed': 0,
                'on_time': 0,
                'late': 0,
            }
        tp = team_performance[tid]
        tp['total'] += 1
        if stage.status == 'completed':
            tp['completed'] += 1
            if stage.deadline and stage.completed_at and stage.completed_at <= stage.deadline:
                tp['on_time'] += 1
            elif stage.deadline and stage.completed_at and stage.completed_at > stage.deadline:
                tp['late'] += 1
            else:
                tp['on_time'] += 1

    return jsonify({
        'total': total,
        'active': active,
        'completed': completed,
        'on_hold': on_hold,
        'team_performance': list(team_performance.values()),
    })


@projects_bp.route('/full-stats', methods=['GET'])
@jwt_required()
def get_full_stats():
    if not is_admin_role():
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    projects = Project.query.all()
    all_stages = ProjectStage.query.filter(ProjectStage.team_id.isnot(None)).all()

    team_perf = {}
    for stage in all_stages:
        tid = stage.team_id
        if tid not in team_perf:
            team = Team.query.get(tid)
            team_perf[tid] = {
                'team_id': tid,
                'team_name': team.name if team else '?',
                'member_count': len(team.members) if team else 0,
                'total_stages': 0,
                'completed': 0,
                'on_time': 0,
                'late': 0,
                'in_progress': 0,
                'avg_days': [],
            }
        tp = team_perf[tid]
        tp['total_stages'] += 1
        if stage.status == 'completed':
            tp['completed'] += 1
            if stage.started_at and stage.completed_at:
                sa = stage.started_at.replace(tzinfo=None) if stage.started_at.tzinfo else stage.started_at
                ca = stage.completed_at.replace(tzinfo=None) if stage.completed_at.tzinfo else stage.completed_at
                tp['avg_days'].append((ca - sa).days)
            if stage.deadline and stage.completed_at:
                dl = stage.deadline.replace(tzinfo=None) if stage.deadline.tzinfo else stage.deadline
                ca2 = stage.completed_at.replace(tzinfo=None) if stage.completed_at.tzinfo else stage.completed_at
                if ca2 <= dl:
                    tp['on_time'] += 1
                else:
                    tp['late'] += 1
            else:
                tp['on_time'] += 1
        elif stage.status in ('in_progress', 'review'):
            tp['in_progress'] += 1

    for tp in team_perf.values():
        days = tp.pop('avg_days')
        tp['avg_completion_days'] = round(sum(days) / len(days), 1) if days else 0

    project_stats = []
    for p in projects:
        project_stats.append({
            'id': p.id,
            'name': p.name,
            'status': p.status,
            'start_date': p.start_date.isoformat() if p.start_date else None,
            'deadline': p.deadline.isoformat() if p.deadline else None,
            'progress': p.progress_percent(),
            'stage_count': len(p.stages),
            'completed_stages': sum(1 for s in p.stages if s.status == 'completed'),
            'teams': [{'id': t.id, 'name': t.name} for t in p.teams],
            'total_reports': len(p.reports),
        })

    return jsonify({
        'team_performance': list(team_perf.values()),
        'projects': project_stats,
        'total_projects': len(projects),
        'active_projects': sum(1 for p in projects if p.status == 'active'),
        'completed_projects': sum(1 for p in projects if p.status == 'completed'),
    })


@projects_bp.route('/<int:project_id>/stages/<int:stage_id>/substages', methods=['GET'])
@jwt_required()
def get_substages(project_id, stage_id):
    stage = ProjectStage.query.get_or_404(stage_id)
    return jsonify([ss.to_dict() for ss in sorted(stage.sub_stages, key=lambda x: x.order)])


@projects_bp.route('/<int:project_id>/stages/<int:stage_id>/substages', methods=['POST'])
@jwt_required()
def create_substage(project_id, stage_id):
    user_id = int(get_jwt_identity())
    stage = ProjectStage.query.get_or_404(stage_id)

    claims = get_jwt()
    is_admin = is_any_admin(claims.get('role', ''))

    if not is_admin:
        user = User.query.get(user_id)
        user_team_ids = {t.id for t in user.teams} if user else set()
        stage_assignee_ids = {a.id for a in stage.assignees}
        can_manage = (stage.assignee_id == user_id) or (user_id in stage_assignee_ids) or \
                     (not stage.assignee_id and not stage_assignee_ids and stage.team_id in user_team_ids)
        if not can_manage:
            return jsonify({'error': 'Sizda ichki etap yaratish huquqi yo\'q'}), 403

    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Ichki etap nomi kiritilishi shart'}), 400

    max_order = max([ss.order for ss in stage.sub_stages], default=0)
    sub = SubStage(
        stage_id=stage_id,
        name=name,
        order=max_order + 1,
        status='pending' if stage.sub_stages else 'in_progress',
        created_by=user_id,
    )
    db.session.add(sub)
    db.session.commit()

    project = Project.query.get(project_id)
    return jsonify(project.to_dict()), 201


@projects_bp.route('/<int:project_id>/stages/<int:stage_id>/substages/<int:sub_id>', methods=['PUT'])
@jwt_required()
def update_substage(project_id, stage_id, sub_id):
    user_id = int(get_jwt_identity())
    sub = SubStage.query.get_or_404(sub_id)
    stage = ProjectStage.query.get_or_404(stage_id)
    claims = get_jwt()
    is_admin = is_any_admin(claims.get('role', ''))

    if not is_admin:
        user = User.query.get(user_id)
        user_team_ids = {t.id for t in user.teams} if user else set()
        stage_assignee_ids = {a.id for a in stage.assignees}
        can_manage = (stage.assignee_id == user_id) or (user_id in stage_assignee_ids) or \
                     (not stage.assignee_id and not stage_assignee_ids and stage.team_id in user_team_ids)
        if not can_manage:
            return jsonify({'error': 'Ruxsat yo\'q'}), 403

    data = request.get_json()
    if 'status' in data:
        now = datetime.now(timezone.utc)
        new_status = data['status']
        if new_status == 'completed':
            sub.completed_at = now
            next_sub = SubStage.query.filter_by(stage_id=stage_id, order=sub.order + 1).first()
            if next_sub and next_sub.status == 'pending':
                next_sub.status = 'in_progress'
        elif new_status == 'in_progress':
            sub.completed_at = None
        sub.status = new_status
    if 'name' in data:
        sub.name = data['name'].strip()

    db.session.commit()
    project = Project.query.get(project_id)
    return jsonify(project.to_dict())


@projects_bp.route('/<int:project_id>/stages/<int:stage_id>/substages/<int:sub_id>', methods=['DELETE'])
@jwt_required()
def delete_substage(project_id, stage_id, sub_id):
    user_id = int(get_jwt_identity())
    sub = SubStage.query.get_or_404(sub_id)
    stage = ProjectStage.query.get_or_404(stage_id)
    claims = get_jwt()
    is_admin = is_any_admin(claims.get('role', ''))

    if not is_admin:
        user = User.query.get(user_id)
        user_team_ids = {t.id for t in user.teams} if user else set()
        stage_assignee_ids = {a.id for a in stage.assignees}
        can_manage = (stage.assignee_id == user_id) or (user_id in stage_assignee_ids) or \
                     (not stage.assignee_id and not stage_assignee_ids and stage.team_id in user_team_ids)
        if not can_manage:
            return jsonify({'error': 'Ruxsat yo\'q'}), 403

    db.session.delete(sub)
    remaining = SubStage.query.filter_by(stage_id=stage_id).order_by(SubStage.order).all()
    for i, ss in enumerate(remaining):
        ss.order = i + 1
    db.session.commit()

    project = Project.query.get(project_id)
    return jsonify(project.to_dict())
