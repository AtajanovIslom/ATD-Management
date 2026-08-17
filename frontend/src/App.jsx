import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useI18n } from './i18n'
import Login from './pages/Login'
import Register from './pages/Register'
import SignUp from './pages/SignUp'
import AdminDashboard from './pages/AdminDashboard'
import CreateProject from './pages/CreateProject'
import ManageUsers from './pages/ManageUsers'
import ManageTeams from './pages/ManageTeams'
import ManageDepartments from './pages/ManageDepartments'
import ManageRoles from './pages/ManageRoles'
import ProjectDetail from './pages/ProjectDetail'
import Projects from './pages/Projects'
import Tasks from './pages/Tasks'
import CreateTask from './pages/CreateTask'
import TaskDetail from './pages/TaskDetail'
import UserDashboard from './pages/UserDashboard'
import Statistics from './pages/Statistics'
import InteractiveServicesAdmin from './pages/InteractiveServicesAdmin'
import InteractiveRequests from './pages/InteractiveRequests'
import AuditLogs from './pages/AuditLogs'
import Reminders from './pages/Reminders'
import WorkLogs from './pages/WorkLogs'
import DepartmentWorkLogs from './pages/DepartmentWorkLogs'
import ReminderNotification from './components/ReminderNotification'
import TaskNotifier from './components/TaskNotifier'
import Navbar from './components/Navbar'

export default function App() {
  const { user, isDeptAdmin, canView, pages, pagesLoaded, home } = useAuth()
  const { t } = useI18n()

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/register/:token" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    )
  }

  // Ruxsatlar hali kelmagan bo'lsa kutamiz — aks holda "/" ga noto'g'ri
  // yo'naltirish bo'lib, bosh sahifasi "/" bo'lmagan rol (agent) sakrab ketardi
  if (!pagesLoaded) {
    return <div className="loading">...</div>
  }

  // Rolga birorta sahifa qoldirilmagan bo'lsa — ochiq marshrut yo'q, ya'ni
  // "*" qoidasi o'zini o'ziga yo'naltirib sikl hosil qilardi. Shuning uchun
  // marshrutlarni umuman chizmay, tushunarli xabar ko'rsatamiz.
  if (pages.length === 0) {
    return (
      <div className="app-layout">
        <Navbar />
        <main className="main-content">
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <h2 style={{ marginBottom: 8 }}>🔒</h2>
            <p style={{ color: 'var(--text-muted)' }}>{t('pages.noAccess')}</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app-layout">
      <Navbar />
      <ReminderNotification />
      <TaskNotifier />
      <main className="main-content">
        <Routes>
          <Route path="/register/:token" element={<Register />} />

          {/* Qaysi rol qaysi sahifani ko'rishi — rol ↔ sahifa matritsasidan
              (backend: utils.DEFAULT_ROLE_PAGES + role_pages jadvali).
              Bosh Administrator uni /roles sahifasidan o'zgartiradi. */}

          {canView('dashboard') && (
            <Route path="/" element={isDeptAdmin ? <AdminDashboard /> : <UserDashboard />} />
          )}
          {/* Loyihalar va Vazifalar — holat bo'yicha alohida oynalar bilan.
              Ro'yxat backend'da rol scope'i bo'yicha filtrlanadi. */}
          {canView('projects') && <Route path="/projects" element={<Projects />} />}
          {canView('tasks') && <Route path="/tasks" element={<Tasks />} />}
          {canView('reminders') && <Route path="/reminders" element={<Reminders />} />}
          {canView('work_logs') && <Route path="/work-logs" element={<WorkLogs />} />}
          {canView('department_work_logs') && (
            <Route path="/department-work-logs" element={<DepartmentWorkLogs />} />
          )}
          {canView('statistics') && <Route path="/statistics" element={<Statistics />} />}
          {canView('create_project') && <Route path="/create-project" element={<CreateProject />} />}
          {canView('create_task') && <Route path="/create-task" element={<CreateTask />} />}
          {canView('teams') && <Route path="/teams" element={<ManageTeams />} />}
          {canView('departments') && <Route path="/departments" element={<ManageDepartments />} />}
          {canView('users') && <Route path="/users" element={<ManageUsers />} />}
          {canView('interactive_services') && (
            <Route path="/interactive-services" element={<InteractiveServicesAdmin />} />
          )}
          {canView('interactive_requests') && (
            <Route path="/interactive-requests" element={<InteractiveRequests />} />
          )}
          {canView('roles') && <Route path="/roles" element={<ManageRoles />} />}
          {canView('audit_logs') && <Route path="/audit-logs" element={<AuditLogs />} />}

          {/* Loyiha/vazifa tafsilotlari — havola orqali ochiladi, alohida
              menyu bandi emas, shuning uchun barcha rollarda mavjud */}
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />

          {/* Noma'lum manzil — rolning bosh sahifasiga (agent uchun bu "/" emas) */}
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>
    </div>
  )
}
