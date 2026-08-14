// O'zbekcha lug'at — bo'limlar bitta yassi obyektga birlashtiriladi
import common from './common'
import nav from './nav'
import auth from './auth'
import components from './components'
import dashboard from './dashboard'
import project from './project'
import task from './task'
import manage from './manage'
import worklog from './worklog'
import reminder from './reminder'
import interactive from './interactive'

export default {
  ...common,
  ...nav,
  ...auth,
  ...components,
  ...dashboard,
  ...project,
  ...task,
  ...manage,
  ...worklog,
  ...reminder,
  ...interactive,
}
