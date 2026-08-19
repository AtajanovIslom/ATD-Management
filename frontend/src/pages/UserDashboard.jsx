import { useI18n } from '../i18n'
import ProjectsPanel from '../components/ProjectsPanel'
import TasksPanel from '../components/TasksPanel'

/**
 * Xodim paneli — o'ziga biriktirilgan loyihalar va vazifalar, ikkita alohida
 * bo'limda. Har biri o'z holat oynalari (Faol / Tugallangan / Bekor qilingan)
 * bilan; ro'yxat backendda xodimning ko'rish doirasi bo'yicha filtrlanadi.
 */
export default function UserDashboard() {
  const { t } = useI18n()

  return (
    <div>
      <div className="page-header">
        <h1>{t('dash.title')}</h1>
      </div>

      <ProjectsPanel title={t('dash.myProjects')} />
      <TasksPanel title={t('dash.myTasks')} />
    </div>
  )
}
