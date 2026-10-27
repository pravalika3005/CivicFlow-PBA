import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { OptionsProvider } from './components/OptionsContext'
import { EmptyState } from './components/ui'
import Dashboard from './pages/Dashboard'
import SubmitComplaint from './pages/SubmitComplaint'
import Complaints from './pages/Complaints'
import ComplaintDetail from './pages/ComplaintDetail'
import VideoReview from './pages/VideoReview'

function NotFound() {
  return (
    <EmptyState
      title="This page does not exist"
      action={
        <Link className="btn btn-primary" to="/">
          Go to the dashboard
        </Link>
      }
    >
      Check the address, or use the menu to find what you need.
    </EmptyState>
  )
}

export default function App() {
  return (
    <OptionsProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="submit" element={<SubmitComplaint />} />
          <Route path="complaints" element={<Complaints />} />
          <Route path="complaints/:id" element={<ComplaintDetail />} />
          <Route path="video-review" element={<VideoReview />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </OptionsProvider>
  )
}
