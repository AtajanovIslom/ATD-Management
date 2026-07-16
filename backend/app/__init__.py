from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from werkzeug.security import generate_password_hash

db = SQLAlchemy()
jwt = JWTManager()


def create_app():
    app = Flask(__name__)
    app.config.from_object('app.config.Config')

    db.init_app(app)
    jwt.init_app(app)
    CORS(app)

    from app.routes.auth import auth_bp
    from app.routes.users import users_bp
    from app.routes.teams import teams_bp
    from app.routes.projects import projects_bp
    from app.routes.tasks import tasks_bp
    from app.routes.stats import stats_bp
    from app.routes.departments import departments_bp
    from app.routes.divisions import divisions_bp
    from app.routes.permissions import permissions_bp
    from app.routes.service_requests import service_bp, public_bp
    from app.routes.interactive_services import interactive_bp
    from app.routes.interactive_requests import interactive_public_bp, interactive_req_bp
    from app.routes.audit import audit_bp
    from app.routes.reminders import reminders_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(users_bp, url_prefix='/api/users')
    app.register_blueprint(teams_bp, url_prefix='/api/teams')
    app.register_blueprint(projects_bp, url_prefix='/api/projects')
    app.register_blueprint(tasks_bp, url_prefix='/api/tasks')
    app.register_blueprint(stats_bp, url_prefix='/api/stats')
    app.register_blueprint(departments_bp, url_prefix='/api/departments')
    app.register_blueprint(divisions_bp, url_prefix='/api/divisions')
    app.register_blueprint(permissions_bp, url_prefix='/api/permissions')
    app.register_blueprint(service_bp, url_prefix='/api/service-requests')
    app.register_blueprint(public_bp, url_prefix='/api/public')
    app.register_blueprint(interactive_bp, url_prefix='/api/interactive')
    app.register_blueprint(interactive_public_bp, url_prefix='/api/public/interactive')
    app.register_blueprint(interactive_req_bp, url_prefix='/api/interactive-requests')
    app.register_blueprint(audit_bp, url_prefix='/api/audit-logs')
    app.register_blueprint(reminders_bp, url_prefix='/api/reminders')

    with app.app_context():
        from app.models import User
        db.create_all()

        migrations = [
            "ALTER TABLE project_stages ADD COLUMN IF NOT EXISTS deadline TIMESTAMP",
            "ALTER TABLE project_stages ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id)",
            "ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date TIMESTAMP",
            "ALTER TABLE project_stages ADD COLUMN IF NOT EXISTS assignee_id INTEGER REFERENCES users(id)",
            "ALTER TABLE report_attachments ALTER COLUMN report_id DROP NOT NULL",
            "ALTER TABLE report_attachments ADD COLUMN IF NOT EXISTS task_report_id INTEGER REFERENCES task_reports(id)",
            "ALTER TABLE users ALTER COLUMN login DROP NOT NULL",
            "ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_token VARCHAR(64) UNIQUE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS division_id INTEGER REFERENCES divisions(id)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id)",
            "ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)",
            "ALTER TABLE teams ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id)",
            "ALTER TABLE divisions ADD COLUMN IF NOT EXISTS is_service_provider BOOLEAN DEFAULT FALSE",
            "ALTER TABLE divisions ADD COLUMN IF NOT EXISTS service_api_key VARCHAR(64)",
            "CREATE TABLE IF NOT EXISTS service_departments (id SERIAL PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW())",
            "CREATE TABLE IF NOT EXISTS service_types (id SERIAL PRIMARY KEY, department_id INTEGER NOT NULL REFERENCES service_departments(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW())",
            "CREATE INDEX IF NOT EXISTS idx_service_types_dept ON service_types(department_id)",
            """CREATE TABLE IF NOT EXISTS interactive_requests (
                id SERIAL PRIMARY KEY,
                tracking_id VARCHAR(32) UNIQUE NOT NULL,
                phone_num VARCHAR(30) NOT NULL,
                tabel_num VARCHAR(50) NOT NULL,
                department_id INTEGER NOT NULL REFERENCES service_departments(id),
                type_id INTEGER NOT NULL REFERENCES service_types(id),
                comment TEXT DEFAULT '',
                status VARCHAR(20) DEFAULT 'new',
                assigned_to INTEGER REFERENCES users(id),
                assigned_by INTEGER REFERENCES users(id),
                result_note TEXT DEFAULT '',
                reject_reason TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT NOW(),
                assigned_at TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP
            )""",
            "CREATE INDEX IF NOT EXISTS idx_ireq_status ON interactive_requests(status)",
            "CREATE INDEX IF NOT EXISTS idx_ireq_dept ON interactive_requests(department_id)",
            "CREATE INDEX IF NOT EXISTS idx_ireq_assigned ON interactive_requests(assigned_to)",
            "CREATE INDEX IF NOT EXISTS idx_ireq_created ON interactive_requests(created_at)",
            """CREATE TABLE IF NOT EXISTS interactive_request_history (
                id SERIAL PRIMARY KEY,
                request_id INTEGER NOT NULL REFERENCES interactive_requests(id) ON DELETE CASCADE,
                status VARCHAR(20) NOT NULL,
                actor_id INTEGER REFERENCES users(id),
                actor_name VARCHAR(255) DEFAULT '',
                note TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS idx_ireq_hist_req ON interactive_request_history(request_id)",
            # M2M — bir arizada bir nechta xizmat turi
            """CREATE TABLE IF NOT EXISTS interactive_request_types (
                request_id INTEGER NOT NULL REFERENCES interactive_requests(id) ON DELETE CASCADE,
                type_id INTEGER NOT NULL REFERENCES service_types(id),
                PRIMARY KEY (request_id, type_id)
            )""",
            # Eski `type_id` maydonini backfill qilamiz (agar mavjud bo'lsa)
            """INSERT INTO interactive_request_types (request_id, type_id)
                SELECT id, type_id FROM interactive_requests
                WHERE type_id IS NOT NULL
                ON CONFLICT DO NOTHING""",
            "ALTER TABLE interactive_requests ALTER COLUMN type_id DROP NOT NULL",
            "ALTER TABLE interactive_requests ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'public'",
            "ALTER TABLE interactive_requests ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id)",
            "ALTER TABLE interactive_requests ADD COLUMN IF NOT EXISTS submitted_review_at TIMESTAMP",
            "ALTER TABLE interactive_requests ADD COLUMN IF NOT EXISTS return_count INTEGER DEFAULT 0",
            "CREATE INDEX IF NOT EXISTS idx_ireq_tabel ON interactive_requests(tabel_num)",
            "ALTER TABLE interactive_requests ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT ''",
            "ALTER TABLE interactive_requests ADD COLUMN IF NOT EXISTS position TEXT DEFAULT ''",
            "ALTER TABLE interactive_requests ADD COLUMN IF NOT EXISTS division TEXT DEFAULT ''",
            """CREATE TABLE IF NOT EXISTS reminders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                remind_date DATE NOT NULL,
                message TEXT NOT NULL,
                is_completed BOOLEAN DEFAULT FALSE,
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS idx_reminders_user_date ON reminders(user_id, remind_date)",
            "CREATE INDEX IF NOT EXISTS idx_reminders_completed ON reminders(is_completed)",
            # Audit log
            """CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                user_name VARCHAR(255) DEFAULT '',
                user_role VARCHAR(30) DEFAULT '',
                action VARCHAR(50) NOT NULL,
                entity_type VARCHAR(80) NOT NULL,
                entity_id INTEGER,
                entity_label TEXT DEFAULT '',
                details TEXT DEFAULT '',
                ip_address VARCHAR(50) DEFAULT '',
                created_at TIMESTAMP DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id)",
            "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)",
            "CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)",
            "ALTER TABLE users ALTER COLUMN department SET DEFAULT ''",
        ]
        for sql in migrations:
            try:
                db.session.execute(db.text(sql))
            except Exception:
                db.session.rollback()
        db.session.commit()

        if not User.query.filter(User.role.in_(['admin', 'superadmin'])).first():
            db.session.add(User(
                full_name='Buriyev Abdumalik Abdurahmatovich',
                department='Boshqaruv', tab_number='A001',
                login='admin2', password_hash=generate_password_hash('admin123'),
                plain_password='admin123', role='superadmin',
            ))
            db.session.add(User(
                full_name='Atajanov Islom',
                department='Boshqaruv', tab_number='A002',
                login='admin', password_hash=generate_password_hash('atajanov123'),
                plain_password='atajanov123', role='superadmin',
            ))
            db.session.commit()
            print("Boshlang'ich superadminlar yaratildi: admin2/admin123, admin/atajanov123")
        else:
            # Mavjud adminlarni superadmin ga o'tkazamiz (bir martalik migration)
            try:
                db.session.execute(db.text(
                    "UPDATE users SET role='superadmin' WHERE login IN ('admin', 'admin2') AND role='admin'"
                ))
                db.session.commit()
            except Exception:
                db.session.rollback()

    return app
