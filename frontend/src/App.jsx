import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
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
import Navbar from './components/Navbar'

export default function App() {
  const { user, isAdmin, isDeptAdmin, isSuperAdmin, canManageRoles, can } = useAuth()

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

  return (
    <div className="app-layout">
      <Navbar />
      <ReminderNotification />
      <main className="main-content">
        <Routes>
          <Route path="/register/:token" element={<Register />} />

          {/* Interaktiv xizmatlar Admin — faqat admin darajasidagilar uchun */}
          {isAdmin && (
            <Route path="/interactive-services" element={<InteractiveServicesAdmin />} />
          )}

          {/* Interaktiv arizalar — hamma rol (backend scope bilan filter qiladi) */}
          <Route path="/interactive-requests" element={<InteractiveRequests />} />

          {/* Eslatmalarim — barcha foydalanuvchilar uchun */}
          <Route path="/reminders" element={<Reminders />} />

          {/* Kunlik hisobot — barcha xodimlar uchun */}
          <Route path="/work-logs" element={<WorkLogs />} />

          {/* Xodimlar hisobotlari — boshqarma/bo'lim rahbari uchun */}
          {isDeptAdmin && (
            <Route path="/department-work-logs" element={<DepartmentWorkLogs />} />
          )}

          {/* Audit jurnali — faqat superadmin/director/deputy_director */}
          {isSuperAdmin && (
            <Route path="/audit-logs" element={<AuditLogs />} />
          )}

          {/* Super Admin — hamma sahifalar */}
          {isSuperAdmin && (
            <>
              <Route path="/" element={<AdminDashboard />} />
              <Route path="/create-project" element={<CreateProject />} />
              <Route path="/create-task" element={<CreateTask />} />
              <Route path="/users" element={<ManageUsers />} />
              <Route path="/teams" element={<ManageTeams />} />
              <Route path="/departments" element={<ManageDepartments />} />
              {canManageRoles && <Route path="/roles" element={<ManageRoles />} />}
              <Route path="/statistics" element={<Statistics />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/tasks/:id" element={<TaskDetail />} />
            </>
          )}

          {/* Admin (Boshqarma rahbari) */}
          {!isSuperAdmin && isAdmin && (
            <>
              <Route path="/" element={<AdminDashboard />} />
              <Route path="/create-project" element={<CreateProject />} />
              <Route path="/create-task" element={<CreateTask />} />
              <Route path="/users" element={<ManageUsers />} />
              <Route path="/teams" element={<ManageTeams />} />
              <Route path="/departments" element={<ManageDepartments />} />
              <Route path="/statistics" element={<Statistics />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/tasks/:id" element={<TaskDetail />} />
            </>
          )}

          {/* Department Admin (Bo'lim rahbari) */}
          {!isAdmin && isDeptAdmin && (
            <>
              <Route path="/" element={<AdminDashboard />} />
              <Route path="/create-task" element={<CreateTask />} />
              <Route path="/users" element={<ManageUsers />} />
              <Route path="/statistics" element={<Statistics />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/tasks/:id" element={<TaskDetail />} />
            </>
          )}

          {/* User (Xodim) */}
          {!isDeptAdmin && (
            <>
              <Route path="/" element={<UserDashboard />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/tasks/:id" element={<TaskDetail />} />
            </>
          )}

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  )
}
