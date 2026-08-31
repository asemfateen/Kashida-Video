import { lazy, Suspense } from 'react'

// Lazy-load the template manager + editor so the initial bundle stays small
// (important on a low-power server). The code generator is also lazy (export).
const TemplateList = lazy(() => import('./components/TemplateList'))

function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg">
      <img src="/logo.png" alt="Kashida" className="h-12 w-auto animate-pulse" />
      <div className="text-[13px] text-slate-500">Loading Kashida Studio…</div>
    </div>
  )
}

export default function App() {
  return (
    <div className="h-full">
      <Suspense fallback={<Splash />}>
        <TemplateList />
      </Suspense>
    </div>
  )
}
