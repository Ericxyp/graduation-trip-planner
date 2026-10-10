import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ToastProvider } from './components/Toast'
import { useRoute } from './router'
import { PageSkeleton } from './cloud/ui'

// 云端页面按需加载，演示首页的首屏体积不受影响
const CreateTripPage = lazy(() => import('./cloud/CreateTripPage'))
const JoinTripPage = lazy(() => import('./cloud/JoinTripPage'))
const TripPage = lazy(() => import('./cloud/TripPage'))
const NotFoundPage = lazy(() => import('./cloud/NotFoundPage'))
const RecoverPage = lazy(() => import('./cloud/RecoverPage'))

function Root() {
  const route = useRoute()
  if (route.name === 'demo') return <App />
  return (
    <Suspense fallback={<PageSkeleton />}>
      {route.name === 'create' && <CreateTripPage />}
      {route.name === 'join' && <JoinTripPage key={route.slug} slug={route.slug} />}
      {route.name === 'trip' && <TripPage key={route.slug} slug={route.slug} />}
      {route.name === 'recover' && <RecoverPage key={route.slug ?? ''} slug={route.slug} />}
      {route.name === 'notfound' && <NotFoundPage />}
    </Suspense>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <Root />
    </ToastProvider>
  </StrictMode>,
)
